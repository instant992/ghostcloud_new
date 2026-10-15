import importlib.util
import json
import os
from pathlib import Path
import shutil
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('pipeline', Path(__file__).with_name('pipeline.py'))
pipeline = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pipeline)


class SafetyTests(unittest.TestCase):
    def test_sdk_setup_excludes_removed_legacy_tools(self):
        workflow = Path(__file__).with_name('upstream-jni.yml').read_text()
        setup = workflow.split('      - uses: android-actions/setup-android@', 1)[1].split('      - name:', 1)[0]
        self.assertIn('packages: platform-tools', setup)

    def test_patch_fails_closed(self):
        self.assertIn('unix.Dup', pipeline.patch_tun(pipeline.NEEDLE))
        for source in ['', pipeline.NEEDLE * 2, pipeline.REPLACEMENT]:
            with self.assertRaises(RuntimeError):
                pipeline.patch_tun(source)

    def fixture(self, root):
        repo, artifacts = root / 'repo', root / 'artifacts'
        repo.mkdir()
        baseline = {'schema': 1, 'cores': {'sing-box': {'version': 'kept'}, 'uwuray': {'version': 'also-kept'}, 'xray-last': {'tag': 'v26.10.10'}}}
        (repo / 'manifest.json').write_text(json.dumps(baseline))
        pin = {'version': '26.10.13-2347', 'tag': 'v26.10.13-2347', 'commit': 'a' * 40, 'upstream': 'Jolymmiles/Xray-core', 'prerelease': False}
        files = {}
        for abi in pipeline.ABIS:
            rel = f'cores/xray-joly-v26.10.13-2347-aaaaaaaaaaaa-test-1/{abi}/libxrayjoly.so'
            path = artifacts / 'xray-joly' / rel
            path.parent.mkdir(parents=True)
            path.write_bytes(b'test-checksum-fixture')
            files[abi] = {'path': rel, 'sha256': pipeline.hashlib.sha256(path.read_bytes()).hexdigest(), 'size': path.stat().st_size}
        entry = dict(pin, files=files)
        (artifacts / 'xray-joly/manifest.json').write_text(json.dumps({'cores': {'xray-joly': entry}}))
        return repo, artifacts, {'baseline': baseline, 'cores': {'xray-joly': pin}}

    def test_merge_preserves_other_cores(self):
        with tempfile.TemporaryDirectory(dir=os.environ.get('TMPDIR')) as temp:
            repo, artifacts, selection = self.fixture(Path(temp))
            pipeline.merge(repo, artifacts, selection)
            updated = json.loads((repo / 'manifest.json').read_text())
            self.assertEqual(updated['cores']['sing-box'], selection['baseline']['cores']['sing-box'])
            self.assertEqual(updated['cores']['uwuray'], selection['baseline']['cores']['uwuray'])
            for rel, _ in pipeline.checked_files(repo, 'xray-joly', updated['cores']['xray-joly']):
                self.assertTrue((repo / rel).is_file())
            with self.assertRaises(RuntimeError):
                pipeline.merge(repo, artifacts, selection)

    def test_stale_and_hash_failure_do_not_write(self):
        for reason in ['stale', 'hash', 'missing', 'traversal']:
            with self.subTest(reason=reason), tempfile.TemporaryDirectory(dir=os.environ.get('TMPDIR')) as temp:
                repo, artifacts, selection = self.fixture(Path(temp))
                manifest = artifacts / 'xray-joly/manifest.json'
                entry = json.loads(manifest.read_text())
                if reason == 'stale':
                    selection['baseline']['cores']['xray-joly'] = {'tag': 'unexpected'}
                elif reason == 'hash':
                    entry['cores']['xray-joly']['files']['x86']['sha256'] = '0' * 64
                elif reason == 'missing':
                    del entry['cores']['xray-joly']['files']['x86']
                else:
                    entry['cores']['xray-joly']['files']['x86']['path'] = '../outside.so'
                manifest.write_text(json.dumps(entry))
                before = (repo / 'manifest.json').read_bytes()
                with self.assertRaises(RuntimeError):
                    pipeline.merge(repo, artifacts, selection)
                self.assertEqual(before, (repo / 'manifest.json').read_bytes())
                self.assertFalse((repo / 'cores').exists())

    def test_gate_requires_review_and_no_bypass(self):
        original = pipeline.api
        try:
            for env in [{}, {'protection_rules': []}, {'protection_rules': [{'type': 'required_reviewers', 'reviewers': [1]}], 'can_admins_bypass': True}]:
                pipeline.api = lambda _: env
                with self.assertRaises(RuntimeError):
                    pipeline.gate('test/repo')
            pipeline.api = lambda _: {'protection_rules': [{'type': 'required_reviewers', 'reviewers': [1]}], 'can_admins_bypass': False}
            pipeline.gate('test/repo')
        finally:
            pipeline.api = original


if __name__ == '__main__':
    unittest.main()
