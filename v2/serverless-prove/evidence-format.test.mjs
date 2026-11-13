import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { agreementJSON } from "./evidence-format.mjs";

test("agreement diagnostics omit build usernames without changing proof evidence", () => {
  const original = {
    toolchain: "address", rows: [{
      theorem: "Example.claim", image: { verdict: "refused", code: "LLV7002" },
      tab: { verdict: "refused", assembled: "digest", axioms: [], ms: 12,
        why: "panicked at /home/builder/kernel/src/tc.rs:988:71; refused: Example.claim" },
      bindingOnly: { why: "panicked at /Users/builder/kernel/src/tc.rs:238:17", lean: "refused" },
    }],
  };
  const expected = structuredClone(original);
  expected.rows[0].tab.why = "panicked at /home/<build-user>/kernel/src/tc.rs:988:71; refused: Example.claim";
  expected.rows[0].bindingOnly.why = "panicked at /Users/<build-user>/kernel/src/tc.rs:238:17";
  const formatted = agreementJSON(original);
  assert.deepEqual(JSON.parse(formatted), expected);
  assert.equal(agreementJSON(JSON.parse(formatted)), formatted);
  assert.match(original.rows[0].tab.why, /\/home\/builder\//);
  assert.equal(agreementJSON({ why: "SP_KEY", source: "/home/builder/spec.lex.tex" }),
    JSON.stringify({ why: "SP_KEY", source: "/home/builder/spec.lex.tex" }, null, 1) + "\n");
});

test("the committed agreement uses the writer's display-only normalization", () => {
  const recorded = readFileSync(new URL("./evidence/agreement.json", import.meta.url), "utf8");
  assert.equal(agreementJSON(JSON.parse(recorded)), recorded);
  const writer = readFileSync(new URL("./agree.mjs", import.meta.url), "utf8");
  assert.match(writer, /import \{ agreementJSON \} from "\.\/evidence-format\.mjs"/);
  assert.match(writer, /writeFileSync\(join\(here, "evidence", "agreement\.json"\), agreementJSON\(/);
});
