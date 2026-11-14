"""Compares the axioms the driver reports for each theorem with the axioms LexLean's attestation records.

  python3 axioms-agree.py <checker> <library.ndjson> <out.json> <name>=<suffix.ndjson>=<attestation.json> ...

The attestation's `observed` is the SDK image's own `#print axioms` for each declaration. Exits 1 on any difference.
"""
import json, subprocess, sys

checker, library, out = sys.argv[1:4]
report, bad = {}, 0
for arg in sys.argv[4:]:
    name, suffix, attestation = arg.split("=")
    text = subprocess.run([checker, library, suffix], capture_output=True, text=True).stdout
    ours = {}
    for line in text.splitlines():
        if line.startswith("axioms "):
            theorem, _, axioms = line[len("axioms "):].partition(":")
            ours[theorem] = sorted(a.strip() for a in axioms.split(",") if a.strip())
    theirs = {d["name"]: sorted(d["observed"]) for d in json.load(open(attestation))["declarations"]}
    rows = []
    for theorem in sorted(set(ours) & set(theirs)):
        agree = ours[theorem] == theirs[theorem]
        bad += not agree
        rows.append({"theorem": theorem, "driver": ours[theorem], "attestation": theirs[theorem], "agree": agree})
    report[name] = {"compared": len(rows), "agree": sum(r["agree"] for r in rows), "driverOnly": len(set(ours) - set(theirs)), "rows": rows}
    print(name, {k: v for k, v in report[name].items() if k != "rows"})
json.dump(report, open(out, "w"), indent=1)
sys.exit(1 if bad else 0)
