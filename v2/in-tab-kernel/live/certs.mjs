// What an app's proof names for the kernel: for each guarantee and each rule, the earlier rules whose boxes touch
// the region to cover. The kernel trusts none of it (live/Certified.lean); a wrong or missing name makes the check
// fail, never pass.
//
//   certsOf(app) -> [{ rules: [[index, ...] per rule], other: [index, ...], facts: [{ key, region, boxes }] }] per guarantee
// app is live/emit.mjs's: { bounds, rules: [{ when, outcome }], otherwise, properties: [{ always, when, outcome }] }
import { createHash } from "node:crypto";

// PrismLive.Kernel's boxOf, meet and nonEmpty, on numbers. `!=` does not narrow.
export function boxOf(bounds, when) {
  const b = bounds.map((x) => [...x]);
  for (const [f, op, v] of when) {
    if (op === 0) { if (v === 0) { b[f][0] = Math.max(b[f][0], 1); b[f][1] = Math.min(b[f][1], 0); } else b[f][1] = Math.min(b[f][1], v - 1); }
    else if (op === 1) b[f][1] = Math.min(b[f][1], v);
    else if (op === 2) b[f][0] = Math.max(b[f][0], v + 1);
    else if (op === 3) b[f][0] = Math.max(b[f][0], v);
    else if (op === 4) { b[f][0] = Math.max(b[f][0], v); b[f][1] = Math.min(b[f][1], v); }
  }
  return b;
}
export const meet = (a, b) => a.map(([l, h], i) => [Math.max(l, b[i][0]), Math.min(h, b[i][1])]);
export const nonEmpty = (b) => b.every(([l, h]) => l <= h);
/** The address of an obligation's meaning: its region, and the boxes subtracted from it, in order. */
export const factKey = (region, boxes) => createHash("sha256").update(JSON.stringify([region, boxes])).digest("hex");

export function certsOf(app) {
  const ruleBoxes = app.rules.map((r) => boxOf(app.bounds, r.when));
  return app.properties.map((p) => {
    const W = boxOf(app.bounds, p.when), bad = (o) => (p.always ? o !== p.outcome : o === p.outcome), facts = [];
    const touching = (A, n) => {
      const M = meet(A, W);
      if (!nonEmpty(M)) return [];                       // nothing to cover: the kernel sees the region is empty
      const sel = []; for (let i = 0; i < n; i++) if (nonEmpty(meet(ruleBoxes[i], M))) sel.push(i);
      const boxes = sel.map((i) => ruleBoxes[i]);
      facts.push({ key: factKey(M, boxes), region: M, boxes, sel });
      return sel;
    };
    return {
      rules: app.rules.map((r, i) => (bad(r.outcome) ? touching(ruleBoxes[i], i) : [])),
      other: bad(app.otherwise) ? touching(app.bounds, app.rules.length) : [],
      facts,
    };
  });
}
