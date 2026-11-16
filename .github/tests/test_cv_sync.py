"""Exercise the CV compatibility patch using isolated, local Git remotes."""
from pathlib import Path
import os
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]


class CVSyncTests(unittest.TestCase):
    def command(self, cwd, *args, check=True):
        env = dict(os.environ, GIT_AUTHOR_NAME='Test', GIT_AUTHOR_EMAIL='test@example.invalid',
                   GIT_COMMITTER_NAME='Test', GIT_COMMITTER_EMAIL='test@example.invalid')
        result = subprocess.run(args, cwd=cwd, env=env, text=True, capture_output=True)
        if check and result.returncode:
            self.fail(f'{args}: {result.stdout}\n{result.stderr}')
        return result

    def exercise(self, path):
        with tempfile.TemporaryDirectory() as temp:
            temp = Path(temp)
            cv, website, remote = temp/'cv-source', temp/'website', temp/'remote.git'
            cv.mkdir(); website.mkdir()
            self.command(cv, 'git', 'init', '-b', 'master')
            for name in ('cv_en_latest.pdf', 'cv_zh_latest.pdf'):
                (cv/name).write_bytes(b'%PDF-1.4\nfirst')
            original = ROOT/('_common/cv' if (ROOT/'_common/cv').exists() else 'cv')
            script = cv/'.github/scripts/sync-website.sh'
            script.parent.mkdir(parents=True)
            script.write_text((original/'.github/scripts/sync-website.sh').read_text())
            self.command(cv, 'git', 'apply', '--unidiff-zero', str(ROOT/'.github/migration/cv-sync.patch'))
            self.command(cv, 'git', 'add', '.')
            self.command(cv, 'git', 'commit', '-m', 'old')
            old = self.command(cv, 'git', 'rev-parse', 'HEAD').stdout.strip()
            (cv/'cv_en_latest.pdf').write_bytes(b'%PDF-1.4\nsecond')
            self.command(cv, 'git', 'commit', '-am', 'new')
            new = self.command(cv, 'git', 'rev-parse', 'HEAD').stdout.strip()
            self.command(temp, 'git', 'init', '--bare', str(remote))
            self.command(website, 'git', 'init', '-b', 'master')
            (website/'.gitmodules').write_text('[submodule "cv"]\n path = '+path+'\n url = git@github.com:zhoubohan0/CV-ZBH.git\n')
            (website/'index.html').write_text('keep website content')
            self.command(website, 'git', 'add', '.')
            self.command(website, 'git', 'update-index', '--add', '--cacheinfo', f'160000,{old},{path}')
            self.command(website, 'git', 'commit', '-m', 'website')
            (website/path).mkdir(parents=True)
            self.command(website, 'git', 'remote', 'add', 'origin', str(remote))
            self.command(website, 'git', 'push', '-u', 'origin', 'master')
            self.command(website, 'bash', '-x', str(script), str(website), str(cv))
            changed = self.command(website, 'git', 'diff', 'HEAD^', 'HEAD', '--name-only').stdout.strip()
            self.assertEqual(changed, path)
            self.assertIn(new, self.command(website, 'git', 'ls-tree', '-r', 'HEAD', '--', path).stdout)
            self.assertEqual((website/'index.html').read_text(), 'keep website content')
            before = self.command(website, 'git', 'rev-parse', 'HEAD').stdout
            self.command(website, 'bash', '-x', str(script), str(website), str(cv))
            self.assertEqual(before, self.command(website, 'git', 'rev-parse', 'HEAD').stdout)

    def test_original_path(self):
        self.exercise('cv')

    def test_nested_path(self):
        self.exercise('_common/cv')


if __name__ == '__main__':
    unittest.main()
