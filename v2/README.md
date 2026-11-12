# Foundry v2: evidence so far

Start with [ARCHITECTURE.md](ARCHITECTURE.md). It holds the design, every decision, every measurement and what is not yet established. [PROMPT.md](PROMPT.md) is the brief the work follows.

| Path | What it is |
| --- | --- |
| `probe/` | The first counter model. Lean proved its two theorems about `step`. |
| `probe-app/` | That counter as a text application, with 14 acceptance vectors. Not built into a holo yet. |
| `probe-view/` | The counter on PrismPM's own presentation, intent and CBOR wire modules, copied byte for byte from the pinned SDK image. Checked in the image; not built into a holo yet. |
| `shell/` | The in-tab interpreter (`interp.mjs`), the presentation renderer (`render.mjs`), two pages and the tests. |
| `probe-payment/` | A payment approval app with a form, inputs and a table on that protocol. Lean verified all 9 modules. |
| `loop/` | The model loop: instructions for a model, the harness that checks, proves and runs what it writes, and a guest list an independent model wrote, with five theorems Lean proved. |
| `compare/` | Holds the interpreter to a compiled guest. On PrismPM's Payment Approval holo: 19 of 19 vectors and 10,685 of 10,685 swept requests agree. |

Run:

```bash
node --test v2/shell/test.mjs v2/shell/test-payment.mjs v2/loop/test-guests.mjs
```

```bash
node v2/shell/serve.mjs
```

```bash
cd v2/compare && npm ci && node compare.mjs <PaymentApproval.holo> data/PaymentApproval PaymentApproval::dispatch sweep-payment.mjs
```

To build a probe, copy the repository's `prismpm.lock` beside it first. Local builds currently time out in the SDK's own runtime compile; see ARCHITECTURE.md.

Nothing here is wired into `just vv`. On this branch the gate's format, model audit, template and lock checks pass in the SDK image; the rest of `just vv` was not run locally.
