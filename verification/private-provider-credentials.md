# Private provider credentials

Authority: `FoundrySpecification.privateProviderCredentialBoundary` (FA-47).

Pages assembly previously serialized repository OpenRouter and Featherless keys
into a public `warmup.json`. That export is removed. The browser no longer reads
that file and uses only visitor device settings for either provider. Missing keys
refuse paid inference before disclosure or network; malformed stored credentials
produce fixed private failures. Consent identifies the captured key as visitor
owned. Environment responses report configured presence without key bytes.
Cloud warmup retains the visitor-key and explicit-permission requirements.

Both the actual compiled shell projector and independent staged inventory refuse
legacy credential files, including empty files. This prevents a leftover local
file from silently entering a release after the workflow change. The worker's
existing exclusion of credential files remains in place. This work incorporates
the credential-export concern in maintainer PR #73 while preserving the current
single verified shell closure and all existing acceptance gates.

## Evidence

The registered ID, scenario and failing conformance test preceded implementation.
Six Node controls cover device-only lookup, bounded primitive keys, missing-key
refusal in the actual paid adapter, visitor disclosure, presence-only environment
responses, staged file refusal and mandatory production wiring. The full 284
Node suite, workspace Rust tests/Clippy and shell parsing pass locally.

The Chromium journey injects an available public credential response but observes
zero requests to it and zero provider requests. It verifies missing-key refusal,
both device providers, environment redaction, malformed settings and key removal.
Other external startup resources are blocked by the harness; the zero-network
claim is specifically for credential-file and cloud-provider requests. The full
existing two-provider consent/cancellation journey also passes with zero page
exceptions.

The actual compiled projector and independent inventory both refuse a synthetic
credential file without printing its value. Cleanup removes that fixture,
reprojects the stage and verifies the complete restored closure. Seven planted
defects fail: public fallback, credential coercion, site ownership, omitted
missing-key refusal, omitted inventory check, workflow secret export and removed
projector refusal. All sources and generated local artifacts are restored.

Diagnostic LexLean verification passes for two modules with receipt
`1b363892201162349cf61ecca4e2733827e14d801fb746801b7f33fc5ef8d84d`.
This diagnostic does not replace full exact-head SDK and Studio acceptance.

Browser settings remain readable by same-origin application code. This change
does not rotate provider credentials, remove already published bytes, qualify
remote-user authentication or clear the production release hold. Previously
published credentials require separate owner-controlled rotation.
