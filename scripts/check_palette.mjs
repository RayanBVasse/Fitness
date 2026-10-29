#!/usr/bin/env node
/**
 * Checks the Signal palette in app/globals.css.
 *
 *   node scripts/check_palette.mjs
 *
 * Every workstream and muscle token is used as TEXT — chip labels, section
 * titles — so each has to clear 4.5:1 against the three things it can sit on:
 * --surface, --surface-2, and the 8% self-tint an active chip wears. It also
 * reports whether a colour leaves the sRGB gamut, because a clipped colour is
 * not the colour that was specified, and how far apart the members of each
 * family are for normal and dichromatic vision.
 *
 * Separation inside a family is deliberately low: members differ only in
 * lightness. That is reported, not enforced. Nothing in the app asks you to
 * tell two of them apart to read a number — every stripe and chip is labelled.
 *
 * The workstreams are now a family in that same sense. On the 2c palette
 * snatch 230 and hypertrophy 292 measure dE 4.7 deutan in light and 1.1 in
 * dark, chosen knowingly: the three are told apart by the names printed on
 * every tile, tab and chip that carries one. The numbers below are the
 * record of that trade, not a target anyone is trying to hit.
 *
 * Keep the tables below in step with globals.css when a token changes.
 */

const LIGHT_SURFACES = { surface: "#ffffff", surface2: "#f0f0f2" };
const DARK_SURFACES = { surface: "#16161b", surface2: "#1f1f26" };
const CHIP_TINT = 0.08;
const MIN_CONTRAST = 4.5;

const LIGHT = {
  ws_snatch: [0.52, 0.18, 230], ws_calisthenics: [0.52, 0.18, 150], ws_hypertrophy: [0.52, 0.18, 292],
  shoulders: [0.52, 0.13, 28], chest: [0.46, 0.13, 28], triceps: [0.4, 0.12, 28],
  lats: [0.5, 0.13, 255], mid_back: [0.45, 0.13, 255], biceps: [0.4, 0.13, 255],
  calves: [0.49, 0.13, 145], hamstrings: [0.445, 0.13, 145], quads: [0.4, 0.12, 145],
  glutes: [0.355, 0.11, 145], core: [0.5, 0.1, 90],
};
const DARK = {
  ws_snatch: [0.75, 0.17, 230], ws_calisthenics: [0.75, 0.17, 150], ws_hypertrophy: [0.75, 0.17, 292],
  shoulders: [0.77, 0.13, 28], chest: [0.71, 0.13, 28], triceps: [0.67, 0.13, 28],
  lats: [0.74, 0.12, 255], mid_back: [0.69, 0.13, 255], biceps: [0.65, 0.13, 255],
  calves: [0.83, 0.13, 145], hamstrings: [0.77, 0.13, 145], quads: [0.71, 0.13, 145],
  glutes: [0.67, 0.13, 145], core: [0.72, 0.13, 90],
};
const FAMILIES = {
  red: ["shoulders", "chest", "triceps"],
  blue: ["lats", "mid_back", "biceps"],
  green: ["calves", "hamstrings", "quads", "glutes"],
  // Ordered so the close pair is adjacent: the walk compares consecutive
  // members, and snatch against hypertrophy is the comparison that matters.
  workstream: ["ws_snatch", "ws_hypertrophy", "ws_calisthenics"],
};

// --- colour maths ----------------------------------------------------------
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const encode = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
const decode = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

function oklabToLinear([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}
function linearToOklab([r, g, b]) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
const oklchToLinear = (L, C, h) =>
  oklabToLinear([L, C * Math.cos((h * Math.PI) / 180), C * Math.sin((h * Math.PI) / 180)]);
const hexToLinear = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => decode(v / 255));
};
const toHex = (lin) =>
  "#" + lin.map((v) => Math.round(encode(clamp01(v)) * 255).toString(16).padStart(2, "0")).join("");
const luminance = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
function contrast(a, b) {
  const x = luminance(a.map(clamp01)), y = luminance(b.map(clamp01));
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
/** color-mix(in oklab, a pct, b) — the browser mixes in OKLab, so we do too. */
function mix(a, b, pct) {
  const A = linearToOklab(a.map(clamp01)), B = linearToOklab(b.map(clamp01));
  return oklabToLinear(A.map((v, i) => v * pct + B[i] * (1 - pct)));
}

// Viénot–Brettel–Mollon dichromat simulation.
const LMS = [[0.31399022, 0.63951294, 0.04649755], [0.15537241, 0.75789446, 0.08670142], [0.01775239, 0.10944209, 0.87256922]];
const LMS_INV = [[5.47221206, -4.6419601, 0.16963708], [-1.1252419, 2.29317094, -0.1678952], [0.02980165, -0.19318073, 1.16364789]];
const SIM = {
  deutan: [[1, 0, 0], [0.49421, 0, 1.24827], [0, 0, 1]],
  protan: [[0, 1.05118294, -0.05116099], [0, 1, 0], [0, 0, 1]],
  tritan: [[1, 0, 0], [0, 1, 0], [-0.395913, 0.801109, 0]],
};
const apply = (M, v) => M.map((row) => row.reduce((sum, x, i) => sum + x * v[i], 0));
const simulate = (lin, kind) =>
  apply(LMS_INV, apply(SIM[kind], apply(LMS, lin.map(clamp01)))).map(clamp01);
function deltaE(a, b) {
  const A = linearToOklab(a.map(clamp01)), B = linearToOklab(b.map(clamp01));
  return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]) * 100;
}

// --- the check -------------------------------------------------------------
let failures = 0;
for (const [mode, tokens, surfaces] of [
  ["LIGHT", LIGHT, LIGHT_SURFACES],
  ["DARK", DARK, DARK_SURFACES],
]) {
  console.log(`\n===== ${mode} =====`);
  const linear = {};
  for (const [name, [L, C, h]] of Object.entries(tokens)) {
    const raw = oklchToLinear(L, C, h);
    linear[name] = raw;
    const outOfGamut = raw.some((v) => v < -0.0015 || v > 1.0015);
    const onSurface = contrast(raw, hexToLinear(surfaces.surface));
    const onSurface2 = contrast(raw, hexToLinear(surfaces.surface2));
    const onChip = contrast(raw, mix(raw, hexToLinear(surfaces.surface2), CHIP_TINT));
    const bad = [];
    if (outOfGamut) bad.push("out of gamut");
    if (onSurface < MIN_CONTRAST) bad.push("surface");
    if (onSurface2 < MIN_CONTRAST) bad.push("surface-2");
    if (onChip < MIN_CONTRAST) bad.push("chip tint");
    if (bad.length) failures += 1;
    console.log(
      `${name.padEnd(16)} ${toHex(raw)}  surface ${onSurface.toFixed(2)}  ` +
        `surface-2 ${onSurface2.toFixed(2)}  chip ${onChip.toFixed(2)}  ` +
        (bad.length ? `FAIL: ${bad.join(", ")}` : "ok"),
    );
  }
  console.log("-- separation within family (dE: normal / deutan / protan / tritan)");
  for (const [family, members] of Object.entries(FAMILIES)) {
    for (let i = 0; i < members.length - 1; i += 1) {
      const a = linear[members[i]], b = linear[members[i + 1]];
      const values = [
        deltaE(a, b),
        deltaE(simulate(a, "deutan"), simulate(b, "deutan")),
        deltaE(simulate(a, "protan"), simulate(b, "protan")),
        deltaE(simulate(a, "tritan"), simulate(b, "tritan")),
      ];
      console.log(
        `  ${family.padEnd(10)} ${`${members[i]}/${members[i + 1]}`.padEnd(24)} ` +
          values.map((v) => v.toFixed(1)).join(" / "),
      );
    }
  }
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} colour(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
