// Run: node --test v2/loop/test-guests.mjs
// The guest list a model wrote (answers/guests-3.verified.lex.tex), run from its data form.
// Lean proved its five theorems. Three of them say less than their sentences do, and the model left
// four properties out because no proof form could close them. Those gaps are tested here, in full,
// on samples: that is evidence, not proof.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadProject, toArray, NIL, cons } from "../shell/interp.mjs";

const lib = new URL("../probe-payment/data/", import.meta.url);
const names = JSON.parse(readFileSync(new URL("modules.json", lib), "utf8")).filter((n) => n.startsWith("Foundation."));
const modules = Object.fromEntries(names.map((n) => [n, JSON.parse(readFileSync(new URL(n.split(".").join("/") + ".json", lib), "utf8"))]));
const app = loadProject({ ...modules, App: JSON.parse(readFileSync(new URL("answers/guests-3.json", import.meta.url), "utf8")) });
const M = "Foundation.View.Browser.V1.Model::";
const same = (a, b) => JSON.stringify(a, (k, v) => (typeof v === "bigint" ? v + "n" : v)) === JSON.stringify(b, (k, v) => (typeof v === "bigint" ? v + "n" : v));
const frame = (state) => app.call("App::view", state);
const press = (state, action, text, revision = state.revision) => app.call("App::step", state, { revision, action: BigInt(action), fields: text === undefined ? NIL : cons({ node: 4n, value: { c: M + "Value.Text", a: [text] } }, NIL) });
const guests = (state) => { const table = toArray(frame(state).nodes).find((n) => n.content.c.endsWith("Content.Table")); return toArray(table.content.a[2]).flatMap((c) => toArray(c.rows).map((r) => toArray(r.cells).join("|"))); };
const filled = (count) => { let s = app.call("App::initial"); for (let i = 0; i < count; i++) s = press(s, 1, "guest " + i); return s; };
const states = [0, 1, 2, 15, 16, 17, 40].map(filled);

test("the spec states the five promises Lean proved, in order", () => {
  assert.deepEqual(toArray(app.call("App::promises")), ["The guest list starts empty.", "Pressing Clear always leaves the guest list empty.", "An empty name is never added and changes nothing.", "A name longer than 40 bytes is never added and changes nothing.", "A press from an out-of-date screen never changes anything."]);
});

test("promise 1 and 2, as the person reads them: empty at the start, empty after Clear", () => {
  assert.deepEqual(guests(app.call("App::initial")), []);
  for (const s of states) assert.deepEqual(guests(press(s, 2)), []);
});

test("promise 3 in full: an empty name changes nothing at all, not only the revision", () => {
  for (const s of states) assert.ok(same(press(s, 1, ""), s));
});

test("promise 4 in full: a name over 40 bytes changes nothing at all, and 40 bytes is allowed", () => {
  for (const s of states) {
    assert.ok(same(press(s, 1, "x".repeat(41)), s));
    assert.ok(same(press(s, 1, "é".repeat(21)), s), "42 bytes in 21 characters");
    assert.equal(guests(press(s, 1, "é".repeat(20)))[0], "é".repeat(20), "40 bytes in 20 characters");
  }
});

test("promise 5 in full: a press from an out-of-date screen changes nothing at all", () => {
  for (const s of states.slice(1)) for (const stale of [0n, s.revision - 1n, s.revision + 1n]) {
    assert.ok(same(press(s, 1, "late", stale), s));
    assert.ok(same(press(s, 2, undefined, stale), s));
  }
});

test("left out of the proofs, tested: never more than 16 names", () => {
  for (const s of states) assert.ok(guests(s).length <= 16);
  assert.equal(guests(filled(40)).length, 16);
});

test("left out of the proofs, tested: a new name comes first, exactly as typed, and the rest keep their order", () => {
  for (const s of states) {
    const before = guests(s), after = guests(press(s, 1, "  Zoë O'Neil  "));
    assert.equal(after[0], "  Zoë O'Neil  ");
    assert.deepEqual(after.slice(1), before.slice(0, 15));
  }
});

test("every frame is one the protocol admits, and it carries the state's revision", () => {
  for (const s of states) { assert.equal(app.call(M + "presentationValid", frame(s)), true); assert.equal(frame(s).revision, s.revision); }
});

test("the name box empties after an add: its draft epoch moves with the revision", () => {
  const epoch = (s) => toArray(frame(s).nodes).find((n) => n.content.c.endsWith("Content.Input")).content.a[5];
  const s = filled(1), t = press(s, 1, "Ada");
  assert.notEqual(epoch(t), epoch(s));
  assert.equal(epoch(press(t, 1, "")), epoch(t), "an ignored press leaves what was typed");
});
