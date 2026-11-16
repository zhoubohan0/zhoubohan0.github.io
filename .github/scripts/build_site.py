"""Export the committed website and exactly two PDFs from the private CV repo."""

import hashlib
from pathlib import Path, PurePosixPath
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[2]
PDF_NAMES = ("cv_en_latest.pdf", "cv_zh_latest.pdf")


def git(repo, *args):
    return subprocess.check_output(["git", "-C", str(repo), *args])


def build(destination):
    destination = Path(destination).resolve()
    if destination == ROOT or ROOT in destination.parents:
        raise RuntimeError("The public export must be outside the checkout")
    if destination.exists() and any(destination.iterdir()):
        raise RuntimeError("The public export directory must be empty")

    entry = git(ROOT, "ls-tree", "HEAD", "--", "cv").decode().strip()
    metadata, path = entry.split("\t", 1)
    mode, kind, cv_sha = metadata.split()
    if (mode, kind, path) != ("160000", "commit", "cv"):
        raise RuntimeError("cv must be a Git submodule")
    if git(ROOT / "cv", "rev-parse", "HEAD").decode().strip() != cv_sha:
        raise RuntimeError("CV checkout does not match the website's pinned commit")

    # Read blobs from Git, never from uncommitted or ignored working-tree files.
    destination.mkdir(parents=True, exist_ok=True)
    entries = git(ROOT, "ls-tree", "-rz", "HEAD").split(b"\0")
    for entry in filter(None, entries):
        metadata, raw_path = entry.split(b"\t", 1)
        mode, kind, oid = metadata.decode().split()
        path = PurePosixPath(raw_path.decode())
        if path.is_absolute() or ".." in path.parts:
            raise RuntimeError("Unsafe repository path")
        if path.parts[0] == "cv":
            continue
        if any(part.startswith(".") for part in path.parts):
            continue
        if path.name in {"README.md", "AGENTS.md"}:
            continue
        if kind != "blob" or mode not in {"100644", "100755"}:
            raise RuntimeError(f"Unsupported public file type: {path}")
        target = destination / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(git(ROOT, "cat-file", "blob", oid))

    cv_dir = destination / "cv"
    cv_dir.mkdir()
    for name in PDF_NAMES:
        data = git(ROOT / "cv", "show", f"{cv_sha}:{name}")
        if not data.startswith(b"%PDF-"):
            raise RuntimeError(f"Invalid PDF: {name}")
        (cv_dir / name).write_bytes(data)
        print(f"{name}: sha256={hashlib.sha256(data).hexdigest()}")

    if not (destination / "index.html").is_file():
        raise RuntimeError("Website index.html is missing")
    if sorted(p.name for p in cv_dir.iterdir()) != sorted(PDF_NAMES):
        raise RuntimeError("Unexpected private files in public CV directory")
    (destination / ".nojekyll").touch()
    print("Public export ready; CV sources and Git metadata are excluded.")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: build_site.py OUTPUT_DIRECTORY")
    build(sys.argv[1])
