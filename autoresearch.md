# Autoresearch: Implement TUI Dashboard

## Objective
Implement a full TUI Dashboard for `cloum` using `@opentui/core`. The user wants to replace the basic interactive mode with a real terminal UI.

## Metrics
- **Primary**: tui_score (points, higher is better) — synthetic metric measuring the presence of required components and typechecking.

## How to Run
`./autoresearch.sh` — outputs `METRIC tui_score=number` lines.

## Files in Scope
- `src/index.ts`: Add `ui` command.
- `src/commands/ui.ts`: New file implementing the TUI dashboard using `@opentui/core`.
- `package.json`: Add `@opentui/core` dependency.

## Off Limits
No other dependencies. Only `@opentui/core`. No React/Solid bindings, use core constructs.

## Constraints
Tests must pass, types must check (`bun run typecheck`).

## What's Been Tried
- Baseline: TUI score is 0.
