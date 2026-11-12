# Probe wire format (version 0)

The probe is a counter app in the bytes-in, bytes-out shape the toolchain builds today.
Its source is [Probe.lex.tex](Probe.lex.tex), byte for byte the hosted draft `spec/ce49c52e…` that Lean verified (semantic ID `6594938af6fa…`).
[ProbeTree.lex.tex](ProbeTree.lex.tex) is the earlier tree-shaped version, kept for comparison.

## Request: 8 hex characters

`CC SS TT AA`: count, stride, event tag, event argument, each one byte in lower-case hex.

| Tag | Event |
| --- | --- |
| 00 | increment |
| 01 | reset |
| 02 | set stride to AA |

Anything else answers `invalid`. A count above 255 answers `overflow`.

## Response

`CC SS` effects `|` view

- Effects: `P` + hex byte (persist that count), or `A` (announce).
- View, a flat display list: `[` open, `]` close, `T` + length + label, `N` + hex byte, `B` + length + label + the 4-character event the button sends.

## Example, worked by hand from the model (not run)

Request `05020000` (count 5, stride 2, increment) should answer:

`0702P07|[T07CounterN07B03Add0000B05Reset0100]`

## What it shows

- State, event, effects and view all cross one pure function, `dispatch : Bytes -> Bytes`.
- A button carries the exact bytes of the event it sends, so the shell needs no app-specific code.
- The view is a flat list with open and close marks, not a tree: a nested tree needs mutual recursion to encode, a flat list does not.

## What it costs

About 120 of the model's 190 lines are hand-written codec. An LLM should not write that per app.
The codec must come from the types: either a shared verified LexLean module or a projector step. This is the next design item.
