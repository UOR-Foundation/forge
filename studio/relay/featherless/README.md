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

The model, the messages, a bounded `max_tokens`, `temperature`, `top_p`, `stop`, and `chat_template_kwargs.enable_thinking` when it is a boolean: the switch Featherless documents for asking a model not to reason before it answers. Forge sends `false` for a first attempt when its kernel says so (`think 0`, FK-22). Everything else is dropped. A change to `worker.mjs` reaches visitors only after `npx wrangler@4 deploy`.

## Limits

`wrangler.toml` holds them: `ALLOWED_ORIGINS`, `MODELS`, `MAX_TOKENS` and 20 requests a minute per
visitor address. The origin check keeps other websites out but not scripts, which can claim any
origin; the per-visitor limit and the Featherless plan's own concurrency are what bound use.
