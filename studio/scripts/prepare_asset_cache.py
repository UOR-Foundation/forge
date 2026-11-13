"""Prepare locked archive prerequisites; staging and acceptance remain offline."""
import json
import pathlib
import subprocess

from compiler_assets import COMPILER
from editor_assets import EDITOR, EditorAssetError, fail, load_editor_package, locked_package


def prepare_asset_cache(root):
    receipts = []
    for policy in (EDITOR, COMPILER):
        try:
            _, receipt = load_editor_package(root, policy)
        except EditorAssetError as error:
            # An unpacked node_modules hit does not establish archive availability.
            # Integrity, archive and lock refusals must never trigger a replacement.
            if error.code != 'editorPackageUnavailable':
                raise
            try:
                lock = json.loads((root / policy['lock']).read_text())
            except (OSError, ValueError):
                fail('invalidEditorLock')
            source = locked_package(lock, policy)
            try:
                subprocess.run(['npm', 'cache', 'add', '--ignore-scripts', source['url']],
                               check=True, timeout=60, capture_output=True)
            except (OSError, subprocess.SubprocessError):
                fail('editorPackageUnavailable')
            # Download success is not evidence: reacquire offline and run the same
            # bounded SHA512, identity and archive checks used by shell staging.
            _, receipt = load_editor_package(root, policy)
        receipts.append(receipt)
    return receipts


if __name__ == '__main__':
    root = pathlib.Path(__file__).resolve().parent.parent
    receipts = prepare_asset_cache(root)
    print(f"verified {len(receipts)} locked asset archives in npm's offline cache")
