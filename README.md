# Bohan Zhou — academic homepage

The working source is split into `_common`, `v1`, and `v2`. The baseline for the preserved old website is `db01cc090dba11b17caa73a63dc2dec43cefd1d2`.

## Directories

- `_common/`: every original shared material, including unused images, video, presentations, QR codes, and alternate/source artwork. Original filenames and bytes are preserved.
- `_common/cv/`: private `CV-ZBH` Git submodule. It includes private source in the local checkout; only `cv_en_latest.pdf` and `cv_zh_latest.pdf` are exported.
- `v1/`: old pages, styles and scripts, with only the paths needed for relocation changed. Its navigation stays under `/v1/`.
- `v2/`: new academic profile based on [Qize Yu's profile design](https://skywalker-yqz.github.io/#about). Profile CSS is separated from small content-specific additions. No opening gallery or personal content from the template is included.
- `.github/migration/`: original content/inventory hashes, source provenance and the CV synchronization compatibility patch; never exported.
- `notes/`: implementation plan, handoff and acceptance evidence; never exported.

## Preview and verification

Python 3.9+ is sufficient for building and static tests; there are no Python package dependencies. Run from this repository root:

```sh
git submodule update --init --recursive
python3 -m unittest discover -s .github/tests -v
preview_dir=$(mktemp -d /tmp/zhoubohan-preview.XXXXXX)
python3 .github/scripts/build_site.py "$preview_dir" --source worktree --default-version v2
python3 .github/scripts/validate_site.py "$preview_dir"
python3 -m http.server 8000 --bind 127.0.0.1 --directory "$preview_dir"
```

Open `http://127.0.0.1:8000/`, `/publications/`, `/v1/`, or `/v2/`. Always serve the exported directory, not the source checkout. The output directory must be empty and outside this checkout.

`--source worktree` previews working files. CV PDFs are still read from the pinned commit, never dirty private files. `--source head` exports committed website blobs and is mandatory in production. `--default-version v1` previews a rollback while retaining both version directories.

Browser acceptance uses Node 22+ and an isolated Chrome debugging connection. For example, start a named `agent-browser` session, obtain `agent-browser get cdp-url`, then run:

```sh
node .github/scripts/browser_qa.mjs CDP_WEBSOCKET http://127.0.0.1:8000 /tmp/zhoubohan-browser-qa
```

The runner creates and disposes its own browser context. It checks 1440/1024/768/390 widths, both themes, mobile menus, filters, deep links, no-JavaScript readability and v1 navigation. The preserved v1 has external CDN dependencies and can take longer to initialize.

## Editing v2

- Edit the static pages under `v2/`; keep full research descriptions in `v2/publications/index.html`. The homepage intentionally uses compact publication cards.
- The content baseline is 13 visible news items, 19 papers, 19 full-page descriptions, 3 education entries, 5 internships and 8 honors. Two news records remain commented in v1 and are not reactivated in v2.
- `v2/data/site.json` controls the Selected IDs and URLs for existing social elements. Static links remain usable without JavaScript; when changing an active URL, update its HTML fallback as well.
- X, Instagram, Hugging Face, ModelScope and Douyin have complete **commented** HTML links in `v2/index.html`. To enable one, fill the HTML link URL and uncomment it; optionally set the same URL in `site.json` for centralized overrides. JavaScript never inserts these entries automatically. A configured URL without an uncommented HTML entry remains invisible.
- OpenReview, Zhihu, Xiaohongshu, email, WeChat, Google Scholar and GitHub are active.
- Add reusable media to `_common`; use root-relative `/_common/...` URLs. Keep full organization logos (`object-fit: contain`). Version-specific scripts/styles stay in their version directory.
- Changes to intended content require updating the explicit baseline/acceptance expectations together; do not weaken checks to conceal accidental content loss.

## Publication and compatibility

The Pages workflow checks out the exact CV gitlink, runs tests, builds from HEAD, validates the filtered output, then deploys that output. Root `/` and `/publications/` are copies of v2 HTML, without redirects. `/v2/` is a direct alias with canonical URLs pointing to the root site.

Old asset paths are generated from the migration inventory as compatibility files **only in the export**. Public CV URLs are both `/_common/cv/cv_*_latest.pdf` and `/cv/cv_*_latest.pdf`. The root source no longer has a `cv/` directory.

Before publishing this migration, land the CV-repository synchronization compatibility change first. See [.github/CV_PUBLISHING.md](.github/CV_PUBLISHING.md). No push or deployment is performed by the local build commands.

To roll back presentation, change the workflow's `--default-version` to `v1` and use the same option for validation. Shared assets and the CV submodule stay in `_common`; v2 remains available.
