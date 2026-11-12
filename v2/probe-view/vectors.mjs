// Writes vectors.json: requests and the responses expected of them, encoded here by hand from
// Wire.cddl, independently of the model. Run: node vectors.mjs
import { writeFileSync } from "node:fs";

const u = (n) => (n < 24 ? [n] : n < 256 ? [0x18, n] : [0x19, n >> 8, n & 255]);
const arr = (...items) => [0x80 + items.length, ...items.flat()];
const text = (s) => { const b = [...Buffer.from(s, "utf8")]; return [0x60 + b.length, ...b]; };
const T = [0xf5], F = [0xf4];
const hex2 = (n) => n.toString(16).padStart(2, "0");
const bytes = (s) => [...Buffer.from(s, "latin1")];

export const presentation = (count) => arr(u(1), u(count), u(0), u(0), u(1), u(0), arr(
  arr(u(0), arr(u(0), u(0))),                     // 1 section "Counter"
  arr(u(1), arr(u(3), u(1), u(0))),               // 2 heading, level 1, "Counter"
  arr(u(1), arr(u(4), text(String(count)))),      // 3 text: the count
  arr(u(1), arr(u(2), u(3))),                     // 4 form "Actions"
  arr(u(4), arr(u(8), u(1), u(1), T, T, arr())),  // 5 action 1 "Add", default
  arr(u(4), arr(u(8), u(2), u(2), T, F, arr())),  // 6 action 2 "Reset"
));
export const intent = (revision, action) => arr(u(1), u(revision), u(action), arr());
// The text application profile requires a UTF-8 response, so the frame travels as lower-case hex.
const ok = (count, stride) => bytes(hex2(count) + hex2(stride) + Buffer.from(presentation(count)).toString("hex"));
const invalid = bytes("invalid"), overflow = bytes("overflow");
const req = (count, stride, tail = []) => [...bytes(hex2(count) + hex2(stride)), ...tail];

const vectors = [
  [req(0, 1), ok(0, 1)],                                  // first view, no intent
  [req(5, 2, intent(5, 1)), ok(7, 2)],                    // add
  [req(9, 3, intent(9, 2)), ok(0, 3)],                    // reset
  [req(23, 1, intent(23, 1)), ok(24, 1)],                 // crosses the one-byte CBOR boundary
  [req(99, 1, intent(99, 1)), ok(100, 1)],                // three digits
  [req(254, 1, intent(254, 1)), ok(255, 1)],
  [req(255, 1, intent(255, 1)), overflow],
  [req(5, 2, intent(5, 3)), invalid],                     // unknown action
  [req(5, 2, intent(4, 1)), invalid],                     // stale revision
  [req(5, 2, [...intent(5, 1), 0]), invalid],             // trailing byte
  [req(5, 2, [0x84, 1, 5, 1]), invalid],                  // truncated intent
  [req(5, 2, [0x84, 1, 0x18, 5, 1, 0x80]), invalid],      // revision not in its shortest form
  [bytes("zz02"), invalid],
  [[], invalid],
  [bytes("050"), invalid],
  [bytes("a".repeat(64)), invalid],
  [bytes("a".repeat(65)), invalid],
  [bytes("a".repeat(128)), invalid],
].map(([q, r]) => [Buffer.from(q).toString("hex"), Buffer.from(r).toString("hex")]);

writeFileSync(new URL("vectors.json", import.meta.url), JSON.stringify(vectors, null, 1) + "\n");
console.log(vectors.length, "vectors; longest response", Math.max(...vectors.map((v) => v[1].length / 2)), "bytes");
