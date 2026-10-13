# Cuesheet — usability relay

## Goal
Launch `cuesheet`, select an actually configured model, submit a natural request, and receive the motor's response in a polished, responsive French terminal.

## Single task in this relay — P0-MODEL-PRIORITY
OpenCode v2 shows catalog models from providers without configured credentials. Prioritize models backed by a locally declared account **without claiming auth success** or spending credits. Preserve the manual entry and provider switch.

## Remaining separate slices
- P0-LIVE: real first-turn inference with user-authorized provider usage.
- P0-RESIZE: live PTY resizing across 40×14, 80×24 and 120×40.
- P0-VISUAL: coherent French labels and restrained human-first typography, including terminal screenshots.
- P0-INSTALL: reliable clean runtime upgrades and visible build revision.

## Acceptance for this slice
- Reads OpenCode auth metadata in a safe and bounded subprocess.
- Marks only explicit provider matches and never exposes credentials.
- Unmatched models remain searchable, not silently hidden.
- No account is described as verified until a real inference succeeds.
- Tests and TypeScript succeed.
