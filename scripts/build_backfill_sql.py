"""
Generates supabase/migrations/0003_backfill_staging.sql.

Two sources go into staging:

  * the Jan-Oct 2026 backfill pack (311 rows, historical reconstruction)
  * the August 2026 Physiology Observatory workbook (higher fidelity: it has
    sets, reps, quality, straps, failure modes, gym and order-vs-snatch)

Where both describe the same day AND the same discipline, the workbook wins and
the backfill rows for that pair are marked `superseded` — kept, never deleted.
Supersession is computed per (date, discipline), not per date window: the
backfill holds August dates the workbook never covered, and a window rule would
have buried them.

Nothing here writes to the performance tables. Staging only.

Every source value must map to a seeded identity. An unmapped value raises
rather than being silently dropped or guessed.
"""

from __future__ import annotations

import json
import re
import sys
import warnings
from collections import defaultdict
from datetime import date, datetime
from pathlib import Path

warnings.filterwarnings("ignore")
import openpyxl  # noqa: E402

BACKFILL_JSONL = Path(sys.argv[1])
WORKBOOK_XLSX = Path(sys.argv[2])
OUT_SQL = Path(sys.argv[3])

BACKFILL_BATCH = "backfill-pack-v0.1"
WORKBOOK_BATCH = "august-2026-workbook"

DISCIPLINE_OF_TABLE = {
    "snatch_observations": "snatch",
    "hypertrophy_observations": "hypertrophy",
    "calisthenics_observations": "calisthenics",
}

# Known conflicts named in the pack's README. Flagged, never reconciled.
KNOWN_CONFLICTS = {
    "2026-05-17": "Counts differ between an earlier and a later report of this session.",
    "2026-05-05": "Session-wide success totals conflict.",
    "2026-08-11": "Reported aggregate stood totals do not fully reconcile with per-load counts.",
}

# --- value mappings -------------------------------------------------------
# The only snatch variation whose source spelling differs from the seeded slug.
SNATCH_VARIATION = {"pull": "snatch_pull"}

# Likewise for skills.
SKILL_VARIATION = {"barbell_drill_20kg": "barbell_warmup_drill"}

GYM_SLUG = {
    "Greenford": "greenford",
    "White City": "white_city",
    "Shepherd's Bush": "shepherds_bush",
    "Ealing": "ealing",
}

FAILURE_MODE = {
    "Conversion / drop": "conversion_drop",
    "Conversion": "conversion_drop",
    "Caught then dropped": "caught_then_dropped",
    "Drop/front": "drop_front",
    "Stable squat; no stand": "stable_squat_no_stand",
    "Unstable overhead squat": "unstable_overhead_squat",
}

TECHNICAL_CUE = {
    "Strong turnover + stand": "strong_turnover_and_stand",
    "Quality / standing": "quality_and_standing",
    "Catch strength/stability": "catch_strength_stability",
    "Overhead catch/stability": "overhead_catch_stability",
    "Cooldown": "cooldown",
}

# Workbook (Skill, Variation) -> seeded skill_variation slug, assistance slug.
WORKBOOK_SKILL = {
    ("Handstand", "Freestanding / wall start"): ("freestanding_handstand", "wall_start"),
    ("L-sit to HSPU", "Unassisted attempts"): ("l_sit_to_handstand_pushup", "none"),
    ("L-sit to HSPU", "Banded"): ("banded_l_sit_to_handstand_pushup", "band"),
    ("Back lever", "Attempts"): ("back_lever_attempt", "none"),
    ("Handstand push-up", "Banded"): ("banded_handstand_pushup", "band"),
    ("L-sit to handstand", "Assisted / practice"): ("controlled_l_sit_to_handstand", "other"),
}

ASSISTANCE = {
    "Wall start": "wall_start",
    "None": "none",
    "Band": "band",
}

ORDER_VS_SNATCH = {
    "Before snatch": "before_snatch",
    "After snatch": "after_snatch",
}

# Recovery metrics that belong to an injury rather than to daily_metrics.
INJURY_METRIC = {
    "knee_discomfort": "right_knee_patellar",
    "right_knee_pain": "right_knee_patellar",
    "right_knee_symptoms": "right_knee_patellar",
    "wrist_discomfort": "wrist_discomfort",
    "lumbar_tightness": "lumbar_tightness",
}


def q(value) -> str:
    """SQL literal."""
    if value is None or value == "":
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return repr(value)
    return "'" + str(value).replace("'", "''") + "'"


def jsonb(payload: dict) -> str:
    clean = {k: v for k, v in payload.items() if v is not None and v != ""}
    return q(json.dumps(clean, ensure_ascii=False, sort_keys=True)) + "::jsonb"


def iso(value) -> str | None:
    if value is None:
        return None
    if isinstance(value, (datetime, date)):
        return value.strftime("%Y-%m-%d")
    text = str(value).strip()
    return text[:10] if re.match(r"^\d{4}-\d{2}-\d{2}", text) else None


def num(value):
    if value is None or value == "":
        return None
    try:
        f = float(value)
    except (TypeError, ValueError):
        return None
    return int(f) if f.is_integer() else f


# --- read the backfill pack ----------------------------------------------
backfill = [json.loads(line) for line in BACKFILL_JSONL.read_text(encoding="utf-8").splitlines() if line.strip()]

# --- read the workbook ----------------------------------------------------
wb = openpyxl.load_workbook(WORKBOOK_XLSX, data_only=True)


def sheet_rows(name: str) -> list[dict]:
    """Rows keyed by header, skipping the title row and anything undated."""
    ws = wb[name]
    header: list[str] | None = None
    out: list[dict] = []
    for raw in ws.iter_rows(values_only=True):
        if header is None:
            if raw[0] == "Date":
                header = [str(c).strip() if c is not None else "" for c in raw]
            continue
        if not isinstance(raw[0], (datetime, date)):
            continue
        out.append({header[i]: raw[i] for i in range(len(header)) if header[i]})
    return out


workbook_rows: list[dict] = []
unmapped: list[str] = []

for idx, row in enumerate(sheet_rows("Snatch"), start=1):
    gym = row.get("Gym")
    if gym and gym not in GYM_SLUG:
        unmapped.append(f"gym {gym!r}")
    fm = row.get("Failure Mode")
    if fm and fm not in FAILURE_MODE:
        unmapped.append(f"failure mode {fm!r}")
    cue = row.get("Technical Cue")
    if cue and cue not in TECHNICAL_CUE:
        unmapped.append(f"technical cue {cue!r}")
    workbook_rows.append(
        {
            "record_id": f"workbook-snatch-{idx:04d}",
            "source_table": "workbook_snatch",
            "discipline": "snatch",
            "date": iso(row["Date"]),
            "payload": {
                "gym_slug": GYM_SLUG.get(gym) if gym else None,
                "variation_slug": "full_snatch",
                "weight_kg": num(row.get("Weight kg")),
                "sets_count": num(row.get("Sets")),
                "reps_per_set": num(row.get("Reps / Set")),
                "attempts": num(row.get("Attempts")),
                "full_stand_successes": num(row.get("Successful Stood")),
                "dropped": num(row.get("Drops")),
                "quality_10": num(row.get("Quality /10")),
                "straps": (str(row.get("Straps")).strip().lower() == "yes")
                if row.get("Straps") not in (None, "")
                else None,
                "failure_mode_slug": FAILURE_MODE.get(fm) if fm else None,
                "tag_slug": TECHNICAL_CUE.get(cue) if cue else None,
            },
            "notes": row.get("Notes"),
        }
    )

for idx, row in enumerate(sheet_rows("Hypertrophy"), start=1):
    gym = row.get("Gym")
    if gym and gym not in GYM_SLUG:
        unmapped.append(f"gym {gym!r}")
    order = row.get("Order")
    if order and order not in ORDER_VS_SNATCH:
        unmapped.append(f"order {order!r}")
    workbook_rows.append(
        {
            "record_id": f"workbook-hypertrophy-{idx:04d}",
            "source_table": "workbook_hypertrophy",
            "discipline": "hypertrophy",
            "date": iso(row["Date"]),
            "payload": {
                "gym_slug": GYM_SLUG.get(gym) if gym else None,
                "exercise_name": row.get("Exercise / Machine"),
                "load_kg": num(row.get("Load kg")),
                "sets_count": num(row.get("Sets")),
                "reps": num(row.get("Reps")),
                "drop_load_kg": num(row.get("Drop Load kg")),
                "drop_sets": num(row.get("Drop Sets")),
                "drop_reps": num(row.get("Drop Reps")),
                "order_vs_snatch": ORDER_VS_SNATCH.get(order) if order else "unknown",
            },
            "notes": row.get("Notes"),
        }
    )

for idx, row in enumerate(sheet_rows("Calisthenics"), start=1):
    gym = row.get("Gym")
    if gym and gym not in GYM_SLUG:
        unmapped.append(f"gym {gym!r}")
    key = (str(row.get("Skill")).strip(), str(row.get("Variation")).strip())
    if key not in WORKBOOK_SKILL:
        unmapped.append(f"skill {key!r}")
        continue
    variation_slug, implied_assistance = WORKBOOK_SKILL[key]
    assistance = row.get("Assistance")
    if assistance and assistance not in ASSISTANCE:
        unmapped.append(f"assistance {assistance!r}")
    workbook_rows.append(
        {
            "record_id": f"workbook-calisthenics-{idx:04d}",
            "source_table": "workbook_calisthenics",
            "discipline": "calisthenics",
            "date": iso(row["Date"]),
            "payload": {
                "gym_slug": GYM_SLUG.get(gym) if gym else None,
                "skill_variation_slug": variation_slug,
                "sets_count": num(row.get("Sets")),
                "reps_per_set": num(row.get("Reps")),
                "best_hold_seconds": num(row.get("Best Hold sec")),
                "total_hold_seconds": num(row.get("Total Hold sec")),
                "assistance_slug": ASSISTANCE.get(assistance, implied_assistance)
                if assistance
                else implied_assistance,
            },
            "notes": row.get("Notes"),
        }
    )

for idx, row in enumerate(sheet_rows("Daily Log"), start=1):
    gym = row.get("Gym")
    if gym and gym not in GYM_SLUG:
        unmapped.append(f"gym {gym!r}")
    metrics = {
        "sleep_quality": num(row.get("Sleep /10")),
        "soreness": num(row.get("Soreness /10")),
        "pre_session_readiness": num(row.get("Pre-session Readiness /10")),
        "post_session_fatigue": num(row.get("Post-session Fatigue /10")),
        "bodyweight": num(row.get("Body Weight kg")),
        "waist_cm": num(row.get("Waist cm")),
    }
    texts = {
        "carb_day": row.get("Carb Day"),
        "cognitive_load": row.get("Cognitive Load"),
        "breakfast": row.get("Breakfast"),
        "intra_workout_fuel": row.get("Intra-workout Fuel"),
        "fog_breathing": row.get("Fog / Breathing"),
    }
    if not any(v is not None for v in metrics.values()) and not any(texts.values()) and not row.get("Notes"):
        continue
    workbook_rows.append(
        {
            "record_id": f"workbook-daily-{idx:04d}",
            "source_table": "workbook_daily_log",
            "discipline": None,
            "date": iso(row["Date"]),
            "payload": {
                "gym_slug": GYM_SLUG.get(gym) if gym else None,
                "metrics": {k: v for k, v in metrics.items() if v is not None},
                "texts": {k: v for k, v in texts.items() if v},
            },
            "notes": row.get("Notes"),
        }
    )

# Food is staged so nothing is lost, but has no target table: nutrition is a
# later category and the promotion function skips these deliberately.
for idx, row in enumerate(sheet_rows("Food"), start=1):
    workbook_rows.append(
        {
            "record_id": f"workbook-food-{idx:04d}",
            "source_table": "workbook_food",
            "discipline": None,
            "date": iso(row["Date"]),
            "payload": {
                "meal": row.get("Meal / Timing"),
                "food": row.get("Food"),
                "quantity": row.get("Quantity"),
                "calories": num(row.get("Calories")),
                "purpose": row.get("Purpose / Context"),
            },
            "notes": row.get("Notes"),
        }
    )

if unmapped:
    raise SystemExit("Unmapped source values (refusing to guess):\n  " + "\n  ".join(sorted(set(unmapped))))

# --- supersession: per (date, discipline), never per window ---------------
workbook_coverage: dict[str, set[str]] = defaultdict(set)
for row in workbook_rows:
    if row["discipline"]:
        workbook_coverage[row["discipline"]].add(row["date"])

superseded_count = 0
for row in backfill:
    discipline = DISCIPLINE_OF_TABLE.get(row["table"])
    row["_superseded"] = bool(discipline and row["date"] in workbook_coverage[discipline])
    if row["_superseded"]:
        row["_superseded_by"] = f"workbook:{row['date']}:{discipline}"
        superseded_count += 1

# --- emit -----------------------------------------------------------------
out: list[str] = []
w = out.append

w("-- ============================================================================")
w("-- Fitness Observatory - backfill staging")
w("-- GENERATED by scripts/build_backfill_sql.py. Do not hand-edit.")
w("--")
w("-- Stages two sources into fitness.import_records. Writes NOTHING to the")
w("-- performance tables: run 0004_promote.sql afterwards, after reviewing.")
w("--")
w(f"--   {BACKFILL_BATCH}: {len(backfill)} rows, historical reconstruction")
w(f"--   {WORKBOOK_BATCH}: {len(workbook_rows)} rows, higher fidelity")
w("--")
w("-- Where both describe the same date AND the same discipline, the workbook")
w(f"-- wins and the backfill row is marked superseded: {superseded_count} rows.")
w("-- Supersession is per (date, discipline), never per date window - the")
w("-- backfill holds August dates the workbook never covered.")
w("-- ============================================================================")
w("")
w("insert into fitness.import_batches (label, source_file, notes) values")
w(
    f"  ({q(BACKFILL_BATCH)}, {q(BACKFILL_JSONL.name)}, "
    f"{q('Best-effort reconstruction from prior chat records, 2026-01-02 to 2026-10-24. Partial: not a session-by-session diary.')}),"
)
w(
    f"  ({q(WORKBOOK_BATCH)}, {q(WORKBOOK_XLSX.name)}, "
    f"{q('P1 Physiology Observatory workbook, 2026-08-01 to 2026-08-16. Higher fidelity than the backfill for the dates it covers.')})"
)
w("on conflict do nothing;")
w("")
w("-- -------------------------------------------------------------------------")
w(f"-- {WORKBOOK_BATCH}")
w("-- -------------------------------------------------------------------------")

for row in workbook_rows:
    conflict = KNOWN_CONFLICTS.get(row["date"])
    w("insert into fitness.import_records (")
    w("  record_id, batch_id, source_table, observation_date, payload,")
    w("  record_quality, provenance_type, notes, status, conflict_flag, conflict_note")
    w(") select")
    w(f"  {q(row['record_id'])}, b.id, {q(row['source_table'])}, {q(row['date'])}::date,")
    w(f"  {jsonb(row['payload'])},")
    w(f"  {q('direct_report')}, {q('workbook')}, {q(row['notes'])},")
    w(f"  'pending_review', {q(bool(conflict))}, {q(conflict)}")
    w(f"  from fitness.import_batches b where b.label = {q(WORKBOOK_BATCH)}")
    w("on conflict (record_id) do nothing;")

w("")
w("-- -------------------------------------------------------------------------")
w(f"-- {BACKFILL_BATCH}")
w("-- -------------------------------------------------------------------------")

for row in backfill:
    payload = {
        k: v
        for k, v in row.items()
        if k
        not in {
            "record_id",
            "table",
            "date",
            "record_quality",
            "source_timestamp_utc",
            "notes",
            "provenance_type",
            "import_status",
            "_superseded",
            "_superseded_by",
        }
        and v is not None
    }
    if row["table"] == "snatch_observations":
        slug = payload.get("variation")
        payload["variation_slug"] = SNATCH_VARIATION.get(slug, slug)
    if row["table"] == "calisthenics_observations":
        slug = payload.get("skill")
        payload["skill_variation_slug"] = SKILL_VARIATION.get(slug, slug)
    if row["table"] == "recovery_symptoms":
        payload["injury_slug"] = INJURY_METRIC.get(payload.get("metric"))

    conflict = KNOWN_CONFLICTS.get(row["date"])
    status = "superseded" if row["_superseded"] else "pending_review"
    w("insert into fitness.import_records (")
    w("  record_id, batch_id, source_table, observation_date, payload,")
    w("  record_quality, provenance_type, source_timestamp_utc, notes, status,")
    w("  superseded_by, conflict_flag, conflict_note")
    w(") select")
    w(f"  {q(row['record_id'])}, b.id, {q(row['table'])}, {q(row['date'])}::date,")
    w(f"  {jsonb(payload)},")
    w(f"  {q(row['record_quality'])}, {q(row['provenance_type'])}, {q(row['source_timestamp_utc'])},")
    w(f"  {q(row['notes'])}, {q(status)},")
    w(f"  {q(row.get('_superseded_by'))}, {q(bool(conflict))}, {q(conflict)}")
    w(f"  from fitness.import_batches b where b.label = {q(BACKFILL_BATCH)}")
    w("on conflict (record_id) do nothing;")

w("")
w("-- Summary of what was staged.")
w("select source_table, status, count(*) as rows")
w("  from fitness.import_records")
w(" group by source_table, status")
w(" order by source_table, status;")
w("")

OUT_SQL.write_text("\n".join(out), encoding="utf-8", newline="\n")

print(f"backfill rows staged   : {len(backfill)}")
print(f"workbook rows staged   : {len(workbook_rows)}")
print(f"marked superseded      : {superseded_count}")
print(f"conflict-flagged dates : {', '.join(sorted(KNOWN_CONFLICTS))}")
print(f"written                : {OUT_SQL}")
