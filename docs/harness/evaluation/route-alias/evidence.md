# EV-ROUTE-ALIAS — 2026-10-01

Base code 8adcb0e plus this bounded patch. H09.3d/e, REQ-H09.3/H09.5; parent acceptance remains pending.

Before: actual Docker fixture exposed and modified its own protected file through a root alias (alias-before.log); socket-appearance regression failed before route refresh (route-before.log). No user data.

After: 50 targeted tests PASS (targeted.log), actual Docker/runtime/resource receipts, alias masking, unavailable enterprise route and owner configuration snapshot. Full regression 796 tests,794 pass,0 fail,2 explicit skips (full.log). Build PASS (build.log);32 inherited TypeScript diagnostics remain; differential guard and git diff --check PASS.

Solo adversarial review: canonical roots and protected parents converge before masking; final protected symlinks within mounted scope refused; readonly masks contain empty data. Owner settings frozen, socket availability refreshed at starts/resumes, active executor has no daemon-failure fallback. Resource ledger validated at runner construction. Fixtures restore environment/stat mocks and remove only owned files.

Limits: no independent-agent review or global closure. R06 confinement/host races and nested protected-path ancestor behavior need broader verification. Enterprise network auth/sync, complete provider matrix and comparative benchmarks remain open. No push/deployment or live-model quality claim.
