// FoundrySpecification.proofReuseBoundary: a theorem Lean proved before is not proved again.
//
// Whether Lean's kernel accepts a theorem depends on the verifier, the library files sent with the
// app, the headers of the app's own modules, the theorem's own text and the declarations it names,
// directly or through others. Those bytes give the theorem's address. Declarations it does not reach
// (acceptance vectors, other theorems, the view) are not part of it, so editing one guarantee leaves
// every other guarantee's address where it was. An `axioms:` member is left out of the address: it
// is the policy Lean checks, not what Lean proves, and the record carries the set Lean observed.
//
// A record filed under an address is believed only when the exact files it names hash to their
// digests, still hold the theorem and every declaration it reaches, and the verifier still finds an
// exact attestation under the current toolchain and epoch covering those digests. Otherwise the
// theorem is proved again; a refusal is never
// an error.

export const SCHEMA = "prism/proof-reuse/2";
export const POLICY_EPOCH = "foundry/proof-reuse-trust/1";
const TRUST_SCHEMA = "lexlean-mcp/proof-reuse-trust/1";
const TOOLS = ["lean", "lake", "leanchecker", "lexlean", "compilerSemantics"];
// The two retired Lean executables in prismpm.lock (4.32.1). This is a reuse
// policy, not a claim that any other executable is sound or qualified for release.
const RETIRED_LEAN = new Set([
  "e8baaa71855a616dc351028f3ad2200051b0671f423a1696a100e809302d5550",
  "79fb1d26fa5a39385d59fdc48a711a14b0710ca6480271acce99b4d177cea085",
]);
export const KEY_PREFIX = SCHEMA + ":";

// FoundrySpecification.ProofReuseRefusal.
export const REFUSAL = Object.freeze({
  absent: "proofReuseAbsent",
  malformed: "proofReuseMalformed",
  address: "proofReuseAddressMismatch",
  verifier: "proofReuseVerifierMismatch",
  bytes: "proofReuseBytesMismatch",
  attestation: "proofReuseAttestationNotFound",
  // Admitted, but a theorem being proved names it, so it goes back into the file and is proved again.
  needed: "proofReuseNeededByChange",
  trustUnavailable: "proofReuseTrustUnavailable",
  trustMismatch: "proofReuseTrustMismatch",
});

const OPEN = "\\begin{semanticmodule}";
const KNOWN = new Set(["structure", "inductive", "definition", "theorem"]);
const enc = new TextEncoder();
const isDigest = (v) => typeof v === "string" && /^[0-9a-f]{64}$/.test(v);

/** The service must explicitly bind reuse to its running toolchain and revocation epoch. */
export function trustDescriptor(value) {
  if (!value || value.schema !== TRUST_SCHEMA || !isDigest(value.epoch)
      || !value.toolchain || !TOOLS.every((name) => isDigest(value.toolchain[name]))
      || RETIRED_LEAN.has(value.toolchain.lean)) return null;
  // Copy only the defined fields: later mutation and JSON property order do not alter identity.
  return { schema: TRUST_SCHEMA, epoch: value.epoch,
    toolchain: Object.fromEntries(TOOLS.map((name) => [name, value.toolchain[name]])) };
}
export const sameTrust = (a, b) => {
  const left = trustDescriptor(a), right = trustDescriptor(b);
  return !!left && !!right && JSON.stringify(left) === JSON.stringify(right);
};
export const sameVerifier = (a, b) => !!a && !!b && a.server === b.server
  && a.profile === b.profile && a.profileId === b.profileId && sameTrust(a.trust, b.trust);

/** A digest hit alone does not identify which verifier checked the file. */
export function attests(evidence, attestationId, trust, digests) {
  return !!evidence && evidence.found === true && evidence.status === "verified"
    && isDigest(attestationId) && evidence.attestation_id === attestationId
    && sameTrust(evidence.proof_reuse, trust) && Array.isArray(evidence.files)
    && evidence.files.every(isDigest) && digests.every((digest) => evidence.files.includes(digest));
}
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
export async function sha256(text) { return hex(await crypto.subtle.digest("SHA-256", enc.encode(text))); }

// Length-framed fields, so no field can borrow bytes from its neighbour.
const framed = (fields) => fields.map((f) => `${enc.encode(f).length}:${f}`).join("");

/** End index (inclusive) of the bracket opened at `open`, skipping string literals; -1 if unclosed. */
function closing(text, open) {
  const pair = { "{": "}", "[": "]", "(": ")" };
  const stack = [];
  for (let i = open, inString = false; i < text.length; i++) {
    const c = text[i];
    if (inString) { if (c === "\\") i++; else if (c === '"') inString = false; continue; }
    if (c === '"') inString = true;
    else if (pair[c]) stack.push(pair[c]);
    else if (c === stack.at(-1)) { stack.pop(); if (!stack.length) return i; }
  }
  return -1;
}

/** The module's header (everything before its declarations) and its top-level declarations, in order. */
export function declarationsOf(module) {
  const text = String(module);
  const start = text.indexOf(OPEN);
  if (start < 0) return { header: null, declarations: [] };
  const declarations = [];
  const head = /(^|\n)([a-z_]+)\{/g;
  head.lastIndex = start + OPEN.length;
  for (let m; (m = head.exec(text)); ) {
    const from = m.index + m[1].length, open = from + m[2].length, end = closing(text, open);
    if (end < 0) break;
    const source = text.slice(from, end + 1);
    declarations.push({ kind: m[2], name: /name:\s*([A-Za-z0-9_]+)/.exec(source)?.[1] ?? "", source });
    head.lastIndex = end + 1;
  }
  return { header: text.slice(0, start), declarations };
}

/** A declaration without its `axioms:` member, found at the declaration's own level, never in a string. */
export function withoutAxioms(source) {
  const open = source.indexOf("{");
  for (let i = open + 1, depth = 0, inString = false; i < source.length; i++) {
    const c = source[i];
    if (inString) { if (c === "\\") i++; else if (c === '"') inString = false; continue; }
    if (c === '"') { inString = true; continue; }
    if ("{[(".includes(c)) { depth++; continue; }
    if ("}])".includes(c)) { depth--; continue; }
    if (depth === 0 && c === ",") {
      const m = /^,\s*axioms:\s*\[/.exec(source.slice(i));
      if (m) { const end = closing(source, i + m[0].length - 1); return source.slice(0, i) + source.slice(end + 1); }
    }
  }
  return source;
}

/**
 * The declaration as compared: without `axioms:`, and with layout whitespace outside strings made
 * canonical (a run becomes one space; none after an opening bracket, before a closing one or before
 * a comma), since the formatter re-wraps a declaration when its axioms change. Whitespace between two
 * tokens is kept, so no two different declarations compare equal.
 */
export function canonical(source) {
  const text = withoutAxioms(source);
  let out = "";
  for (let i = 0, inString = false; i < text.length; i++) {
    const c = text[i];
    if (inString) { out += c; if (c === "\\") out += text[++i] ?? ""; else if (c === '"') inString = false; continue; }
    if (c === '"') { inString = true; out += c; continue; }
    if (/\s/.test(c)) {
      while (i + 1 < text.length && /\s/.test(text[i + 1])) i++;
      const next = text[i + 1] ?? "";
      if (!"{[(".includes(out.at(-1) ?? "{") && !"}]),".includes(next)) out += " ";
      continue;
    }
    out += c;
  }
  return out;
}

const word = (name) => new RegExp(`(^|[^A-Za-z0-9_])${name}([^A-Za-z0-9_]|$)`);

/**
 * Every theorem of the author files, with what it reaches: the declarations it names, and those they
 * name, to a fixed point, by whole-word match, so a declaration that might be used is included.
 * A declaration of a kind other than structure, inductive, definition and theorem (an instance, say)
 * can be used without being named, so it is reached by every theorem.
 */
export function theoremsOf(authorFiles) {
  const all = authorFiles.flatMap((f) => declarationsOf(f.content).declarations.map((d) => ({ ...d, path: f.path, canon: canonical(d.source) })));
  return all.filter((d) => d.kind === "theorem").map((t) => {
    const reached = new Set();
    const pending = [t.canon];
    for (const d of all) if (!KNOWN.has(d.kind)) { reached.add(d); pending.push(d.canon); }
    while (pending.length) {
      const text = pending.pop();
      for (const d of all) if (d !== t && !reached.has(d) && d.name && word(d.name).test(text)) { reached.add(d); pending.push(d.canon); }
    }
    return { id: `${t.path}#${t.name}`, name: t.name, path: t.path, source: t.source, canon: t.canon, reached: all.filter((d) => reached.has(d)) };
  });
}

/** Each author file's header, by path. */
export const headersOf = (authorFiles) => Object.fromEntries(authorFiles.map((f) => [f.path, declarationsOf(f.content).header ?? f.content]));

/**
 * The address of every theorem: { [id]: sha256 hex }, an id being `path#name`. `files` are all the files sent, `entrypoints`
 * the author files among them, `verifier` { server, profile, profileId, trust }.
 */
export async function addresses({ files, entrypoints, verifier }) {
  const authors = files.filter((f) => entrypoints.includes(f.path));
  const library = files.filter((f) => !entrypoints.includes(f.path));
  const headers = headersOf(authors);
  const trust = trustDescriptor(verifier.trust);
  if (!trust) throw new Error(REFUSAL.trustUnavailable);
  const shared = [SCHEMA, POLICY_EPOCH, verifier.server, verifier.profile, verifier.profileId,
    trust.schema, trust.epoch, ...TOOLS.flatMap((name) => [name, trust.toolchain[name]]),
    ...library.flatMap((f) => ["library", f.path, f.content]),
    ...authors.flatMap((f) => ["header", f.path, headers[f.path]])];
  const out = {};
  for (const t of theoremsOf(authors)) out[t.id] = await sha256(framed([...shared, "theorem", t.path, t.canon, ...t.reached.flatMap((d) => ["reached", d.path, d.canon])]));
  return out;
}

/** The files with the named theorems taken out of the author files: what Lean is asked when they are reused. */
export function without(files, entrypoints, ids) {
  return files.map((f) => {
    if (!entrypoints.includes(f.path)) return f;
    let content = f.content;
    for (const d of declarationsOf(content).declarations) if (d.kind === "theorem" && ids.has(`${f.path}#${d.name}`)) content = content.replace(d.source, "");
    return { ...f, content: content.replace(/\n{3,}/g, "\n\n").replace(/\n\n(\\end\{semanticmodule\})/, "\n$1") };
  });
}

/** The record filed for one theorem after a verified run: the exact author files the verifier attested. */
export async function record({ theorem, address, verifier, axioms, authorFiles, draft, attestationId, verifiedAt }) {
  const names = new Set([theorem.name, ...theorem.reached.map((d) => d.name)]);
  return {
    schema: SCHEMA, policyEpoch: POLICY_EPOCH, trust: trustDescriptor(verifier.trust), address, theorem: theorem.id,
    server: verifier.server, profile: verifier.profile, profileId: verifier.profileId,
    axioms: Object.fromEntries(Object.entries(axioms).filter(([name]) => names.has(name))),
    files: await Promise.all(authorFiles.map(async (f) => ({ path: f.path, content: f.content, sha256: await sha256(f.content) }))),
    draft, attestation_id: attestationId, verified_at: verifiedAt,
  };
}

const isText = (v) => typeof v === "string" && v.length > 0;
const wellFormed = (e) => e.schema === SCHEMA && isText(e.theorem) && isDigest(e.address) && isDigest(e.attestation_id)
  && e.axioms !== null && typeof e.axioms === "object" && !Array.isArray(e.axioms)
  && Array.isArray(e.files) && e.files.length > 0 && e.files.every((f) => f && isText(f.path) && isText(f.content) && isDigest(f.sha256));

/**
 * Decide whether `entry` may stand for the proof of `theorem` (from theoremsOf of the current author
 * files, whose headers are `headers`). Pure except for `found(attestationId)`: current service evidence for the exact
 * attestation, its toolchain and all file digests. Resolves { admitted: true } or { admitted: false, refusal }.
 */
export async function admit({ entry, theorem, address, verifier, headers, found }) {
  if (entry == null) return { admitted: false, refusal: REFUSAL.absent };
  if (typeof entry !== "object" || !wellFormed(entry) || entry.theorem !== theorem.id) return { admitted: false, refusal: REFUSAL.malformed };
  if (!trustDescriptor(verifier.trust)) return { admitted: false, refusal: REFUSAL.trustUnavailable };
  if (entry.policyEpoch !== POLICY_EPOCH || !sameTrust(entry.trust, verifier.trust)) return { admitted: false, refusal: REFUSAL.trustMismatch };
  if (entry.address !== address) return { admitted: false, refusal: REFUSAL.address };
  if (entry.server !== verifier.server || entry.profile !== verifier.profile || entry.profileId !== verifier.profileId) return { admitted: false, refusal: REFUSAL.verifier };
  for (const f of entry.files) if (await sha256(f.content) !== f.sha256) return { admitted: false, refusal: REFUSAL.bytes };
  // The recorded files are this app's modules: the same paths, with the same headers.
  if (entry.files.length !== Object.keys(headers).length || !entry.files.every((f) => Object.hasOwn(headers, f.path) && declarationsOf(f.content).header === headers[f.path])) return { admitted: false, refusal: REFUSAL.bytes };
  // They hold the theorem and every declaration it reaches, each in its own file, up to `axioms:`.
  const held = new Map(entry.files.map((f) => [f.path, new Set(declarationsOf(f.content).declarations.map((d) => canonical(d.source)))]));
  for (const d of [theorem, ...theorem.reached]) if (!held.get(d.path)?.has(d.canon)) return { admitted: false, refusal: REFUSAL.bytes };
  if (!attests(await found(entry.attestation_id), entry.attestation_id, verifier.trust, entry.files.map((f) => f.sha256))) return { admitted: false, refusal: REFUSAL.attestation };
  return { admitted: true };
}

/** What a proof message adds when some theorems were proved before: nothing when none were. */
export function reuseSentence(total, reused) {
  if (!reused) return "";
  if (reused >= total) return ` Lean proved ${total === 1 ? "it" : "all of them"} before on these exact declarations, so none was proved again.`;
  return ` ${reused} ${reused === 1 ? "was" : "were"} proved before on these exact declarations; Lean proved the other ${total - reused}.`;
}
