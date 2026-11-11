"""FR-01: no live credentials are used or read by these negative fixtures."""
import hashlib
import json
import os
import re
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent.parent
GUARD = ROOT / "bootstrap/pages-export.py"
SHA = "e7d1703a66138169ae5864ef27a3891f6fa181bb"


def verify_workflow(source):
    """Inspect the reviewed, deliberately fixed YAML job/step shape."""
    if any(token in source for token in ["secrets.", "actions/cache", "cache: npm",
                                        "continue-on-error: true", "workflow_dispatch:"]):
        return False
    for job in ["acceptance", "studio", "browser", "codespace", "build", "forge", "deploy"]:
        if source.count("\n  " + job + ":\n") != 1:
            return False
    sections = re.split(r"\n  [a-z-]+:\n", source)[1:]
    jobs = dict(zip(re.findall(r"\n  ([a-z-]+):\n", source), sections))
    if "runner: [ubuntu-24.04, ubuntu-24.04-arm]" not in jobs["acceptance"]:
        return False
    if "exec just vv" not in jobs["acceptance"]:
        return False
    for command in ["npm run test:try", "npm run test:identity",
                    'node frame/publish.mjs "$RUNNER_TEMP/frame" "$GITHUB_SHA"',
                    'node identity/publish.mjs "$RUNNER_TEMP/identity" "$GITHUB_SHA"']:
        if command not in jobs["browser"]:
            return False
    if "devcontainer up --workspace-folder . --config .devcontainer/try/devcontainer.json" not in jobs["codespace"]:
        return False
    if "devcontainer exec --workspace-folder . --config .devcontainer/try/devcontainer.json" not in jobs["codespace"]:
        return False
    for name in ["build", "forge", "deploy"]:
        if "    needs: [acceptance, studio, browser, codespace]\n" not in jobs[name] and name != "deploy":
            return False
    if "    needs: [acceptance, studio, browser, codespace, build, forge]\n" not in jobs["deploy"]:
        return False
    if "      name: github-pages\n" not in jobs["deploy"]:
        return False
    for name in ["acceptance", "studio", "browser", "codespace", "build", "forge", "deploy"]:
        # No per-job or per-step omission, except the pre-existing fork exclusion.
        for line in jobs[name].splitlines():
            if line.lstrip().startswith("if:") and line.strip() != "if: github.repository != 'UOR-Foundation/template'":
                return False
    for job, target, upload in [("build", "site", "actions/upload-artifact@"),
                                ("forge", "studio/shell", "actions/upload-artifact@"),
                                ("deploy", "out", "actions/upload-pages-artifact@")]:
        steps = jobs[job].split("\n      - ")[1:]
        matching = [i for i, step in enumerate(steps)
                    if 'bootstrap/pages-export.py --source "$SOURCE_COMMIT" ' + target + ' >' in step]
        if len(matching) != 1:
            return False
        index = matching[0]
        if index + 1 >= len(steps) or upload not in steps[index + 1]:
            return False
        if job == "deploy" and not steps[index].strip().endswith('cmp "$RUNNER_TEMP/combined-before.json" "$RUNNER_TEMP/combined-inventory.json"'):
            return False
    if 'cmp "$RUNNER_TEMP/combined-before.json" "$RUNNER_TEMP/combined-inventory.json"' not in jobs["deploy"]:
        return False
    return "lhci autorun --config=lighthouserc.json" in jobs["build"] and "node bootstrap/screens.mjs site screens" in jobs["build"]


class ExportBoundary(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / "out"
        self.root.mkdir()
        (self.root / "index.html").write_text("inert fixture\n")

    def run_guard(self, root=None, sha=SHA):
        return subprocess.run(
            [sys.executable, "-I", "-B", str(GUARD), "--source", sha,
             str(root if root is not None else self.root)],
            capture_output=True, text=True, check=False,
        )

    def assert_rejected(self, result, diagnostic):
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertEqual(result.stdout, "", "failures must not emit a partial inventory")
        self.assertIn(diagnostic, result.stderr)
        self.assertNotIn("inert fixture", result.stderr)

    def test_implementation_exists(self):
        self.assertTrue(GUARD.is_file(), "FR-01 export implementation is absent")

    def test_regular_files_have_reproducible_inventory(self):
        (self.root / ".nojekyll").write_bytes(b"")
        (self.root / "app").mkdir()
        (self.root / "app" / "index.html").write_bytes(b"prism fixture\n")
        a = self.run_guard()
        b = self.run_guard()
        self.assertEqual(a.returncode, 0, a.stderr)
        self.assertEqual(a.stdout, b.stdout)
        data = json.loads(a.stdout)
        self.assertEqual(data["source_commit"], SHA)
        self.assertEqual(data["schema"], "foundry/pages-export/1")
        self.assertEqual([x["path"] for x in data["files"]],
                         [".nojekyll", "app/index.html", "index.html"])
        before = Path(self.temp.name) / "producer-inventory.json"
        after = Path(self.temp.name) / "final-inventory.json"
        before.write_text(a.stdout)
        original = (self.root / "index.html").read_bytes()
        (self.root / "index.html").write_bytes(b"changed inert fixture\n")
        changed = self.run_guard()
        self.assertEqual(changed.returncode, 0, changed.stderr)
        after.write_text(changed.stdout)
        self.assertEqual(subprocess.run(["cmp", "-s", str(before), str(after)], check=False).returncode, 1)
        (self.root / "index.html").write_bytes(original)
        after.write_text(self.run_guard().stdout)
        self.assertEqual(subprocess.run(["cmp", "-s", str(before), str(after)], check=False).returncode, 0)
        for item in data["files"]:
            content = (self.root / item["path"]).read_bytes()
            self.assertEqual(item["sha256"], hashlib.sha256(content).hexdigest())
            self.assertEqual(item["size"], len(content))

    def test_forbidden_name_at_every_depth_and_type_is_unread(self):
        # Empty inert fixtures, including directories/FIFOs, establish that the
        # refusal happens on the name before opening or hashing any content.
        for index, relative in enumerate(["warmup.json", "nested/shell/warmup.json", "app/warmup.json",
                         ".hidden/warmup.json", "warmup.json/nested"]):
            with self.subTest(path=relative):
                temp = Path(self.temp.name) / str(index)
                temp.mkdir(exist_ok=True)
                target = temp / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                target.touch()
                self.assert_rejected(self.run_guard(temp), "PAGES_EXPORT_FORBIDDEN")
        fifo = self.root / "warmup.json"
        os.mkfifo(fifo)
        self.assert_rejected(self.run_guard(), "PAGES_EXPORT_FORBIDDEN")

    def test_nonregular_entries_are_rejected(self):
        for kind in ["symlink", "directory-link", "dangling-link", "hardlink", "fifo"]:
            with self.subTest(kind=kind):
                target = self.root / "invalid"
                if kind == "symlink":
                    target.symlink_to(self.root / "index.html")
                elif kind == "directory-link":
                    target.symlink_to(self.root, target_is_directory=True)
                elif kind == "dangling-link":
                    target.symlink_to(self.root / "missing")
                elif kind == "hardlink":
                    os.link(self.root / "index.html", target)
                else:
                    os.mkfifo(target)
                try:
                    self.assert_rejected(self.run_guard(), "PAGES_EXPORT_INVALID")
                finally:
                    target.unlink()

    def test_missing_empty_and_symlink_roots_are_rejected(self):
        self.assert_rejected(self.run_guard(self.root / "missing"), "PAGES_EXPORT_INVALID")
        empty = Path(self.temp.name) / "empty"
        empty.mkdir()
        self.assert_rejected(self.run_guard(empty), "PAGES_EXPORT_EMPTY")
        link = Path(self.temp.name) / "link"
        link.symlink_to(self.root, target_is_directory=True)
        self.assert_rejected(self.run_guard(link), "PAGES_EXPORT_INVALID")

    def test_workflow_wiring(self):
        source = (ROOT / ".github/workflows/pages.yml").read_text()
        self.assertTrue(verify_workflow(source), "release workflow boundary is incomplete")
        policy = json.loads((ROOT / "model/pages-release.json").read_text())
        self.assertEqual(hashlib.sha256(source.encode()).hexdigest(), policy.get("workflow_sha256"))
        self.assertEqual(hashlib.sha256((ROOT / "lighthouserc.json").read_bytes()).hexdigest(),
                         policy.get("lighthouse_sha256"))

    def test_workflow_checker_rejects_representative_omissions(self):
        source = (ROOT / ".github/workflows/pages.yml").read_text()
        self.assertTrue(verify_workflow(source), "positive control must pass")
        changes = [
            ('bootstrap/pages-export.py --source "$SOURCE_COMMIT" out >', 'true # '),
            ('bootstrap/pages-export.py --source "$SOURCE_COMMIT" studio/shell >', 'true # '),
            ("needs: [acceptance, studio, browser, codespace, build, forge]", "needs: [build, forge]"),
            ("exec just vv", "exec just app"),
            ("npm run test:try", "true"),
            ("npm run test:identity", "true"),
            ("devcontainer up --workspace-folder . --config .devcontainer/try/devcontainer.json", "true"),
            ("devcontainer exec --workspace-folder . --config .devcontainer/try/devcontainer.json", "true"),
            ("runner: [ubuntu-24.04, ubuntu-24.04-arm]", "runner: [ubuntu-24.04]"),
            ("lhci autorun --config=lighthouserc.json", "true"),
            ("node bootstrap/screens.mjs site screens", "true"),
            ("name: github-pages", "name: unprotected"),
            ('cmp "$RUNNER_TEMP/combined-before.json" "$RUNNER_TEMP/combined-inventory.json"', "true"),
        ]
        for before, after in changes:
            with self.subTest(change=before):
                self.assertIn(before, source)
                self.assertFalse(verify_workflow(source.replace(before, after)))
        self.assertFalse(verify_workflow(source + "\n# secrets.EXAMPLE\n"))
        self.assertFalse(verify_workflow(source + "\n# actions/cache\n"))

        # Exercise the actual production comparison program, not a second implementation.
        marker = '          python3 -I - "$RUNNER_TEMP/combined-before.json" "$SOURCE_COMMIT" <<\'PYTHON\'\n'
        program = source.split(marker, 1)[1].split("          PYTHON\n", 1)[0]
        program = "\n".join(line[10:] for line in program.splitlines()) + "\n"
        work = Path(self.temp.name) / "compare"
        (work / "evidence/forge").mkdir(parents=True)
        (work / "evidence/prism").mkdir(parents=True)
        (work / "model").mkdir()
        (work / "model/pages-release.json").write_bytes((ROOT / "model/pages-release.json").read_bytes())
        file = {"path": "index.html", "size": 1, "sha256": "a" * 64}
        forge = {"schema": "foundry/pages-export/1", "source_commit": SHA, "files": [file]}
        prism = dict(forge)
        combined = dict(forge, files=[dict(file, path="app/index.html"), file])
        combined_path = work / "combined.json"
        combined_path.write_text(json.dumps(combined))
        (work / "evidence/prism/prism-inventory.json").write_text(json.dumps(prism))
        cases = [(forge, 0), (dict(forge, schema="other"), 1),
                 (dict(forge, source_commit="b" * 40), 1),
                 (dict(forge, files=[]), 1),
                 (dict(forge, files=[dict(file, path="../index.html")]), 1),
                 (dict(forge, files=[file, file]), 1),
                 (dict(forge, extra=True), 1),
                 ({key: value for key, value in forge.items() if key != "schema"}, 1),
                 (dict(forge, files=[dict(file, path="/index.html")]), 1),
                 (dict(forge, files=[dict(file, path="a//index.html")]), 1),
                 (dict(forge, files=[dict(file, path="app/warmup.json")]), 1),
                 (dict(forge, files=[dict(file, size=True)]), 1),
                 (dict(forge, files=[dict(file, size=-1)]), 1),
                 (dict(forge, files=[dict(file, sha256="not-a-hash")]), 1)]
        for manifest, expected in cases:
            with self.subTest(manifest=manifest):
                (work / "evidence/forge/forge-inventory.json").write_text(json.dumps(manifest))
                result = subprocess.run([sys.executable, "-I", "-", str(combined_path), SHA],
                                        input=program, cwd=work, capture_output=True, text=True, check=False)
                self.assertEqual(result.returncode, expected, result.stderr)

    def test_untrusted_source_commit_is_rejected(self):
        for sha in ["main", "a" * 39, "$(echo unsafe)", "a" * 40 + "\n"]:
            with self.subTest(sha=sha):
                self.assert_rejected(self.run_guard(sha=sha), "PAGES_EXPORT_SOURCE")


if __name__ == "__main__":
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(ExportBoundary)
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    if result.testsRun != 8 or result.skipped or result.expectedFailures or result.unexpectedSuccesses:
        sys.exit("FR-01: incomplete or skipped test execution")
    if not result.wasSuccessful():
        sys.exit(1)
    print("FR-01: 8 tests, no skips, all passed")
