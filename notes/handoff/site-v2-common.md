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
