// Writes the corpus: the existing specs copied unchanged, and broken variants of guests-2 with one planted fault each.
// Every fault is a single textual replacement that must apply exactly once, so a variant cannot silently equal its base.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const v2 = join(here, "..");
const out = join(here, "corpus");
const read = (p) => readFileSync(join(v2, p), "utf8");
const put = (p, s) => { mkdirSync(dirname(join(out, p)), { recursive: true }); writeFileSync(join(out, p), s); };

put("guests-1/App.lex.tex", read("loop/answers/guests-1.lex.tex"));
put("guests-2/App.lex.tex", read("loop/answers/guests-2.lex.tex"));
put("guests-3/App.lex.tex", read("loop/answers/guests-3.lex.tex"));
// Payment imports PrismPM's example PaymentApproval, which is not a library module, so it travels with the spec.
put("payment/Payment.lex.tex", read("probe-payment/src/Payment.lex.tex"));
put("payment/PaymentApproval.lex.tex", read("probe-payment/src/PaymentApproval.lex.tex"));

const base = read("loop/answers/guests-2.lex.tex");
const M = "Foundation.View.Browser.V1.Model";
export const faults = {
  "unknown-name": ["then (cleared state) else", "then (clearedd state) else"],
  "wrong-type": ["name: accepted,\n  parameters: [words : String],\n  result: Bool,", "name: accepted,\n  parameters: [words : String],\n  result: Nat,"],
  "missing-field": ["(record State {revision := 0, guests := (nil " + M + "::TableRow)})", "(record State {revision := 0})"],
  "constructor-arity": ["Content.Heading 1 0)", "Content.Heading 1)"],
  // Renamed at both its declaration and its one use, so the only fault is the reserved name itself.
  "reserved-name": ["cleared", "decide", 2],
  "non-terminating": ["(cons head (firstRows rest fewer))", "(cons head (firstRows rows count))"],
  "bad-qualifier": ["{name: guests, type: (List " + M + "::TableRow)}", "{name: guests, type: (List Foundation.View.Browser.V2.Model::TableRow)}"],
  "malformed-syntax": ["(cons \"Guests\" (nil String)))))))", "(cons \"Guests\" (nil String))))))"],
  "title-not-in-lexicon": ["\\title{Browser view model}", "\\title{Guest list}"],
  "title-hosted-word": ["\\title{Browser view model}", "\\title{Bounded byte buffer}"],
  "title-two-phrases": ["\\title{Browser view model}", "\\title{Browser view model Bounded byte buffer}"],
  // A replaced phrase before the fault, so the column the hosted service reports must be mapped back.
  "title-phrase-then-unknown": ["\\title{Browser view model}", "\\title{Browser view model Guest list}"],
  "title-lowercase": ["\\title{Browser view model}", "\\title{browser view model}"],
};
for (const [name, [from, to, count = 1]] of Object.entries(faults)) {
  const n = base.split(from).length - 1;
  if (n !== count) throw new Error(`${name}: expected ${count} occurrences, found ${n}`);
  put(`broken/${name}/App.lex.tex`, base.split(from).join(to));
}
console.log("corpus written");
