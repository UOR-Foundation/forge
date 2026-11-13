"""Find the upstream releases that ship the fixes upstream.toml records.

    python3 -I scripts/ci/upstream.py [--act]

Prints one line per patch. With --act (upstream.yml), a patch row that names a
patched `image` the pin does not use yet gets an issue, opened once, and
template-update.yml is dispatched to pin it: adopting a fix is adding its row.
A patch whose fix has shipped gets an issue titled for that exact release,
opened once, and the re-pin to the release is dispatched the same way; a pull
request closed without merging gets an issue too. Ported from prism-devrel's
scripts/ci/upstream.py so the two stay diffable. Reads PrismPM history with git, pull
requests and issues with `gh`, images from the registry's public API and
packages from npm, so it needs no credential beyond the workflow token.
"""

import json
import re
import subprocess
import sys
import tomllib
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / "target" / "upstream"


def run(*args, check=True):
    return subprocess.run(args, check=check, capture_output=True, text=True).stdout.strip()


def get(url, headers=None, method="GET"):
    request = urllib.request.Request(url, headers=headers or {}, method=method)
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.headers, response.read()


def history(repository):
    """A blobless clone of the repository's default branch, for ancestry."""
    path = CACHE / repository.replace("/", "-")
    if not path.exists():
        run("git", "init", "-q", str(path))
    run("git", "-C", str(path), "fetch", "-q", "--filter=blob:none",
        f"https://github.com/{repository}.git", "+HEAD:refs/remotes/upstream/HEAD")
    return path


def contains(repo, fix, commit):
    """True when `commit` is on the default branch and descends from `fix`."""
    known = subprocess.run(["git", "-C", str(repo), "cat-file", "-e", f"{commit}^{{commit}}"],
                           capture_output=True).returncode == 0
    return known and subprocess.run(
        ["git", "-C", str(repo), "merge-base", "--is-ancestor", fix, commit],
        capture_output=True).returncode == 0


def committed(repo, commit):
    return int(run("git", "-C", str(repo), "log", "-1", "--format=%ct", commit))


def ghcr(image, repo, fix):
    """The newest sha-<commit> build of `image` whose commit carries `fix`."""
    name = image.removeprefix("ghcr.io/")
    _, body = get(f"https://ghcr.io/token?scope=repository:{name}:pull")
    auth = {"Authorization": f"Bearer {json.loads(body)['token']}"}
    _, body = get(f"https://ghcr.io/v2/{name}/tags/list?n=10000", auth)
    commits = [t[4:] for t in json.loads(body)["tags"] if re.fullmatch(r"sha-[0-9a-f]{40}", t)]
    carrying = [c for c in commits if contains(repo, fix, c)]
    if not carrying:
        return None
    commit = max(carrying, key=lambda c: committed(repo, c))
    accept = ", ".join([
        "application/vnd.oci.image.index.v1+json",
        "application/vnd.docker.distribution.manifest.list.v2+json",
    ])
    headers, _ = get(f"https://ghcr.io/v2/{name}/manifests/sha-{commit}",
                     {**auth, "Accept": accept}, method="HEAD")
    digest = headers["Docker-Content-Digest"]
    return {"name": f"{image}@{digest}", "commit": commit, "digest": digest}


def npm(package, repo, fix):
    """The newest version of `package` whose gitHead carries `fix`."""
    _, body = get(f"https://registry.npmjs.org/{package}")
    meta = json.loads(body)
    carrying = [(meta["time"][v], v, m["gitHead"]) for v, m in meta["versions"].items()
                if m.get("gitHead") and contains(repo, fix, m["gitHead"])]
    if not carrying:
        return None
    _, version, commit = max(carrying)
    return {"name": f"{package}@{version}", "commit": commit}


def branch(repository, repo, fix):
    """The upstream default branch's head, once it carries `fix`."""
    head = run("git", "-C", str(repo), "rev-parse", "refs/remotes/upstream/HEAD").strip()
    if not contains(repo, fix, head):
        return None
    return {"name": f"{repository}@{head[:12]}", "commit": head}


def pull(repository, number):
    return json.loads(run("gh", "api", f"repos/{repository}/pulls/{number}"))


def issue(title, body):
    """Open an issue with this exact title unless one exists; True when opened."""
    existing = json.loads(run("gh", "issue", "list", "--state", "all", "--limit", "1000",
                              "--search", f'"{title}" in:title', "--json", "title"))
    if any(i["title"] == title for i in existing):
        return False
    print(run("gh", "issue", "create", "--title", title, "--body", body))
    return True


def template_update(image, action, standards=""):
    """Dispatch template-update.yml: it reads both platform locks from `image` and opens the re-pin.
    `standards` is the sha256 of the SDK's standards.lock a person reviewed (the row's `standards`);
    without it the template refuses an SDK whose standards differ."""
    lock = json.loads((ROOT / "template.lock").read_text())
    run("gh", "workflow", "run", "template-update.yml", "--ref", "main",
        "-f", f"sdk-image={image}",
        "-f", f"action-reference={action}",
        "-f", f"template-revision={lock['template_revision']}",
        "-f", f"standards-sha256={standards}")


def pinned_action():
    """The PrismPM action commit the workflows use now; a patched image keeps it."""
    found = set(re.findall(r"UOR-Foundation/PrismPM/action@[0-9a-f]{40}",
                           (ROOT / ".github/workflows/prismpm.yml").read_text()))
    if len(found) != 1:
        raise SystemExit("prismpm.yml does not name exactly one PrismPM action commit")
    return found.pop()


def adopt(patch, act):
    """Pin the patched image a row names, once, until a release replaces it."""
    image = patch.get("image")
    if not image:
        return
    current = json.loads((ROOT / "prismpm.lock").read_text())["sdk_image"]
    if current == image:
        print(f"{patch['id']}: pinned to the patched image")
        return
    print(f"{patch['id']}: the pin is {current}; the patched image is {image}")
    if act and patch["repin"] == "template-update" and issue(
            f"Pin {patch['id']} to its patched image",
            f"{patch['what']}\n\nupstream.yml dispatched template-update.yml with `{image}`, the "
            f"PrismPM action commit the workflows use and the template revision template.lock pins; "
            f"its pull request carries the pin."):
        template_update(image, pinned_action(), patch.get("standards", ""))


def main():
    act = "--act" in sys.argv[1:]
    patches = tomllib.loads((ROOT / "upstream.toml").read_text())["patch"]
    for patch in patches:
        repository = patch["repository"]
        fix = patch.get("fix")
        pr = pull(repository, patch["pull"]) if act or not fix else None
        if not fix:
            if pr and pr["merged_at"]:
                fix = pr["merge_commit_sha"]
            elif pr and pr["state"] == "closed":
                line = f"{patch['id']}: {repository}#{patch['pull']} closed without merging"
                print(line)
                if act:
                    issue(f"Upstream PR closed unmerged: {patch['id']}",
                          f"{line}. The local patch stays the only carrier of the fix: "
                          f"open a new upstream PR and record it in upstream.toml.\n\n{patch['what']}")
                continue
            else:
                print(f"{patch['id']}: {repository}#{patch['pull']} is open; no release can carry it yet")
                adopt(patch, act)
                continue
        repo = history(repository)
        kind = patch["release"]["kind"]
        if kind == "ghcr":
            release = ghcr(patch["release"]["image"], repo, fix)
        elif kind == "npm":
            release = npm(patch["release"]["package"], repo, fix)
        elif kind == "branch":
            release = branch(repository, repo, fix)
        else:
            raise SystemExit(f"{patch['id']}: unknown release kind {kind}")
        if not release:
            print(f"{patch['id']}: no {kind} release carries {fix[:12]} yet")
            adopt(patch, act)
            continue
        print(f"{patch['id']}: {release['name']} carries {fix[:12]} (built from {release['commit'][:12]})")
        if not act:
            continue
        body = (f"{release['name']} ships {repository}@{fix} "
                f"({repository}#{patch['pull']}).\n\n{patch['what']}\n\n"
                f"Re-pin `{patch['pinned']}` to it, then delete the `{patch['id']}` row "
                f"from upstream.toml.")
        if patch["repin"] == "template-update":
            body += ("\n\nupstream.yml dispatched template-update.yml with this SDK image, "
                     "its PrismPM action commit and the template revision template.lock pins; "
                     "its pull request carries the re-pin.")
        if issue(f"Re-pin {patch['id']} to {release['name']}", body) and patch["repin"] == "template-update":
            template_update(release["name"], f"UOR-Foundation/PrismPM/action@{release['commit']}")


if __name__ == "__main__":
    main()
