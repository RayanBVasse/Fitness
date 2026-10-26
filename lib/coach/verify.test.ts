import { verifyAnswer, redactThirdParties, redactDeep } from "./verify";

let failures = 0;
function check(name: string, condition: boolean, detail?: unknown) {
  if (condition) { console.log(`  PASS  ${name}`); }
  else { failures++; console.log(`  FAIL  ${name}`, detail ?? ""); }
}

const evidence = [{
  tool: "snatch_success",
  window: { from: "2026-01-01", to: "2026-10-25" },
  n: 69,
  data: { loads: [{ load_kg: 50, attempts: 69, stood: 36, stand_rate_pct: 52.2, receive_rate_pct: 68.1 }] },
}];
const question = "How is 50 kg going?";

check("exact figures pass",
  verifyAnswer("At 50 kg you stood 36 of 69, a 52.2% stand rate.", evidence, question).ok);

check("rounded figure passes (52.2 -> 52)",
  verifyAnswer("Your stand rate at 50 kg is about 52%.", evidence, question).ok);

const invented = verifyAnswer("Your stand rate at 50 kg is 61%, up from 44%.", evidence, question);
check("invented figures are caught", !invented.ok && invented.unsourced.includes("61"), invented);

check("question numbers are allowed",
  verifyAnswer("50 kg is the load in question.", evidence, question).ok);

check("markdown list markers are not treated as claims",
  verifyAnswer("1. You stood 36 of 69.\n2. That is 52.2%.", evidence, question).ok);

const fabricatedCount = verifyAnswer("You trained 14 days last month.", evidence, question);
check("a fabricated count is caught", !fabricatedCount.ok, fabricatedCount);

check("dates inside evidence are allowed",
  verifyAnswer("Between 2026-01-01 and 2026-10-25 you attempted 69.", evidence, question).ok);

const r = redactThirdParties("Had a good chat with Rob and saw the gym crush again.");
check("names are redacted", r.text === "Had a good chat with a trainer and saw an acquaintance again." && r.count === 2, r);
const r2 = redactThirdParties("gym crush was there, and my gym crush again");
check("bare and possessive forms redact cleanly", !r2.text.includes("crush") && !/(the|my)\s+an acquaintance/.test(r2.text), r2);

const deep = redactDeep({ notes: [{ content: "Rob said hello" }] });
check("nested names are redacted", JSON.stringify(deep.value).includes("a trainer") && deep.count === 1, deep);

// --- the widened redactor -------------------------------------------------
// Real text from a gym note, which is what prompted widening this.
const gymNote =
  "Met with the Sri Lankan guy... he showed ne Sots press. Miss T was " +
  "exceptionally chatty and nice. Lee noticed... and was looking away.";
const wide = redactThirdParties(gymNote);
check("nationality descriptor is redacted", !wide.text.includes("Sri Lankan"), wide);
check("title plus initial is redacted", !wide.text.includes("Miss T"), wide);
check("bare given name is redacted", !/\bLee\b/.test(wide.text), wide);

// The structural patterns must catch people who are on no list at all.
const unknown = redactThirdParties("I spoke to Mr Okafor and that Polish lad.");
check("unlisted title is caught structurally", !unknown.text.includes("Okafor"), unknown);
check("unlisted descriptor is caught structurally", !unknown.text.includes("Polish"), unknown);

// A longer alias must win over a shorter one it contains.
const overlap = redactThirdParties("Miss T said hello", [
  { alias: "Miss T", role: "an acquaintance" },
  { alias: "T", role: "someone" },
]);
check("longest alias wins", overlap.text === "an acquaintance said hello", overlap);

// Possessives, and the article that must not survive.
const poss = redactThirdParties("the gym crush waved.");
check("article is consumed", poss.text === "an acquaintance waved.", poss);

// Ordinary prose must survive untouched.
const prose = redactThirdParties("The bar felt heavy. A good session, the first pull was slow.");
check("ordinary prose is not redacted", prose.count === 0, prose);

// A missing list must fall back to the built-ins, never to nothing.
const fallback = redactThirdParties("Rob was there", undefined);
check("missing list falls back to built-ins", fallback.text === "a trainer was there", fallback);

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
