# cloum-menu

macOS menu bar app for **cloum** — instant cluster connect, favorites,
cloud sync status, and background daemon management.

## Features

- **Menu bar icon** — color-coded status (🟢 connected, 🔴 error, 🔄 syncing, ⚪ disconnected)
- **★ Favorites** — clusters starred with `cloum favorite <name>` appear at the top with `⌘1`–`⌘9` shortcuts
- **All Clusters** — submenu of every configured cluster, click to connect instantly
- **Cloud Sync** — shows Gist sync status, one-click `Sync Now`
- **Auth status** — GCP/AWS/Azure authentication at a glance
- **Background helper** — start/stop/restart `cloum-helper` daemon
- **Discover** — opens `cloum://discover` URL scheme

## Installation

```bash
# Build
cd cloum-menu
swift build --configuration release

# Install
cp .build/release/cloum-menu /usr/local/bin/

# Launch at login (optional)
open -a cloum-menu
```

## Menu Shortcuts

| Shortcut | Action |
|----------|--------|
| `⌘1`–`⌘9` | Connect to favorite cluster #N |
| `⌘D` | Discover new cluster |
| `⌘S` | Sync now |
| `⌘Q` | Quit |

## Architecture

- **Swift 5.9 / AppKit** — pure AppKit, no SwiftUI dependency
- **NSStatusItem** — menu bar icon, built from emoji characters
- **Unix socket** — calls `cloum-helper` daemon via `~/.cloum/helper.sock`
- **Bundle identifier**: `com.cloum.menu`
- **URL scheme**: `cloum://` for deep-linking from CLI

## Building

Requires Xcode 15+ or Swift 5.9+ toolchain:

```bash
swift build --configuration release
```

Binary: `.build/release/cloum-menu`
