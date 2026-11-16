from pathlib import Path
import importlib.util
import json
import os
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('build_site', ROOT/'.github/scripts/build_site.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


class ExportTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.root = self.base/'source'
        self.root.mkdir()
        self.git(self.root, 'init', '-b', 'master')
        self.cv = self.root/'_common/cv'
        self.cv.mkdir(parents=True)
        self.git(self.cv, 'init', '-b', 'master')
        for name in builder.PDF_NAMES:
            (self.cv/name).write_bytes(b'%PDF-1.4\npublic PDF')
        (self.cv/'private.tex').write_text('PRIVATE CV SOURCE')
        self.git(self.cv, 'add', '.')
        self.git(self.cv, 'commit', '-m', 'CV')
        self.write('.gitmodules', '[submodule "cv"]\n path = _common/cv\n url = '+builder.CV_URL+'\n')
        self.write('.github/migration/inventory.json', json.dumps({'files':[{'old':'assets/unused.txt','new':'_common/assets/unused.txt'}]}))
        self.write('_common/assets/unused.txt', 'retain unused material')
        self.write('notes/private.md', 'NOT PUBLIC')
        for version in ['v1','v2']:
            for name in ['index.html','publications/index.html','404.html']:
                self.write(version+'/'+name, version+' '+name)
        self.git(self.root, 'add', '.')
        self.git(self.root, 'commit', '-m', 'website')

    def git(self, root, *args):
        env = dict(os.environ, GIT_AUTHOR_NAME='Test', GIT_AUTHOR_EMAIL='test@example.invalid',
                   GIT_COMMITTER_NAME='Test', GIT_COMMITTER_EMAIL='test@example.invalid')
        return subprocess.check_output(['git','-C',str(root),*args], env=env, stderr=subprocess.DEVNULL)

    def write(self, path, text):
        p=self.root/path; p.parent.mkdir(parents=True,exist_ok=True);p.write_text(text)

    def test_head_export_ignores_dirty_files_and_private_cv(self):
        self.write('v2/index.html', 'uncommitted change')
        self.write('v2/untracked.txt', 'untracked')
        (self.cv/'cv_en_latest.pdf').write_bytes(b'%PDF-1.4\ndirty CV')
        out=builder.build(self.base/'head',root=self.root)
        self.assertEqual((out/'index.html').read_text(),'v2 index.html')
        self.assertFalse((out/'v2/untracked.txt').exists())
        self.assertFalse((out/'notes').exists())
        self.assertFalse((out/'.gitmodules').exists())
        self.assertEqual(sorted(p.name for p in (out/'_common/cv').iterdir()),sorted(builder.PDF_NAMES))
        for name in builder.PDF_NAMES:
            self.assertEqual((out/'_common/cv'/name).read_bytes(),b'%PDF-1.4\npublic PDF')
            self.assertEqual((out/'cv'/name).read_bytes(),(out/'_common/cv'/name).read_bytes())
        self.assertEqual((out/'assets/unused.txt').read_bytes(),(out/'_common/assets/unused.txt').read_bytes())
        self.assertTrue((out/'.nojekyll').exists())

    def test_preview_and_v1_rollback(self):
        self.write('v2/index.html','worktree preview')
        preview=builder.build(self.base/'preview',mode='worktree',root=self.root)
        self.assertEqual((preview/'index.html').read_text(),'worktree preview')
        rollback=builder.build(self.base/'rollback',default_version='v1',root=self.root)
        self.assertEqual((rollback/'index.html').read_text(),'v1 index.html')
        self.assertTrue((rollback/'v2/index.html').exists())

    def test_rejects_symlinks_and_unsafe_destination(self):
        (self.root/'_common/leak').symlink_to(self.cv/'private.tex')
        with self.assertRaisesRegex(RuntimeError,'Unsupported public file type'):
            builder.build(self.base/'bad',mode='worktree',root=self.root)
        with self.assertRaisesRegex(RuntimeError,'outside the checkout'):
            builder.build(self.root/'public',root=self.root)

    def test_refuses_wrong_cv_commit(self):
        self.git(self.cv,'commit','--allow-empty','-m','different pin')
        with self.assertRaisesRegex(RuntimeError,'pinned commit'):
            builder.build(self.base/'bad-pin',root=self.root)


if __name__=='__main__':
    unittest.main()
