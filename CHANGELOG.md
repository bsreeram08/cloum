# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.3.0] - 2025-04-01

### Added

- **`cloum ask [prompt]`** — AI-assisted natural language interface. Fast-path regex detects obvious intents (connect, add, remove) for instant execution without LLM latency. Falls back to MiniMax API for complex/unclear prompts.
- **`cloum config [--json]`** — Show full config including cloud sync settings (Gist ID, interval, last sync, token status).
- **`cloum sync [--enable|--push|--pull|--status]`** — Gist-backed config sync across machines.
  - `--enable` creates a new Gist and stores the Gist ID locally.
  - `--push` pushes local config to the Gist (cloud-wins merge strategy).
  - `--pull` pulls remote config from the Gist (merged by cluster name).
  - `--status` shows sync state without doing anything.
- **`cloum favorite <name>`** — Star/unstar a cluster. Starred clusters appear at the top of `cloum favorites` and the menu bar app with `⌘1`–`⌘9` shortcuts.
- **`cloum favorites`** — List all starred clusters.
- **`cloum helper [start|stop|status|shell]`** — Background daemon manager.
  - Runs as a detached Unix domain socket server at `~/.cloum/helper.sock`.
  - Exposes JSON-RPC 2.0 API with 8 methods: `list_clusters`, `get_cluster`, `toggle_favorite`, `check_auth`, `sync_status`, `sync_now`, `ping`, `daemon_status`.
  - `shell` mode provides an interactive JSON-RPC REPL for debugging.
- **`--json` flag on all commands** — Every command accepts `--json` / `-j` to return a `CloumResponse<T>` envelope: `{ok, data, error, meta}`.
- **Typed exit codes** — `2=usage error, 3=auth failure, 4=cloud/config error, 5=not found`.
- **`cloum-menu`** — macOS menu bar app (Swift/AppKit).
  - Menu bar icon: 🟢 connected, 🔴 error, 🔄 syncing, ⚪ disconnected.
  - ★ Favorites section with `⌘1`–`⌘9` shortcuts.
  - All Clusters submenu — click to connect instantly.
  - Cloud sync status + one-click Sync Now.
  - Auth status for GCP/AWS/Azure at a glance.
  - Background helper daemon controls (start/stop/restart).
  - Global hotkey `⌘⇧K` via Carbon `CGEvent` tap for quick-connect.
  - URL scheme `cloum://` for deep-linking from CLI.
- **GitHub Actions CI pipeline** — typecheck, lint, build matrix (4 platforms), smoke tests, security audit, no-TODO check, cloum-menu build.
- **GitHub Actions Release pipeline** — parallel matrix builds with SHA-256 checksums, OCI attestation placeholder, Homebrew sync placeholder, automated release notes.

### Changed

- **Build system**: `bun build --compile` produces native self-contained binaries. CI builds for darwin-arm64, darwin-x64, linux-x64, windows-x64.
- **Cloud sync defaults**: `cloud-wins` conflict strategy, `auto` sync interval (5 min).
- **Install script**: Supports `VERSION=v1.2.1 ./install.sh` for deterministic version pinning.

### Fixed

- `process.argv[0]` was `"helper"` in nested daemon invocation — fixed with `process.argv[1]` absolute path detection for background daemon spawn.
- `Bun.name` / `Bun.executable` are `undefined` in Bun's TypeScript types — replaced with `process.argv[1]` absolute path detection.

### Security

- Gist tokens never printed to stdout; displayed as `set (len: 40)` in `sync --status`.
- Audit CI job runs `bun audit --audit-level=high` on every PR.

## [1.2.1] - 2025-03-31

### Added

- Initial feature-complete release: `cloum add/remove/rename`, `cloum connect/use/list/describe`, `cloum discover`, `cloum registry`, `cloum clean`, `cloum ai`, `cloum update`, `cloum completion`, `cloum uninstall`.
- Multi-cloud support: GCP GKE, AWS EKS, Azure AKS.
- Interactive connect via `cloum connect` (no args).
- Config import/export via `cloum import`.
- AI setup guide via `cloum ai`.

## [1.1.0] - 2025-03-30

### Added

- Beta release with core cluster management.

## [1.0.0] - 2025-03-30

### Added

- Initial release — CLI skeleton.
