# EV-SHARED-SCOPES — 2026-10-01

Base: e23225e. Production source includes activeContexts.forProject(scope.path).

- Full regression: `rtk node --test --test-skip-pattern='MB-01 a real run against the installed binary' --test-reporter=spec 'test/**/*.test.ts'`: 736 tests, 734 pass, 0 fail, 2 skipped; 33.1 s. Log /tmp/cuesheet-enterprise-shared-final.log.
- `rtk node --test test/shared-memory.test.ts test/typecheck-guard.test.ts`: 12 pass, no new TypeScript diagnostics. Global baseline diagnostics remain.
- A further binder integration test was added after the full workers loaded. `rtk node --test test/shared-memory.test.ts`: 9 pass, 0 fail; 1.74 s. Log /tmp/cuesheet-shared-extra.log. Its initial fixture used an absolute registry path; the documented relative path contract was corrected in the fixture, with no production change.
- `rtk git diff --check`: PASS.

The concurrency case launches two distinct Node processes, gates both at the same base revision and proves one append/one conflict with no overwrite. Durable reread proves the recorded source and sequence. Exact extraction retry does not append. Corrupt data remains unchanged. Missing explicitly mounted organization data errors rather than inventing empty context. Reads of absent project data do not create a directory.

Producer integration rejects an external update during inference and a remaining effect after model publication; the next frame contains the updated source. A real asynchronous acceptance subprocess can return VERIFIED while context changes, but produces no goal-closing evidence. Binding another project reads that project's memory and excludes launch-project memory. Frame compaction retains retrieval metadata and does not mutate the source.

Review: one shared authoritative journal per scope; no copy in session authority, no company write through model tool, fixed roots only, bounded journal and sources, per-base conditional append, old effect may complete but later stale effects refused. No src/core modification. Solo adversarial review; no independent agent claimed.

AC-E01.1 and AC-E01.2 are verified for the defined local/filesystem scope. E01.3 network/auth/offline and E01.4 editable team workflows remain unimplemented. No superiority, live-model quality or multi-machine guarantee follows from these tests.
