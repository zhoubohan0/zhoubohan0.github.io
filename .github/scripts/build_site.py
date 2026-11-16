"""Export versioned static sites and only the two public PDFs from the private CV."""
import argparse
import configparser
import hashlib
import json
from pathlib import Path, PurePosixPath
import subprocess

ROOT = Path(__file__).resolve().parents[2]
PDF_NAMES = ('cv_en_latest.pdf', 'cv_zh_latest.pdf')
CV_URL = 'git@github.com:zhoubohan0/CV-ZBH.git'


def git(repo, *args):
    return subprocess.check_output(['git', '-C', str(repo), *args])


class Source:
    def __init__(self, root, mode):
        self.root, self.mode = Path(root).resolve(), mode

    def read(self, path):
        path = PurePosixPath(path)
        if path.is_absolute() or '..' in path.parts:
            raise RuntimeError('Unsafe source path')
        if self.mode == 'head':
            return git(self.root, 'show', f'HEAD:{path}')
        source = self.root / path
        if source.is_symlink() or self.root not in source.resolve().parents:
            raise RuntimeError(f'Unsafe source file: {path}')
        return source.read_bytes()

    def files(self):
        if self.mode == 'head':
            for entry in filter(None, git(self.root, 'ls-tree', '-rz', 'HEAD').split(b'\0')):
                meta, path = entry.split(b'\t', 1)
                mode, kind, _ = meta.decode().split()
                yield path.decode(), mode, kind
        else:
            paths = git(self.root, 'ls-files', '-z', '--cached', '--others', '--exclude-standard').split(b'\0')
            for raw in sorted(set(filter(None, paths))):
                path = raw.decode()
                item = self.root/path
                if item.is_symlink():
                    yield path, '120000', 'blob'
                elif item.is_file():
                    yield path, '100644', 'blob'


def cv_settings(source):
    config = configparser.ConfigParser()
    config.read_string(source.read('.gitmodules').decode())
    path = config.get('submodule "cv"', 'path')
    if path not in ('cv', '_common/cv') or config.get('submodule "cv"', 'url') != CV_URL:
        raise RuntimeError('Unexpected CV submodule configuration')
    if source.mode == 'head':
        entry = git(source.root, 'ls-tree', '-r', 'HEAD', '--', path).decode().strip()
        meta, actual = entry.split('\t')
        mode, kind, sha = meta.split()
    else:
        entry = git(source.root, 'ls-files', '--stage', '--', path).decode().strip()
        meta, actual = entry.split('\t')
        mode, sha, stage = meta.split()
        kind = 'commit' if stage == '0' else 'conflict'
    if (mode, kind, actual) != ('160000', 'commit', path):
        raise RuntimeError('CV must be an unconflicted Git submodule')
    if git(source.root/path, 'rev-parse', 'HEAD').decode().strip() != sha:
        raise RuntimeError('CV checkout does not match its pinned commit')
    return path, sha


def build(destination, mode='head', default_version='v2', root=ROOT):
    source = Source(root, mode)
    destination = Path(destination).resolve()
    if destination == source.root or source.root in destination.parents:
        raise RuntimeError('The public export must be outside the checkout')
    if destination.exists() and any(destination.iterdir()):
        raise RuntimeError('The public export directory must be empty')
    cv_path, cv_sha = cv_settings(source)
    inventory = json.loads(source.read('.github/migration/inventory.json'))
    destination.mkdir(parents=True, exist_ok=True)

    def write(path, data):
        path = PurePosixPath(path)
        if path.is_absolute() or '..' in path.parts:
            raise RuntimeError('Unsafe export path')
        target = destination/path
        if target.exists():
            if target.read_bytes() != data:
                raise RuntimeError(f'Conflicting public output: {path}')
            return
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)

    for name, file_mode, kind in source.files():
        path = PurePosixPath(name)
        if path.parts[0] not in ('_common', 'v1', 'v2'):
            continue
        # Skip private data before file checks; never recursively copy this checkout.
        if name == cv_path or name.startswith(cv_path+'/'):
            continue
        if any(p.startswith('.') or p == '__pycache__' for p in path.parts):
            continue
        if kind != 'blob' or file_mode not in ('100644', '100755'):
            raise RuntimeError(f'Unsupported public file type: {name}')
        write(name, source.read(name))

    for name in ('index.html', 'publications/index.html', '404.html'):
        write(name, source.read(f'{default_version}/{name}'))
    reserved = {'index.html', 'publications/index.html', '404.html', 'sitemap.xml'}
    for item in inventory['files']:
        if item['old'] not in reserved:
            write(item['old'], source.read(item['new']))
    for name in PDF_NAMES:
        data = git(source.root/cv_path, 'show', f'{cv_sha}:{name}')
        if not data.startswith(b'%PDF-'):
            raise RuntimeError(f'Invalid PDF: {name}')
        write('_common/cv/'+name, data)
        write('cv/'+name, data)
        print(f'{name}: sha256={hashlib.sha256(data).hexdigest()}')
    for folder in ('_common/cv', 'cv'):
        if sorted(p.name for p in (destination/folder).iterdir()) != sorted(PDF_NAMES):
            raise RuntimeError('Unexpected private files in public CV directory')
    write('sitemap.xml', b'<?xml version="1.0" encoding="UTF-8"?>\n'
          b'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
          b'  <url><loc>https://zhoubohan0.github.io/</loc></url>\n'
          b'  <url><loc>https://zhoubohan0.github.io/publications/</loc></url>\n'
          b'</urlset>\n')
    write('.nojekyll', b'')
    print(f'Public export ready: {destination}; default={default_version}; source={mode}')
    return destination


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('destination')
    parser.add_argument('--source', choices=('head', 'worktree'), default='head')
    parser.add_argument('--default-version', choices=('v1', 'v2'), default='v2')
    args = parser.parse_args()
    build(args.destination, args.source, args.default_version)
