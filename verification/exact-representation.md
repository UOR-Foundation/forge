# Exact byte representation boundary

Authority: `FoundrySpecification.representationBoundary`,
`representationDecoderSpecification`, `ByteIdentity` and `RepresentationError`.
FA-14 implements a typed adapter to browser Web Compression Streams (RFC 1950).
The module adds no package dependency and does not replace SDK behavior.

`forge:pack-bytes` accepts `{bytes, basis}` and returns archive bytes, their
external expected identity and separate accounting. `forge:unpack-bytes` accepts
`{bytes, identity, basis}`. A null basis selects self-contained reconstruction;
a supplied equal-length basis selects XOR-delta reconstruction. Both commands
return typed results and perform no storage or network effects.

Original and basis bytes are capped at 2 MiB, JSON archives at 4 MiB. Inputs are
copied before asynchronous work. Reconstruction verifies the caller-supplied
archive identity, compressed payload, exact decoder specification, optional
basis, original bytes and length. Bounded decompression refuses expansion beyond
the declared original length. Cancellation and deadlines are typed; deadlines
are capped at 30 seconds and host commands use that default.

Every identity carries kind, raw-byte canonicalization, SHA256, version, digest
and byte length. Decoder identity identifies the transformation specification,
not the native browser executable. Accounting distinguishes original, payload,
archive and basis bytes, and explicitly excludes the shared native decoder
implementation. No optimum, performance improvement, application equivalence or
complete production dependency closure is claimed.

FA-14 began with a registered scenario and failing Rust test. Nine Node controls
cover binary/empty/random/repetitive data, conditional bases, each identity layer,
malformed archives, corrupt/truncated streams, expansion, input copying,
cancellation/deadlines, model binding and actual host command bodies. Independent
Node zlib decoding checks output. Real Chromium reconstructs both modes at 2 MiB;
Node zlib independently reconstructs the browser-produced payloads. Missing/wrong
bases and browser cancellation fail explicitly. An additional 2 MiB incompressible
round trip passes locally.

Three planted defects remove archive, original and basis identity checks. The
first archive mutation initially survived: altering an original hash triggered
the inner check with the same error. The control now uses a different valid
compression of the same original bytes, with a correct inner payload identity and
the old outer identity. It isolates the archive check. All three mutations now
fail the complete nine-control suite and were restored.

Full locked-SDK and Studio qualification is required at the reviewed revision;
local diagnostic compilation is not a substitute for that boundary.
