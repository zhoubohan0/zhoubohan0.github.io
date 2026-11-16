# CV publishing

`_common/cv/` is the private submodule named `cv`. Its URL remains `git@github.com:zhoubohan0/CV-ZBH.git`. The separate `简历/cuhk` authoring checkout is unchanged.

The public export contains exactly `cv_en_latest.pdf` and `cv_zh_latest.pdf` at both `/_common/cv/` and the compatibility `/cv/` path. Generic shared-material export skips the complete private submodule. Only the two allowlisted PDF blobs are read from the recorded gitlink; TeX files, older PDFs, hidden files and Git metadata are never copied.

## Migration order

1. Publish the path-aware `CV-ZBH` synchronization change before publishing the website migration. The prepared private-repository commit is `151bb7a` on `codex/cv-path-aware-sync`.
2. That script obtains `submodule.cv.path` from the website's current `.gitmodules`, accepts `cv` and `_common/cv`, and updates only that gitlink. The isolated local-remote tests cover both layouts and no-op synchronization.
3. Publish the website branch with `_common/cv` and the adjusted checkout/export paths. The initial PDF pin remains `22a92aaef3cf6db3f850087dac5d483ecff1d977`; its PDF bytes are unchanged.
4. Later PDF commits on CV-ZBH/master trigger the existing Sync published CV workflow, which updates the website gitlink and triggers Pages. A code-only sync-script commit does not itself trigger the PDF path filter.

The compatibility patch is `.github/migration/cv-sync.patch` (apply with `git apply --unidiff-zero` in the CV repository when needed). `.github/migration/cv-sync-compat.sh` records the tested resulting script; tests use this fixed release snapshot so future PDF-only gitlink updates do not attempt to reapply an already-applied patch.

## Website build

The workflow reads the exact gitlink at `_common/cv`, checks out the private repository there using `CV_SUBMODULE_DEPLOY_KEY`, then calls the public exporter. Never upload the source checkout as a Pages artifact.

After receiving the migration:

```sh
git submodule sync --recursive
git submodule update --init --recursive
```

Editing and compiling remains in the original `简历/cuhk` checkout. Commit the intended PDF updates there through the existing workflow; no local authoring directory is moved.
