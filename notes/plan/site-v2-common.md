# Shared assets and academic homepage migration

## Outcome
Preserve db01cc090dba11b17caa73a63dc2dec43cefd1d2 as v1, share all existing media and the private CV submodule under _common, and serve a content-preserving v2 at the website root.

## Constraints
- Preserve all media, including unused alternatives, with identical bytes.
- Keep v1 text, visibility and behavior; change only paths required for relocation.
- v2 uses Qize Yu's academic profile visual design, without its opening or photography pages.
- 13 visible news, 19 publications, 19 publication-page descriptions; 8 selected papers: roboaware, fetch, groundingpi, bidexhd, megohand, nolo, cradle, stg.
- Show the supplied OpenReview, Zhihu and Xiaohongshu links plus existing contact links. X, Instagram, Hugging Face, ModelScope and Douyin exist only as commented HTML templates.
- Public CV export includes exactly the two latest PDFs, read from the pinned submodule commit. Never export private source or Git metadata.
- No production deployment or push in this local delivery. Preserve unrelated CV README.

## Milestones and gates
1. Capture content/assets baseline and adapt CV synchronization. Gate: exact baseline counts and sync tests with both paths.
2. Relocate shared assets and v1, implement safe build. Gate: all original media hashes, v1 content comparison, legacy URL and CV export checks.
3. Build v2 with template styles and existing content. Gate: content and link parity, selected filtering and valid shared resources.
4. Browser QA and release preparation. Gate: 1440/1024/768/390 widths, both themes, keyboard/menu/news/filter behavior, no-JS content, visual screenshots, production build from HEAD.

## Acceptance commands
python3 -m unittest discover -s .github/tests -v
python3 .github/scripts/build_site.py OUTPUT --source worktree --default-version v2
python3 .github/scripts/validate_site.py OUTPUT
python3 .github/scripts/build_site.py FRESH_OUTPUT --source head --default-version v2
Browser QA runs against an exported directory served on 127.0.0.1, never the source checkout.

## Stop conditions
Stop only on complete acceptance, a real external blocker without a local workaround, or a user-requested stop. No artificial time/token budget.
