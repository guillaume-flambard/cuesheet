# Type checking

Production and terminal TypeScript checks pass with zero diagnostics as of 2026-10-03.
The shipped build stops on a compiler failure. `test/typecheck-guard.test.ts`
runs both configurations and requires successful exit codes.

Strict checking, unchecked-index checking and erasable syntax remain enabled.
The daily-use implementation corrected adapter return shapes, checked optional
CLI values and narrowed values already protected by runtime guards. In chat,
the skills registry now receives capabilities rather than the listing envelope.

Evidence: `bash scripts/build.sh`, both `tsc --noEmit` configurations and the
targeted store, memory, affordance, chat and terminal surface checks pass.
See `docs/harness/DAILY-USE.md` for the remaining product acceptance work.
