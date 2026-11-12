// Wire format version 0 (see ../probe/WIRE.md): decodes a response into state, effects and a flat
// display list. It knows the format, not the app: a button carries the bytes of the event it sends.

export class WireError extends Error {
  constructor(message) { super(message); this.code = "wire.malformed"; }
}

const text = new TextDecoder("utf-8", { fatal: true });

export function decodeResponse(bytes) {
  const s = text.decode(bytes);
  if (s === "invalid" || s === "overflow") return { refused: s };
  const bar = s.indexOf("|");
  if (bar < 4) throw new WireError("no state");
  const state = s.slice(0, 4), effects = [], nodes = [];
  const hex = (at) => { const v = parseInt(s.substr(at, 2), 16); if (s.length < at + 2 || Number.isNaN(v)) throw new WireError("bad byte"); return v; };
  for (let i = 4; i < bar; ) {
    if (s[i] === "P") { effects.push({ kind: "persist", value: hex(i + 1) }); i += 3; }
    else if (s[i] === "A") { effects.push({ kind: "announce" }); i += 1; }
    else throw new WireError("unknown effect");
  }
  for (let i = bar + 1; i < s.length; ) {
    const tag = s[i];
    if (tag === "[") { nodes.push({ kind: "open" }); i += 1; }
    else if (tag === "]") { nodes.push({ kind: "close" }); i += 1; }
    else if (tag === "N") { nodes.push({ kind: "number", value: hex(i + 1) }); i += 3; }
    else if (tag === "T") { const n = hex(i + 1); if (s.length < i + 3 + n) throw new WireError("short text"); nodes.push({ kind: "text", label: s.substr(i + 3, n) }); i += 3 + n; }
    else if (tag === "B") { const n = hex(i + 1); if (s.length < i + 7 + n) throw new WireError("short button"); nodes.push({ kind: "button", label: s.substr(i + 3, n), event: s.substr(i + 3 + n, 4) }); i += 7 + n; }
    else throw new WireError("unknown node");
  }
  return { state, effects, nodes };
}
