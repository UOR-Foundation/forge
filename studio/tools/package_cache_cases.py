"""FA-31/FA-32 dependency preparation, independent of unpacked module caches."""
import base64
import gzip
import hashlib
import io
import json
import os
import pathlib
import subprocess
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / 'scripts'))
import editor_assets as assets
from compiler_assets import COMPILER, CompilerAssetError, compiler_assets
from prepare_asset_cache import prepare_asset_cache


def fixture(policy):
    rows = {'package/package.json': json.dumps({'name': policy['name'], 'version': policy['version']}).encode()}
    for name in policy['required']:
        path = 'package/' + ('min/' if name.startswith('vs/') else '') + name
        rows[path] = b'independent archive fixture'
    stream = io.BytesIO()
    with tarfile.open(fileobj=stream, mode='w') as archive:
        for path, body in rows.items():
            member = tarfile.TarInfo(path)
            member.size = len(body)
            archive.addfile(member, io.BytesIO(body))
    return gzip.compress(stream.getvalue())


class Preparation(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = pathlib.Path(self.temp.name)
        self.blobs = {}
        for policy in (assets.EDITOR, COMPILER):
            blob = fixture(policy)
            self.blobs[policy['url']] = blob
            target = self.root / policy['lock']
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(json.dumps({'packages': {'node_modules/' + policy['name']: {
                'version': policy['version'], 'resolved': policy['url'],
                'integrity': 'sha512-' + base64.b64encode(hashlib.sha512(blob).digest()).decode()}}}))
        self.present = set()
        self.commands = []
        self.overrides = {}

    def transport(self, command, **options):
        self.commands.append(command)
        self.assertEqual(options['timeout'], 60)
        self.assertTrue(options['check'])
        self.assertTrue(options['capture_output'])
        self.assertIn('--ignore-scripts', command)
        url = command[-1]
        self.assertIn(url, self.blobs)
        if command[:3] == ['npm', 'cache', 'add']:
            self.present.add(url)
        else:
            self.assertEqual(command[:2], ['npm', 'pack'])
            self.assertIn('--offline', command)
            if url not in self.present:
                raise subprocess.CalledProcessError(1, command)
            policy = COMPILER if url == COMPILER['url'] else assets.EDITOR
            archive = pathlib.Path(command[command.index('--pack-destination') + 1]) / f"{policy['name']}-{policy['version']}.tgz"
            archive.write_bytes(self.overrides.get(url, self.blobs[url]))
        return subprocess.CompletedProcess(command, 0)

    def test_real_empty_cache_despite_unpacked_compiler(self):
        package = self.root / 'runtime/node_modules/esbuild-wasm/package.json'
        package.parent.mkdir(parents=True)
        package.write_text('{"name":"esbuild-wasm","version":"0.25.5"}')
        with patch.dict(os.environ, {'npm_config_cache': str(self.root / 'isolated-cache'), 'NPM_CONFIG_CACHE': str(self.root / 'isolated-cache')}):
            with self.assertRaises(CompilerAssetError) as error:
                compiler_assets(self.root)
        self.assertEqual(error.exception.code, 'compilerPackageUnavailable')

    def test_missing_archives_hydrated_then_reacquired_offline(self):
        with patch.object(assets.subprocess, 'run', self.transport):
            receipts = prepare_asset_cache(self.root)
        self.assertEqual(len(receipts), 2)
        self.assertEqual([c[1:3] for c in self.commands], [['pack', '--offline'], ['cache', 'add'], ['pack', '--offline']] * 2)

    def test_valid_archives_reused_without_network(self):
        self.present = set(self.blobs)
        with patch.object(assets.subprocess, 'run', self.transport):
            prepare_asset_cache(self.root)
        self.assertEqual(len(self.commands), 2)
        self.assertTrue(all('--offline' in c for c in self.commands))

    def test_corrupt_archive_refuses_without_hydration(self):
        self.present = set(self.blobs)
        for url in self.blobs:
            self.commands.clear()
            self.overrides = {url: self.blobs[url] + b'corrupt'}
            with patch.object(assets.subprocess, 'run', self.transport):
                with self.assertRaises(assets.EditorAssetError) as error:
                    prepare_asset_cache(self.root)
            self.assertEqual(error.exception.code, 'editorPackageIntegrityMismatch')
            self.assertFalse(any(c[1:3] == ['cache', 'add'] for c in self.commands))

    def test_corrupt_download_refuses(self):
        self.overrides[COMPILER['url']] = b'untrusted bytes'
        with patch.object(assets.subprocess, 'run', self.transport):
            with self.assertRaises(assets.EditorAssetError) as error:
                prepare_asset_cache(self.root)
        self.assertEqual(error.exception.code, 'editorPackageIntegrityMismatch')

    def test_invalid_lock_never_hydrates(self):
        self.present = set(self.blobs)
        target = self.root / COMPILER['lock']
        lock = json.loads(target.read_text())
        lock['packages']['node_modules/esbuild-wasm']['resolved'] = 'https://untrusted.invalid/archive.tgz'
        target.write_text(json.dumps(lock))
        with patch.object(assets.subprocess, 'run', self.transport):
            with self.assertRaises(assets.EditorAssetError) as error:
                prepare_asset_cache(self.root)
        self.assertEqual(error.exception.code, 'invalidEditorLock')
        self.assertFalse(any(c[1:3] == ['cache', 'add'] for c in self.commands))

    def test_failed_hydration_is_typed(self):
        def fail(command, **options):
            raise subprocess.CalledProcessError(1, command)
        with patch.object(assets.subprocess, 'run', fail):
            with self.assertRaises(assets.EditorAssetError) as error:
                prepare_asset_cache(self.root)
        self.assertEqual(error.exception.code, 'editorPackageUnavailable')


if __name__ == '__main__':
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(Preparation)
    result = unittest.TextTestRunner().run(suite)
    print(json.dumps({'tests': result.testsRun, 'skipped': len(result.skipped),
                      'failures': len(result.failures), 'errors': len(result.errors),
                      'expectedFailures': len(result.expectedFailures),
                      'unexpectedSuccesses': len(result.unexpectedSuccesses)}))
    sys.exit(0 if result.wasSuccessful() else 1)
