/**
 * The numeric verifier.
 *
 * Every figure in an answer must have come from a tool result or from the
 * question itself. A prompt saying "do not invent measurements" is a wish;
 * this is the part that makes it hold.
 *
 * It is deliberately mechanical: extract the numerals, compare against the
 * numerals the evidence contained, and reject on anything left over. It cannot
 * tell whether a number is being used *correctly* — only whether it exists in
 * the data at all. That is a narrow guarantee, and worth having precisely
 * because it is checkable.
 */

export interface VerificationResult {
  ok: boolean;
  unsourced: string[];
}

/**
 * Numbers that carry no claim about the athlete: list markers, ordinary
 * counting words rendered as digits in prose like "1 of the 3 sessions" are
 * NOT exempt — those are claims. Only markdown scaffolding is stripped.
 */
function stripMarkdownScaffolding(text: string): string {
  return text
    // Ordered list markers at the start of a line: "1. ", "2) "
    .replace(/^\s{0,3}\d{1,2}[.)]\s+/gm, "")
    // Heading markers, table pipes and bullets carry no numerals of their own.
    .replace(/^#{1,6}\s+/gm, "");
}

/** Every numeral in a string, as normalised numbers. */
function extractNumbers(text: string): number[] {
  const matches = text.match(/-?\d+(?:[.,]\d+)?/g) ?? [];
  return matches
    .map((raw) => Number(raw.replace(/,/g, "")))
    .filter((value) => Number.isFinite(value));
}

/** Collects every numeral anywhere in a JSON-serialisable value. */
function numbersWithin(value: unknown, into: Set<number>): void {
  if (value === null || value === undefined) return;
  if (typeof value === "number") {
    into.add(value);
    return;
  }
  if (typeof value === "string") {
    for (const n of extractNumbers(value)) into.add(n);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) numbersWithin(item, into);
    return;
  }
  if (typeof value === "object") {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      // Keys can carry numbers too: {"50": {...}} or "load_50_kg".
      for (const n of extractNumbers(key)) into.add(n);
      numbersWithin(item, into);
    }
  }
}

/**
 * A figure matches if the evidence contains it exactly, or contains a value
 * that rounds to it. Quoting 52.2 as "52%" is honest reporting; inventing 61%
 * is not, and rounding cannot turn one into the other.
 */
function isSourced(candidate: number, allowed: Set<number>): boolean {
  if (allowed.has(candidate)) return true;
  for (const value of allowed) {
    if (Math.round(value) === candidate) return true;
    if (Math.round(value * 10) / 10 === candidate) return true;
    // An integer quoted from a one-decimal value, e.g. 36.0 -> 36.
    if (Number.isInteger(candidate) && Math.abs(value - candidate) < 0.05) return true;
  }
  return false;
}

export function verifyAnswer(
  answer: string,
  evidence: unknown[],
  question: string,
): VerificationResult {
  const allowed = new Set<number>();
  for (const item of evidence) numbersWithin(item, allowed);
  // The athlete's own question is fair game: asking "how did 50 kg go?" means
  // the answer may say 50.
  for (const n of extractNumbers(question)) allowed.add(n);

  const claimed = extractNumbers(stripMarkdownScaffolding(answer));
  const unsourced = [
    ...new Set(claimed.filter((value) => !isSourced(value, allowed)).map(String)),
  ];

  return { ok: unsourced.length === 0, unsourced };
}

/**
 * Third parties in the notes — a named trainer, an acquaintance — are not
 * users of this app and have consented to nothing. Their names are replaced
 * with roles before anything leaves the server. The athlete's own experience
 * survives; the identification does not.
 *
 * The map is intentionally small and explicit. Guessing at names with a
 * general-purpose detector would redact gym names and exercises instead.
 */
/** One person, as they appear in notes and as the Coach should see them. */
export interface ThirdParty {
  alias: string;
  role: string;
}

/**
 * The fallback list.
 *
 * The live list lives in `fitness.third_parties` so a new person is a row
 * rather than a redeploy. These stay in code as the floor: if that query
 * fails, redaction degrades to this, never to nothing.
 */
export const BUILT_IN_THIRD_PARTIES: ThirdParty[] = [
  { alias: "Rob", role: "a trainer" },
  { alias: "gym crush", role: "an acquaintance" },
  { alias: "Sri Lankan guy", role: "a lifter" },
  { alias: "Miss T", role: "an acquaintance" },
  { alias: "Lee", role: "an acquaintance" },
];

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Shapes that name someone without using a name on the list.
 *
 * These are the generalisation, and the reason this is not simply a longer
 * list of names: "Miss T" and "the Sri Lankan guy" are both patterns, and the
 * next person described that way will be caught without anyone adding them.
 *
 * They are deliberately narrow. A title followed by a capitalised word, or an
 * article followed by capitalised words and a person-noun. Broadening them
 * further starts eating ordinary prose.
 */
const STRUCTURAL_REDACTIONS: { pattern: RegExp; replacement: string }[] = [
  // Miss T, Mr Khan, Dr. Patel
  {
    pattern: /\b(?:Mr|Mrs|Ms|Miss|Dr|Prof)\.?\s+[A-Z][\w'\u2019-]*/g,
    replacement: "an acquaintance",
  },
  // the Sri Lankan guy, that Polish lad — the article is consumed, as below.
  {
    pattern:
      /\b(?:the|that|this|a)\s+(?:[A-Z][a-z]+\s+){1,2}(?:guy|man|woman|girl|lad|lady|bloke|dude|chap|bloke)\b/g,
    replacement: "an acquaintance",
  },
];

/**
 * Build the pattern list. Longest alias first, so "Miss T" is replaced before
 * a bare "T" in the list could claim the "T".
 *
 * The article is consumed deliberately on the possessive forms: "the gym
 * crush" must not become "the an acquaintance".
 */
export function redactionPatterns(
  people: ThirdParty[] = BUILT_IN_THIRD_PARTIES,
): { pattern: RegExp; replacement: string }[] {
  const byLength = [...people].sort((a, b) => b.alias.length - a.alias.length);
  const fromPeople = byLength.flatMap(({ alias, role }) => {
    const body = escape(alias).replace(/\s+/g, "\\s+");
    return [
      { pattern: new RegExp(`\\b(?:the|my|our)\\s+${body}\\b`, "gi"), replacement: role },
      { pattern: new RegExp(`\\b${body}(?:'s|\u2019s)?\\b`, "gi"), replacement: role },
    ];
  });
  return [...STRUCTURAL_REDACTIONS, ...fromPeople];
}

export function redactThirdParties(
  text: string,
  people?: ThirdParty[],
): { text: string; count: number } {
  let count = 0;
  let output = text;
  for (const { pattern, replacement } of redactionPatterns(people)) {
    output = output.replace(pattern, () => {
      count += 1;
      return replacement;
    });
  }
  return { text: output, count };
}

export function redactDeep<T>(value: T, people?: ThirdParty[]): { value: T; count: number } {
  let count = 0;
  const walk = (input: unknown): unknown => {
    if (typeof input === "string") {
      const { text, count: n } = redactThirdParties(input, people);
      count += n;
      return text;
    }
    if (Array.isArray(input)) return input.map(walk);
    if (input && typeof input === "object") {
      return Object.fromEntries(
        Object.entries(input as Record<string, unknown>).map(([k, v]) => [k, walk(v)]),
      );
    }
    return input;
  };
  return { value: walk(value) as T, count };
}
