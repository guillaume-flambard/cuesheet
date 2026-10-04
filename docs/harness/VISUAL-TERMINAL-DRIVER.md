# Visual terminal driver

Owner request: independently use and visually inspect Cuesheet without asking the owner to perform basic testing.

VD01: launch the installed real executable in a PTY; accept JSON keyboard/resize/snapshot actions. Acceptance: commands and Unicode draft work, resize preserves draft, real provider request reaches a visible result.
VD02: interpret ANSI with xterm headless, preserving cell colors, styles, cursor positioning and erasure; export cell JSON, raw transcript and PNG for direct image inspection. Acceptance: actual menu and small draft captures visually inspected. Rasterization is a Menlo approximation, not a native Ghostty screenshot; emoji fallback is not yet implemented.
VD03: reusable local CLI only; no browser shell, native app control or external network listener. Isolated test sessions, no user terminal settings changed. Dependencies live in a report tool directory, not product dependencies.

System: JSON stdin -> node-pty installed Cuesheet -> xterm headless -> cell snapshot -> Pillow PNG -> view_image. Data: own test journal and screenshots only. Local shell lifecycle closes child on EOF/quit. Keyboard actions serialized; stream writes awaited before captures. Auth, deployment, migrations N/A; provider runtime existing. Security: arbitrary keyboard input has the same authority as the authorized shell; no public endpoint. Performance: snapshots on request; no idle image loop. Screen font/theme and emoji rendering differ from native host, so native acceptance remains separate.

Graph: VD-DISCOVER DONE (PTY and raster tools inspected); VD-DRIVER DONE; VD-VERIFY DONE; VD-NATIVE TODO (native rendering remains inaccessible, not part of driver completion).

Use: CUESHEET_VISUAL_TOOLS=/Users/memo/projects/_reports/cuesheet-visual-driver-2026-10-03 rtk proxy node scripts/ui/visual-driver.cjs
JSON examples, each on its own line: {"send":"/commands"}, {"send":"\\r","snapshot":"commands"}, {"resize":[80,24],"snapshot":"small"}, {"quit":true}.

Evidence: reusable repository driver launched real installed Cuesheet, `/help` rendered and child exited cleanly. Interactive run exercised `/commands`, filtering `motion`, Escape, Unicode draft, 120x30 -> 80x24 resize, and an actual request to default opencode-go/deepseek-v4.1-flash through final answer. Menu and draft/answer PNGs inspected with view_image. Outputs: `/Users/memo/projects/_reports/cuesheet-visual-driver-2026-10-03/` (commands.png, search.png, small-draft.png, working.png, answer-final.png, reusable-help.png; matching raw/cell JSON and isolated journals). No native terminal GUI controlled and no settings changed. Diff whitespace validation passes. Product onboarding defect observed: answer describes internal primitives and installation/test machinery rather than clear daily use; retained as open follow-up, not concealed as acceptance.
Driver slice status: READY_FOR_MANUAL_ACCEPTANCE. Overall product remains IMPLEMENTING. Native host font/emoji rendering acceptance pending; this driver enables autonomous pixel inspection of real terminal output, not exact native GUI capture.
