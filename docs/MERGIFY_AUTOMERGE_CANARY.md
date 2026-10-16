# Cuesheet — Mergify automatic landing canary

This documentation-only change verifies the Cuesheet low-risk merge lane following the
controlled cutover from the former GitHub auto-merge workflow to Mergify.

- Memo Bridge creates and pushes the agent branch with an isolated issue claim.
- GitHub Actions runs the `Core and integration tests` job.
- Mergify admits and squash-merges the PR automatically after that check succeeds.
- No reviewer, manual approval label or direct merge command is used on this canary.
- The old auto-merge workflow stays disabled, and draft PR #57 stays untouched.

Issue: memolabs-dev/cuesheet#75
Date: 2026-10-16
