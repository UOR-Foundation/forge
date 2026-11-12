// Run: node --test v2/shell/test-payment.mjs
// The payment app: a form, inputs, a select and a table on PrismPM's presentation protocol.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadProject, toArray, NIL, cons } from "./interp.mjs";

const dir = new URL("../probe-payment/data/", import.meta.url);
const names = JSON.parse(readFileSync(new URL("modules.json", dir), "utf8"));
const app = loadProject(Object.fromEntries(names.map((n) => [n, JSON.parse(readFileSync(new URL(n.split(".").join("/") + ".json", dir), "utf8"))])));
const M = "Foundation.View.Browser.V1.Model::";
const list = (items) => items.reduceRight((tail, head) => cons(head, tail), NIL);
const fields = (role, amount, limit) => list([{ node: 4n, value: { c: M + "Value.Choice", a: [BigInt(role)] } }, { node: 5n, value: { c: M + "Value.Text", a: [amount] } }, { node: 6n, value: { c: M + "Value.Text", a: [limit] } }]);
const decide = (state, role, amount, limit) => app.call("Payment::step", state, { revision: state.revision, action: 1n, fields: fields(role, amount, limit) });
const valid = (state) => app.call(M + "presentationValid", app.call("Payment::view", state));
const rows = (state) => toArray(state.history).map((r) => toArray(r.cells).join(" "));

test("the decision is PrismPM's own Payment Approval rule", () => {
  const cases = [[1, "250", "1000", "approved"], [1, "1000", "1000", "approved"], [1, "1001", "1000", "refused"], [2, "5000", "1000", "approved"], [2, "0", "1000", "invalid"], [1, "05", "1000", "invalid"], [0, "1", "1", "invalid"], [3, "1", "1", "invalid"]];
  for (const [role, amount, limit, expected] of cases) assert.equal(decide(app.call("Payment::initial"), role, amount, limit).status, expected, `${role} ${amount} ${limit}`);
});

test("every frame is one the protocol admits, by the library's own rule", () => {
  let state = app.call("Payment::initial");
  assert.equal(valid(state), true);
  for (let i = 0; i < 40; i++) { state = decide(state, 1 + (i % 2), String(i * 37), "1000"); assert.equal(valid(state), true, "after " + i); }
});

test("the table keeps the newest sixteen decisions, newest first", () => {
  let state = app.call("Payment::initial");
  for (let i = 1; i <= 20; i++) state = decide(state, 1, String(i), "10");
  assert.equal(rows(state).length, 16);
  assert.equal(rows(state)[0], "clerk 20 10 refused");
  assert.equal(rows(state)[15], "clerk 5 10 approved");
});

test("text longer than the field allows is refused and never shown back", () => {
  const state = decide(app.call("Payment::initial"), 1, "1".repeat(21), "1");
  assert.equal(state.status, "invalid");
  assert.equal(state.amount, "");
  assert.equal(rows(state).length, 0);
  assert.equal(valid(state), true);
});

test("a stale intent changes nothing; every change advances the revision", () => {
  const start = app.call("Payment::initial");
  const next = decide(start, 1, "1", "1");
  assert.equal(next.revision, start.revision + 1n);
  assert.equal(app.call("Payment::step", next, { revision: 0n, action: 2n, fields: NIL }), next);
  assert.equal(app.call("Payment::step", next, { revision: next.revision, action: 9n, fields: NIL }), next);
  const cleared = app.call("Payment::step", next, { revision: next.revision, action: 2n, fields: NIL });
  assert.equal(cleared.revision, next.revision + 1n);
  assert.equal(rows(cleared).length, 0);
});

test("the frame carries the state's revision (the theorem Lean proved, sampled)", () => {
  let state = app.call("Payment::initial");
  for (let i = 0; i < 5; i++) { assert.equal(app.call("Payment::view", state).revision, state.revision); state = decide(state, 1, "1", "1"); }
});
