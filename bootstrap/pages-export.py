"""Inventory a Pages export only after a complete metadata-only safety walk."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import sys

POLICY = json.loads((Path(__file__).resolve().parent.parent / "model/pages-release.json").read_text())


class Refused(Exception):
    """A modeled export diagnostic; never include file content in its text."""


def refuse(kind):
    raise Refused(POLICY["diagnostics"][kind])


def identity(info):
    return (info.st_dev, info.st_ino, info.st_mode, info.st_nlink,
            info.st_size, info.st_mtime_ns, info.st_ctime_ns)


def scan(root):
    """Do not open any file until every recursive name and type has passed."""
    if root.is_symlink() or not root.is_dir():
        refuse("invalid")
    files = []
    directories = []
    stack = [root]
    while stack:
        directory = stack.pop()
        info = directory.lstat()
        if not stat.S_ISDIR(info.st_mode):
            refuse("invalid")
        directories.append((directory, identity(info)))
        for entry in sorted(directory.iterdir()):
            if entry.name in POLICY["forbidden_basenames"]:
                refuse("forbidden")
            info = entry.lstat()
            if stat.S_ISDIR(info.st_mode):
                stack.append(entry)
            elif stat.S_ISREG(info.st_mode) and info.st_nlink == 1:
                files.append((entry, identity(info)))
            else:
                refuse("invalid")
    if not files:
        refuse("empty")
    return sorted(files), sorted(directories)


def inventory(root, source):
    if not re.fullmatch(r"[0-9a-f]{40}", source):
        refuse("source")
    files, directories = scan(root)
    result = []
    for path, expected in files:
        if identity(path.lstat()) != expected:
            refuse("changed")
        # A replaced final component can never redirect hashing into another file.
        descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        with os.fdopen(descriptor, "rb") as stream:
            if identity(os.fstat(stream.fileno())) != expected:
                refuse("changed")
            digest = hashlib.sha256()
            while chunk := stream.read(1024 * 1024):
                digest.update(chunk)
            if identity(os.fstat(stream.fileno())) != expected:
                refuse("changed")
        result.append({"path": path.relative_to(root).as_posix(),
                       "size": expected[4], "sha256": digest.hexdigest()})
    # Detect changes, additions, removed paths or new directory links before
    # emitting any inventory. Runners provide isolated artifact workspaces.
    if (files, directories) != scan(root):
        refuse("changed")
    return {"schema": POLICY["schema"], "source_commit": source, "files": result}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    parser.add_argument("root", type=Path)
    args = parser.parse_args()
    try:
        result = inventory(args.root, args.source)
    except Refused as error:
        print(str(error), file=sys.stderr)
        return 1
    except OSError:
        print(POLICY["diagnostics"]["invalid"], file=sys.stderr)
        return 1
    print(json.dumps(result, sort_keys=True, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
