#!/usr/bin/env bash
set -euo pipefail

website_dir=${1:?Website checkout required}
cv_dir=${2:?CV checkout required}
cv_sha=$(git -C "$cv_dir" rev-parse HEAD)

for pdf in cv_en_latest.pdf cv_zh_latest.pdf; do
  git -C "$cv_dir" cat-file -e "$cv_sha:$pdf"
done

git -C "$website_dir" diff --quiet
git -C "$website_dir" diff --cached --quiet

for attempt in 1 2 3; do
  git -C "$website_dir" fetch --no-tags origin refs/heads/master
  # This is an isolated Actions checkout. On retries, discard only our rejected
  # pointer-update commit and start from the newest website commit.
  git -C "$website_dir" checkout -B cv-sync FETCH_HEAD
  cv_path=$(git -C "$website_dir" config -f .gitmodules --get submodule.cv.path)
  case "$cv_path" in
    cv|_common/cv) ;;
    *) printf 'Unsupported CV submodule path: %s\n' "$cv_path" >&2; exit 1 ;;
  esac
  test "$(git -C "$website_dir" config -f .gitmodules --get submodule.cv.url)" = 'git@github.com:zhoubohan0/CV-ZBH.git'
  read -r mode type old_sha path < <(git -C "$website_dir" ls-tree -r HEAD -- "$cv_path")
  test "$mode" = 160000
  test "$type" = commit
  test "$path" = "$cv_path"

  if [ "$old_sha" = "$cv_sha" ]; then
    printf 'Website already references the latest CV commit; no commit needed.\n'
    exit 0
  fi

  git -C "$website_dir" update-index --cacheinfo "160000,$cv_sha,$cv_path"
  test "$(git -C "$website_dir" diff --cached --name-only)" = "$cv_path"
  git -C "$website_dir" \
    -c user.name='github-actions[bot]' \
    -c user.email='41898282+github-actions[bot]@users.noreply.github.com' \
    commit -m 'chore(cv): update published CV PDFs'

  if git -C "$website_dir" push origin HEAD:refs/heads/master; then
    printf 'CV pointer updated; website publishing will start automatically.\n'
    exit 0
  fi
  printf 'Push failed (attempt %s/3); retrying from the latest website commit.\n' "$attempt" >&2
  sleep 2
done

printf 'Unable to update website after three attempts.\n' >&2
exit 1
