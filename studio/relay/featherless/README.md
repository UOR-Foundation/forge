# Featherless relay

Lets every Forge visitor use GLM through the site's Featherless plan without the key ever reaching a
browser. The key lives only here, as a Cloudflare Worker secret. `worker.mjs` says what it accepts.

## Deploy

From this folder, signed in to the Cloudflare account that should run it:

```bash
npx wrangler@4 login
npx wrangler@4 secret put FEATHERLESS_KEY
npx wrangler@4 deploy
```

`secret put` asks for the key and sends it straight to Cloudflare; it is never written to a file, a
commit or a GitHub secret. `deploy` prints the Worker's address. If it is not
`https://prism-featherless.trinity-03d.workers.dev`, change `RELAY` in
`studio/shell/inference-effects.mjs` (and the relay test in `studio/tools/inference_effects.test.mjs`)
to match.

To replace the key later, run `secret put FEATHERLESS_KEY` again; no redeploy of Forge is needed.

## Check it

```bash
node --test worker.test.mjs
```

The tests run the worker against a stand-in for Featherless: the site's origin only, offered models
only, bounded requests and answers, the per-visitor limit, concurrency passing through, and the
site's key failures kept private. For a local run in Cloudflare's runtime, put
`FEATHERLESS_KEY=<anything>` in `.dev.vars` (ignored by git) and run `npx wrangler@4 dev`.

## What it forwards

The model, the messages, a bounded `max_tokens`, `temperature`, `top_p` and `stop`. Everything else is dropped. A change to `worker.mjs` reaches visitors only after `npx wrangler@4 deploy`.

`chat_template_kwargs.enable_thinking` is deliberately not forwarded. It was, for about three hours on 2026-11-12: with it set to `false`, Featherless returned GLM 5.3 Flash's whole answer in the reasoning channel and an empty answer, in every one of five requests. The worker was rolled back to the version before it.

It was measured again on 2026-11-13, through this relay, with the `prism/spec/1` prompt and one sentence, one run each:

| request | reasoning channel | answer | total |
|---|---|---|---|
| as deployed | 47 s | a spec in its tag, 9 s | 58 s |
| thinking off | empty | 6,800 characters of deliberation, then three spec blocks | 125 s |
| thinking off and a response schema | 99 s | one bare JSON spec, 9 s | 108 s |
| a response schema only | 35 s | one bare JSON spec, 11 s | 47 s |

GLM 5.3 Flash deliberates whether or not the switch is set; with it off and no schema, it does so in the answer. The switch is therefore not forwarded under any setting.

`FORWARD_RESPONSE_FORMAT`, a `[vars]` entry in `wrangler.toml`, forwards `response_format` of type `json_schema` while it is `"1"`: one schema of at most 8,192 bytes, always sent as strict. Forge sends the `prism/spec/1` shape on a new app's first turn and reads a bare JSON object as the spec. Featherless honours it for GLM 5.3 Flash: both runs above returned exactly the schema's keys and the checker accepted both. It does not shorten the reasoning; it removes malformed and repeated specs.

Three models that do not reason before they answer were measured the same way, with the schema, one run each:

| model | first token | total | the checker |
|---|---|---|---|
| `deepseek-ai/DeepSeek-V3.2` | 7 s | 24 s | accepted the spec, dropping one rule no request reaches |
| `Qwen/Qwen3-30B-A3B-Instruct-2507` | 1 s | 24 s | refused it: `invalid`, a reserved word, written as an answer |
| `google/gemma-4-31B-it` | 1 s | 88 s | refused it, for the same reason |

DeepSeek V3.2 is therefore offered beside GLM 5.3 Flash (`MODELS`, and `FEATHERLESS_MODELS` in `studio/shell/host.js`), and the schema switch is on. One run does not make it the default: that waits for several sentences and runs, counting the guarantees each model writes as well as the time.

Changing it is an edit and `npx wrangler@4 deploy`.

## Limits

`wrangler.toml` holds them: `ALLOWED_ORIGINS`, `MODELS`, `MAX_TOKENS` and 20 requests a minute per
visitor address. The origin check keeps other websites out but not scripts, which can claim any
origin; the per-visitor limit and the Featherless plan's own concurrency are what bound use.
