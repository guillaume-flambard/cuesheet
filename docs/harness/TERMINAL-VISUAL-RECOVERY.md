# Terminal visual recovery

Owner rejection: current interface unusable visually, 2026-10-03. Canonical source: MASTER-DESIGN-DIRECTION.source.txt; this revision does not claim recovered original images.

Intent: a calm, readable terminal with one continuous work surface, usable input during execution, restrained semantic colors and temporary menus. Completion: startup, conversation, real busy/blocked state and model/menu overlays remain legible across 80x24, 120x30, 160x50, 240x70, with keyboard behavior and draft preservation unchanged; exported actual Ink render and installed PTY interaction checked before manual aesthetic acceptance.

System: installed shim -> surface-cli -> bundled terminal main -> App/store -> Header, WorkContext, Timeline, Activity, Composer, StatusBar; temporary Models/Palette overlays; durable entries retain identity, source text and certainty. No persistence/schema/permission/model execution changes.

Requirements / acceptance:
VR01: consistent gutters, readable maximum text width, quiet identity and actual model. All sizes keep input and content inside terminal; no project/session chrome.
VR02: readable answers with bold, headings, lists and fenced code; original entry text/IDs untouched. Raw source accessible via log; unclosed fences handled. No HTML execution or inferred proof.
VR03: one keyboard hint line, activity only while busy, focused cursor only in active composer; overlays keep draft. Open/close model/menu, type correction while busy, history/paste/Unicode work.
VR04: compact truthful direction/work graph; no duplicate full user request on settled simple answers. Preserve blocked/failed/unknown distinctions and relevant Human Delta.
VR05: model and command menus use same semantic tokens, selection clear, footer visible at short heights. Preserve existing selection/apply/save/check authority.

Finite graph: VR-DISCOVER DONE (read canonical docs/components); VR-LAYOUT P0 IN_PROGRESS (VR01/03); VR-CONTENT P1 TODO (VR02/04, depends layout); VR-MENUS P1 TODO (VR05); VR-VERIFY P1 TODO (all, depends implementation); VR-ACCEPT P1 TODO (manual appearance).

Verification: capture actual Ink App frames before/after as ANSI and PNG (exported render, not native screenshot), required size matrix; existing PTY render proof; targeted history/model/draft/exactly-once tests; installed PTY startup/menu/model after build. Native app visual access previously denied; do not circumvent it.

Risks: viewport clipping or scrolling regression (high, check matrix and wrapped history); hidden user-required error/proof (high, retain entries/certainty and test failure frame); export font/background differs from user's terminal (medium, declare manual acceptance); long typed text (medium, retain cursor and edit behavior).

Coverage: core behavior, keyboard UX/loading/empty/error/cancel/restart/backward compatibility/accessibility/performance/privacy/build/package/documentation applicable via unchanged store/runtime and presentation checks. Auth/network/API/migrations/new persistence/new concurrency/deploy N/A: presentation only. Rollback: reviewable unstaged changes, preserve existing dirty work. Global project remains IMPLEMENTING.


Discovered required defect VR-MODEL-VIEW P1: installed real catalog showed 510 models with the current selected model one row outside the viewport; list start used one more row than actually rendered after the search field. Correct start to use displayed item capacity. Verify selected deepseek-v4.1-flash visible after Enter into catalog.

Layout revision: attach the work tree after the latest human entry, without printing its original request a second time. Event identities and original content remain untouched; no text-based deduplication.


Evidence, 2026-10-03: 20 exported actual Ink frames for idle/work/answer/blocked/menu at all four required sizes passed bounds/input/meaning checks (`frame-validation.json`). Answers visibly render Markdown headings/emphasis/lists/code; source text remains unchanged in store. Final PTY fixture matrix passed at 80x24,120x30,160x50,240x70. Actual installed default-model terminal opened, inspected real model catalog, preserved draft across model/menu overlays and resize, then exited (`installed-screens.json`). Current model catalog offscreen regression test passed. Targeted UI behavior 42 passed initially; after inline work-tree change history/identity 20 passed; final model UI 4 passed plus specific viewport regression 1 passed. Build passed (25 existing errors emitted as before). Terminal tsc still fails on three existing upstream type errors (shell.ts/defaultCwd, memory.ts/optional fields, store.ts/spread), no terminal component error. No strict typecheck success claimed.

Incidental verification side effect: pnpm typecheck wrapper performed install and changed lock/workspace metadata. Restored both exactly from the preserved pre-command sixth-run workspace; copies of incidental metadata retained in report. No unrelated dependency policy edits kept.

Visual review: exported idle, answer, work and blocked PNGs inspected; idle is intentionally sparse, work follows human request once, errors and Human Delta remain distinct. Actual installed idle PNG shows configured DeepSeek Flash. Images are exports of actual Ink output using Menlo and a specified dark background, not screenshots of the user's native terminal. Native visual app access was previously denied and not bypassed. Full project remains IMPLEMENTING, visual work VERIFYING pending upstream static checks and owner experiential acceptance. Relauch cuesheet; inspect a reply, Ctrl+P models and a correction while busy. No commit/staging/reset/push.
