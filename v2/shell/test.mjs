// Run: node --test v2/shell/test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { load, loadProject, Unsupported } from "./interp.mjs";
import { decodeResponse, WireError } from "./wire.mjs";

const data = JSON.parse(readFileSync(new URL("../probe/Probe.json", import.meta.url), "utf8"));
const app = load(data);
const enc = new TextEncoder(), dec = new TextDecoder();
const dispatch = (request) => dec.decode(app.call("dispatch", enc.encode(request)));

test("the worked example in WIRE.md", () => {
  assert.equal(dispatch("05020000"), "0702P07|[T07CounterN07B03Add0000B05Reset0100]");
});

test("reset clears the count and announces", () => {
  assert.equal(dispatch("09030100"), "0003A|[T07CounterN00B03Add0000B05Reset0100]");
});

test("set stride keeps the count and has no effect", () => {
  assert.equal(dispatch("0903020a"), "090a|[T07CounterN09B03Add0000B05Reset0100]");
});

test("malformed requests are refused", () => {
  for (const bad of ["", "0502000", "050200000", "0502zz00", "05020300", "0502000G", "05020A00"]) assert.equal(dispatch(bad), "invalid", bad);
});

test("a count past one byte is refused, not wrapped", () => {
  assert.equal(dispatch("ff010000"), "overflow");
  assert.equal(dispatch("fe010000").slice(0, 4), "ff01");
});

test("every state and event agrees with the model stated directly", () => {
  for (let count = 0; count < 256; count += 5) for (let stride = 0; stride < 256; stride += 7) {
    const h = (n) => n.toString(16).padStart(2, "0");
    const out = dispatch(h(count) + h(stride) + "0000");
    if (count + stride > 255) assert.equal(out, "overflow");
    else assert.equal(out.slice(0, 7), h(count + stride) + h(stride) + "P" + h(count + stride));
  }
});

test("the decoder reads what the model wrote", () => {
  const r = decodeResponse(enc.encode(dispatch("05020000")));
  assert.equal(r.state, "0702");
  assert.deepEqual(r.effects, [{ kind: "persist", value: 7 }]);
  assert.deepEqual(r.nodes.map((n) => n.kind), ["open", "text", "number", "button", "button", "close"]);
  assert.equal(r.nodes[3].event, "0000");
  assert.deepEqual(decodeResponse(enc.encode("invalid")), { refused: "invalid" });
});

test("the decoder refuses bytes the model cannot write", () => {
  for (const bad of ["0702", "0702X|", "0702|Q", "0702|T09abc", "0702|B03Add00"]) assert.throws(() => decodeResponse(enc.encode(bad)), WireError, bad);
});

test("an unknown expression is a typed refusal", () => {
  const broken = { spec: data.spec, declarations: [{ kind: "definition", name: "f", parameters: [], body: { kind: "mystery" } }] };
  assert.throws(() => load(broken), Unsupported);
  assert.throws(() => load({ spec: "other" }), Unsupported);
});

// The counter rebuilt on PrismPM's own presentation, intent and CBOR wire modules.
const { project } = await import("../probe-view/project.mjs");
const viewVectors = JSON.parse(readFileSync(new URL("../probe-view/vectors.json", import.meta.url), "utf8"));
const W = "Foundation.View.Browser.V1.Wire::";

test("the library codec, interpreted, answers every vector encoded by hand from the schema", () => {
  assert.equal(viewVectors.length, 18);
  for (const [request, response] of viewVectors) {
    const got = Buffer.from(project.call("TextRequest::dispatch", new Uint8Array(Buffer.from(request, "hex")))).toString("hex");
    assert.equal(got, response, request);
  }
});

test("a frame the model wrote reads back through the library's reader as a valid presentation", () => {
  for (const count of [0, 7, 23, 24, 99, 100, 255]) {
    const h = count.toString(16).padStart(2, "0");
    const response = dec.decode(project.call("TextRequest::dispatch", enc.encode(h + "01")));
    const frame = new Uint8Array(Buffer.from(response.slice(4), "hex"));
    const read = project.call(W + "readViewPresentation", { bytes: frame }, 0n, 4096n);
    assert.equal(read.c, "Result.ok");
    assert.equal(read.a[0].cursor, BigInt(frame.length));
    assert.equal(read.a[0].value.revision, BigInt(count));
    assert.equal(project.call("Foundation.View.Browser.V1.Model::presentationValid", read.a[0].value), true, "valid at " + count);
  }
});

test("a primitive the interpreter lacks is named at load and refuses when called", () => {
  assert.deepEqual(project.missingPrimitives, []);
  const lacking = loadProject({ M: { spec: data.spec, declarations: [{ kind: "definition", name: "f", parameters: [], body: { kind: "primitive", operation: "teleport", arguments: [], result: { kind: "nat" } } }] } });
  assert.deepEqual(lacking.missingPrimitives, ["teleport"]);
  assert.throws(() => lacking.call("M::f"), Unsupported);
});

test("decimal text parses only in its one canonical spelling, inside the width", () => {
  const parse = (text) => project.call("Foundation.Codec::parseInt64", text);
  assert.deepEqual(parse("9223372036854775807"), { c: "Option.some", a: [9223372036854775807n] });
  assert.deepEqual(parse("-9223372036854775808"), { c: "Option.some", a: [-9223372036854775808n] });
  for (const bad of ["9223372036854775808", "05", "-0", "+1", "", " 1", "1.0"]) assert.equal(parse(bad).c, "Option.none", bad);
  assert.equal(project.call("Foundation.Codec::formatInt64", -42n), "-42");
});

test("theorems are listed, not run", () => {
  assert.deepEqual(app.theorems, ["resetClears", "strideKeepsCount"]);
});
