// Featherless for every Forge visitor, as a Cloudflare Worker.
//
// Forge runs in the visitor's browser, where no secret can live: a key in the page is a key for anyone.
// This worker holds the site's Featherless key as a Worker secret and forwards one kind of request, a
// streamed chat completion for a model the site offers, adding the key on the way. The visitor's own
// key, when they have one, never comes here: Forge then calls Featherless directly.
//
//   POST /v1/chat/completions   an OpenAI chat completion; the answer streams back unchanged
//
// Every request is checked before Featherless is called:
// - it comes from a page the site serves (ALLOWED_ORIGINS);
// - its visitor is within the per-minute limit (the PER_VISITOR rate limit, keyed by address);
// - it is at most 2 MiB of JSON naming an offered model (MODELS), with at most MAX_TOKENS to write;
// - only the fields a chat completion needs are passed on; anything else is dropped.
// The origin check keeps other sites from using the key; a script can claim any origin, so the
// per-visitor limit and the plan's own concurrency limit are what bound use.
//
// Deploy (README.md): wrangler secret put FEATHERLESS_KEY, then wrangler deploy. No dependencies.

const UPSTREAM = "https://api.featherless.ai/v1/chat/completions";
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_MESSAGES = 400;
const MAX_ERROR_BYTES = 65536;
const ROLES = new Set(["system", "user", "assistant"]);

class Refusal extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const list = (text) => String(text ?? "").split(",").map((s) => s.trim()).filter(Boolean);

function cors(origin) {
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
    vary: "origin",
  };
}

const json = (body, status, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers } });

// The request as Featherless will see it: an offered model, well-formed messages, a bounded answer.
export function shape(body, env) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Refusal(400, "the request is not a JSON object");
  const models = list(env.MODELS);
  if (!models.includes(body.model)) throw new Refusal(400, "this model is not offered here");
  if (!Array.isArray(body.messages) || body.messages.length === 0 || body.messages.length > MAX_MESSAGES) throw new Refusal(400, "messages must be a non-empty list");
  for (const m of body.messages) {
    if (!m || typeof m !== "object" || !ROLES.has(m.role)) throw new Refusal(400, "a message has no allowed role");
    const textPart = (p) => p && typeof p === "object" && p.type === "text" && typeof p.text === "string";
    if (typeof m.content !== "string" && !(Array.isArray(m.content) && m.content.every(textPart))) throw new Refusal(400, "a message's content is not text");
  }
  const cap = Number.parseInt(env.MAX_TOKENS, 10) || 32768;
  const out = { model: body.model, messages: body.messages.map((m) => ({ role: m.role, content: m.content })), stream: body.stream === true };
  out.max_tokens = Number.isSafeInteger(body.max_tokens) && body.max_tokens > 0 ? Math.min(body.max_tokens, cap) : cap;
  for (const f of ["temperature", "top_p"]) {
    const v = typeof body[f] === "string" ? Number(body[f]) : body[f];
    if (typeof v === "number" && Number.isFinite(v)) out[f] = Math.min(Math.max(v, 0), 2);
  }
  if (Array.isArray(body.stop) && body.stop.length <= 4 && body.stop.every((s) => typeof s === "string" && s.length <= 64)) out.stop = body.stop;
  // Whether the model reasons before it answers: the one switch Featherless documents, and only as a boolean.
  const kw = body.chat_template_kwargs;
  if (kw && typeof kw === "object" && !Array.isArray(kw) && typeof kw.enable_thinking === "boolean") out.chat_template_kwargs = { enable_thinking: kw.enable_thinking };
  if (out.stream) out.stream_options = { include_usage: true };
  return out;
}

async function relay(request, env, origin) {
  if (!env.FEATHERLESS_KEY) throw new Refusal(503, "the relay has no key");
  const visitor = request.headers.get("cf-connecting-ip") || "unknown";
  if (env.PER_VISITOR) {
    const { success } = await env.PER_VISITOR.limit({ key: visitor });
    if (!success) throw new Refusal(429, "too many requests from this visitor; try again in a minute");
  }
  if (!/^application\/json(\s*;|$)/i.test(request.headers.get("content-type") || "")) throw new Refusal(415, "send JSON");
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > MAX_BYTES) throw new Refusal(413, "the request is too large");
  const raw = await request.arrayBuffer();
  if (raw.byteLength > MAX_BYTES) throw new Refusal(413, "the request is too large");
  let body;
  try {
    body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw));
  } catch {
    throw new Refusal(400, "the request is not JSON");
  }
  const upstream = await fetch(UPSTREAM, {
    method: "POST",
    headers: { authorization: `Bearer ${env.FEATHERLESS_KEY}`, "content-type": "application/json" },
    body: JSON.stringify(shape(body, env)),
  });
  const headers = { ...cors(origin), "cache-control": "no-store" };
  if (upstream.ok) {
    headers["content-type"] = upstream.headers.get("content-type") || "text/event-stream";
    return new Response(upstream.body, { status: 200, headers });
  }
  // The site's key failing is the site's fault, not the visitor's: say so, without passing on what
  // Featherless said about the key. Concurrency (429) passes through, so Forge waits for a free slot.
  if (upstream.status === 401 || upstream.status === 403 || upstream.status === 402) throw new Refusal(502, "the site's Featherless access is unavailable");
  const text = (await upstream.text()).slice(0, MAX_ERROR_BYTES);
  return new Response(upstream.status === 429 ? text : JSON.stringify({ error: "Featherless could not answer" }), {
    status: upstream.status === 429 ? 429 : 502,
    headers: { ...headers, "content-type": upstream.status === 429 ? "text/plain; charset=utf-8" : "application/json; charset=utf-8" },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("origin") || "";
    const allowed = list(env.ALLOWED_ORIGINS).includes(origin);
    if (url.pathname !== "/v1/chat/completions") return json({ error: "not found" }, 404);
    if (!allowed) return json({ error: "this origin may not use the relay" }, 403);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
    if (request.method !== "POST") return json({ error: "use POST" }, 405, cors(origin));
    try {
      return await relay(request, env, origin);
    } catch (error) {
      const status = error instanceof Refusal ? error.status : 500;
      return json({ error: error instanceof Refusal ? error.message : "the relay failed" }, status, cors(origin));
    }
  },
};
