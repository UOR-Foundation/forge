#!/usr/bin/env bash
# Makes the library pack the prover needs: the runtime library's compiled files, the roots of its export, and the
# pinned export itself. One pack serves every project of one LexLean compiler-semantics ID.
#
#   bash make-pack.sh <staging dir> <library-roots.txt> <library.ndjson> <out.tar.gz>
#
# <staging dir> is LexLean's staging tree, copied while `lexlean verify` runs (../../in-tab-prove/capture-staging.sh):
# verify deletes the .olean.server and .olean.private parts before it publishes, and a module cannot be imported
# without them. Publishing these files from LexLean itself is upstream request 2 in ../../serverless-prove/UPSTREAM.md.
#
# The pack is untrusted, like everything the prover reads. A wrong pack makes a suffix the tab's kernel refuses.
set -euo pipefail
staging=$1; roots=$2; library=$3; out=$4
work=$(mktemp -d); trap 'rm -rf "$work"' EXIT
mkdir -p "$work/oleans"
cp -r "$staging/oleans/LexLeanRuntime" "$work/oleans/"
cp "$roots" "$work/library-roots.txt"
cp "$library" "$work/library.ndjson"
# Fixed order, owner and time, so the same inputs make the same bytes.
tar --sort=name --owner=0 --group=0 --numeric-owner --mtime='2000-01-01 00:00:00Z' -C "$work" -cf - . | gzip -n -9 > "$out"
ls -l "$out"
sha256sum "$out"
