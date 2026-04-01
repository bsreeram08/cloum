# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.3.0] - 2026-04-01

### Added
- **macOS Menu Bar app** (`cloum tray`) — a native macOS status-bar companion
  - Cloud icon (☁️ / ⎈) in the notification bar; uses SF Symbols on macOS 11+
  - Shows current kubectl context at a glance
  - ⭐ Favourites section with keyboard shortcuts `1`–`9`
  - All clusters grouped by provider (GCP / AWS / Azure)
  - One-click connect — launches `cloum connect <name>` in Terminal or iTerm2
  - Auto-refreshes when `~/.config/cloum/clusters.json` changes (FSEvent watcher)
  - Installs as a LaunchAgent so it starts automatically at login
  - Subcommands: `install` | `start` | `stop` | `status` | `uninstall`
- **Favourites** (`cloum favorite`) — mark clusters for instant access
  - `cloum favorite add <name>` — mark a cluster as a favourite
  - `cloum favorite remove <name>` — remove from favourites
  - `cloum favorite list` — list all favourites with their quick-connect index
- **Quick-connect** (`cloum quick <N>`) — connect to favourite #N instantly
  - Shorthand: `cloum 1`, `cloum 2`, `cloum 3` (numeric commands)
  - Supports `--namespace <ns>` to set the kubectl namespace after connecting
- `favorite?: boolean` field added to all cluster config types

## [1.0.0] - YYYY-MM-DD

### Added
- Initial release
- Multi-cloud support for GCP, AWS, and Azure Kubernetes clusters
- Cluster connection management
- Authentication status checking
- Container registry login support
- AI-assisted setup guide
