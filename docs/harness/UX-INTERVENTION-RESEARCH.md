# UX research: intervention during asynchronous agent work

Date: 2026-10-03. Research input for the existing Cuesheet one-flow terminal. Sources guide design hypotheses; they do not establish a universal best interface. Cuesheet product/design masters remain authoritative.

## Strongest findings

1. **A status update should support both noticing and resuming.** Iqbal and Horvitz’s 2007 two-week field study of desktop work describes preparation, diversion and resumption as distinct parts of interruption. Users often stabilize a task before switching, and task cues help them return. Moving to a detail view therefore needs a return path that preserves the prior reading point and work context. This was a desktop field study, not a study of agent control. [Iqbal & Horvitz, CHI 2007](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/11/CHI_2007_Iqbal_Horvitz-1.pdf)

2. **More live detail can reduce transparency in practice.** Springer and Whittaker’s two studies found that participants initially expected incremental feedback to mean better performance, then revised that judgment after using the system. Their qualitative analysis suggests detailed updates can distract and disrupt simple mental models; they propose progressive disclosure. This supports showing semantic progress and revealing details on demand, but does not prove that all streaming status is distracting or transfer directly to agent tasks. [Springer & Whittaker, 2018](https://arxiv.org/abs/1811.02164)

3. **Intervention should be timed to context and explain its effect.** Amershi et al. synthesized 150+ recommendations into 18 Human-AI Interaction guidelines and evaluated them with 49 practitioners across 20 AI products. Relevant guidance: time actions to context (G3), scope service when uncertain (G10), explain why (G11), and convey the consequences of user actions (G16). The authors present these as design guidance with tradeoffs, not a checklist. [Amershi et al., CHI 2019](https://doi.org/10.1145/3290605.3300233)

4. **Resumption cues help, but their benefit depends on task and interruption.** In a 2024 CHI computer task (N=83), a cue at the point to resume reduced lag after long interruptions but not short ones; in a second tangible task (N=38), cues helped after both. The authors discuss task difficulty and available spatial cues as possible explanations. For Cuesheet, test a compact “what changed / where to resume” cue rather than assuming it always helps. [Bahnsen et al., CHI 2024](https://doi.org/10.1145/3613904.3642666)

5. **Control should have a fallback and communicate consequences.** Google PAIR recommends giving people control based on their situation, including a manual way to complete work, and explaining the value and time-to-impact of feedback. The guidebook draws on Google studies whose details are partly proprietary, so this is useful first-party synthesis rather than independently inspectable experimental evidence. [Google PAIR, Feedback + Control](https://pair.withgoogle.com/guidebook-v2/chapter/feedback-controls/)

6. **Recovery boundaries matter as much as a rewind shortcut.** Anthropic’s 2025-09-29 Claude Code announcement describes checkpoints before agent edits and rewind by `Esc` twice or `/rewind`; it explicitly says checkpoints exclude user edits and shell commands and recommends version control. Cursor’s living Agent docs similarly describe local checkpoints and queued versus immediate steering. These are product descriptions, not comparative usability studies. Their concrete lesson is to state what a checkpoint covers and distinguish a queued message from a correction that steers ongoing work. [Anthropic checkpoints, 2025-09-29](https://www.anthropic.com/news/enabling-claude-code-to-work-more-autonomously) · [Cursor Agent overview](https://cursor.com/docs/agent/overview)

7. **Terminal focus can remain keyboard-first without making every row a stop.** Ink documents stable focus IDs and explicit focus movement; W3C focus-order guidance calls for a meaningful, operable order and cautions against needless focusable items. These are implementation guidance and a web accessibility standard, not TUI user research. Apply the principles: stable focus target, visible focus, composer retained as anchor, and predictable Escape return. [Ink focus management](https://github.com/vadimdemedes/ink#usefocusmanager) · [W3C WCAG 2.2 Focus Order](https://www.w3.org/WAI/WCAG22/Understanding/focus-order.html)

## Tensions and limits

- Incremental detail can distract, while a return cue can reduce resumption lag. A compact semantic delta with optional sourced detail is a synthesis to test, not a proven optimum.
- No cited work establishes the right notification cadence for terminal agents. Make an interruption actionable: ask for a decision or report a material change. Routine progress can remain quiet while user-initiated steering stays available.
- First-party products demonstrate patterns, not superiority. Cursor offers both queue-after-current-task and immediate steering; OpenCode v2 documents Enter as steering at a safe boundary and a separate shortcut for queueing (the live page currently says Ctrl+X then Enter; indexed snippets differed). Keeping these outcomes visibly distinct avoids the user thinking a correction has taken effect when it is waiting. [OpenCode v2 TUI](https://opencode.ai/v2/docs/cli/tui/)
- A status label or evidence marker must reflect observed state. Do not invent progress, certainty, helper relationships, or reversibility.

## Three prioritized changes for the current Cuesheet surface

1. **Make redirection legible and durable (P0).** Keep `›` available while work runs. On a correction, acknowledge receipt, identify affected work, and show the resulting state transition: continuing, checkpointing, waiting for a safe boundary, or blocked. If Cuesheet records an assistance request, project the actual request/status/worker relationship from durable events; show no helper relationship before one exists. Never present a queued prompt as already applied.

2. **Support “back to work” (P1).** After a user inspects context or leaves the terminal and returns, show only meaningful changes since their last view, the observed wait reason, and a useful resume point. Preserve the selected work item, draft, scroll position, and focus on closing the inspection. Test whether users can correctly state what changed and resume without rereading the full event stream.

3. **Keep review and recovery in the same flow (P1).** Offer a compact result/decision peek, with evidence status and next action; let a temporary detail view expose sources and full history. Distinguish proposal, command result, and independently verified outcome. Before a risky change, make the recovery boundary explicit, including what rewind does not cover. Keep keyboard traversal on actionable controls and preserve the composer as the anchor.

These recommendations align with Cuesheet’s persistent input, semantic work tree, temporary inspection, and shared sourced state. Existing `INTERACTIVE-WORK.md` already documents stable selection, draft/reading-position preservation, and inspectable agent results; implementation should build on that evidence and the open state in `state.json`, not duplicate those completed behaviors. This research does not authorize dashboard panels or make long-term product concepts immediate scope.

## Sources and dates

- Iqbal & Horvitz, “Disruption and Recovery of Computing Tasks: Field Study, Analysis, and Directions,” CHI 2007.
- Springer & Whittaker, “Progressive Disclosure: Designing for Effective Transparency,” 2018.
- Amershi et al., “Guidelines for Human-AI Interaction,” CHI 2019.
- Google PAIR Guidebook, Feedback + Control chapter; publication date not shown on chapter (accessed 2026-10-03).
- Bahnsen et al., “Augmented Reality Cues Facilitate Task Resumption After Interruptions,” CHI 2024.
- Anthropic, Claude Code checkpoint announcement, 2025-09-29; Cursor Agent docs are living docs (accessed 2026-10-03).
- Ink focus docs and W3C WCAG 2.2 Focus Order are living documentation (accessed 2026-10-03); OpenCode v2 TUI docs (accessed 2026-10-03).
