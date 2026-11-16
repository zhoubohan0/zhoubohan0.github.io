# Migration handoff

- Branch: codex/site-v2-common
- Baseline: db01cc090dba11b17caa73a63dc2dec43cefd1d2; clean website checkout.
- CV baseline: 22a92aaef3cf6db3f850087dac5d483ecff1d977.
- Independent CV checkout has an untracked README; leave it untouched.
- Plan confirmed in chat; implementation authorized until acceptance.
- Current milestone: baseline and CV synchronization.

- Milestone 1/2: captured 151 public files and 112 shared-material paths; all shared hashes match. CV path tests and safe-export tests pass (6 tests). v1 preview exported to /tmp/zhoubohan-v1-migration.
- A sync test initially modeled an uninitialized submodule incorrectly as a missing directory; trace showed the clean-tree guard failing. Fixed fixture to match a real checkout; no production guard weakened.
- CV compatibility change committed separately on codex/cv-path-aware-sync; website CV PDF pin remains unchanged. No pushes.

- Milestone 3: v2 retains 13 news / 19 papers / 19 full-page descriptions / the exact 8 selected IDs; active OpenReview and six existing contacts, five optional links only in HTML comments. Template fonts/icons are local shared resources, including a three-character Chinese font subset.
- Browser gate: 43 checks passed at 1440/1024/768/390 in both themes, with menu/filter/hash/description/no-JS and v1 navigation checks. Screenshots under notes/qa. v1 needed 45s maximum readiness wait because of unchanged external CDN resources; all content assertions retained.
- Stopped a slow, unnecessary Playwright package download; QA uses Node built-in WebSocket + Chrome CDP, with no browser-test package dependencies.
- Added exact SEO, paper-author-link and year-group preservation checks. Replaced CV patch-on-current-checkout tests with a fixed compatible-script snapshot so future CV updates cannot fail by reapplying the patch.
- Production HEAD build and final acceptance remain. No push/deployment has occurred.

- Final gate: production HEAD 85cf8e3 exported to /tmp/zhoubohan-production-85cf8e3 and passed static validation; fresh isolated browser context passed all 43 checks against that export. Six isolated Git/export unit tests pass. Rollback export with default v1 also passes validation.
- Final preview: http://127.0.0.1:59766/ (local server). Public output is 578,497,210 bytes including generated legacy aliases; source media remain single copies.
- Final release evidence is in notes/qa/results.json and public-export-sha256.json. No acceptance assertion was removed or weakened; only legacy network-readiness timeout increased after observing unchanged CDN latency.
- Website code is committed on codex/site-v2-common; CV patch is committed as 151bb7a on codex/cv-path-aware-sync in the independent CV checkout. Publish the latter first when deploying. No push/deployment performed. The independent untracked README remains untouched.
- All authorized local implementation and acceptance milestones are complete.
