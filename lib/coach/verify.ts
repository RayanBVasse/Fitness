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
const NAME_REDACTIONS: { pattern: RegExp; replacement: string }[] = [
  { pattern: /\bRob\b/g, replacement: "a trainer" },
  // The article is consumed deliberately: "the gym crush" must not become
  // "the an acquaintance".
  { pattern: /\b(?:the|my)\s+gym\s+crush\b/gi, replacement: "an acquaintance" },
  { pattern: /\bgym\s+crush\b/gi, replacement: "an acquaintance" },
];

export function redactThirdParties(text: string): { text: string; count: number } {
  let count = 0;
  let output = text;
  for (const { pattern, replacement } of NAME_REDACTIONS) {
    output = output.replace(pattern, () => {
      count += 1;
      return replacement;
    });
  }
  return { text: output, count };
}

export function redactDeep<T>(value: T): { value: T; count: number } {
  let count = 0;
  const walk = (input: unknown): unknown => {
    if (typeof input === "string") {
      const { text, count: n } = redactThirdParties(input);
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
