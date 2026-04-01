# Cloum — Cloud Manager CLI

[![CI](https://github.com/bsreeram08/cloum/actions/workflows/ci.yml/badge.svg)](https://github.com/bsreeram08/cloum/actions/workflows/ci.yml)
[![Release](https://github.com/bsreeram08/cloum/actions/workflows/release.yml/badge.svg)](https://github.com/bsreeram08/cloum/actions/workflows/release.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Cloum** is a CLI for managing Kubernetes cluster connections across GCP, AWS,
and Azure — with cloud sync, a menu bar app, and global hotkeys for instant
connect.

## Features

- **Multi-cloud** — GKE, EKS, AKS with a single config file
- **Instant connect** — `cloum connect prod-gke` in one shot, no cloud console
- **AI fast-path** — `cloum ask "connect prod"` routes instantly via regex; complex
  prompts fall back to MiniMax API
- **Cloud sync** — Gist-backed config sync across all your machines (`cloum sync`)
- **Favorites** — star clusters with `cloum favorite <name>`, access via `⌘1`–`⌘9`
- **Menu bar app** — `cloum-menu` for macOS: status icon, favorites, one-click connect
- **Global hotkey** — `⌘⇧K` brings up quick-connect from anywhere
- **JSON output** — `--json` on every command for scripting
- **Background daemon** — `cloum-helper` Unix socket daemon for the menu bar app

## Installation

### Quick Install (any platform)

```bash
curl -sL https://raw.githubusercontent.com/bsreeram08/cloum/master/install.sh | bash
```

### From Binary

Download a release binary for your platform from
[github.com/bsreeram08/cloum/releases](https://github.com/bsreeram08/cloum/releases):

```bash
# macOS Apple Silicon
curl -L https://github.com/bsreeram08/cloum/releases/latest/download/cloum-darwin-arm64 \
  -o ~/local/bin/cloum && chmod +x ~/local/bin/cloum

# Linux x64
curl -L https://github.com/bsreeram08/cloum/releases/latest/download/cloum-linux-x64 \
  -o ~/local/bin/cloum && chmod +x ~/local/bin/cloum
```

### From Source

```bash
git clone https://github.com/bsreeram08/cloum.git
cd cloum
bun install
bun run src/index.ts --help
```

### Via Bun

```bash
bun install -g cloum
```

## Usage

```bash
cloum --version                         # Version + build info
cloum --help                            # Full help

# Connect
cloum list                              # List all clusters
cloum connect <name>                    # Fetch credentials + set kubectl context
cloum use <name>                         # Fast context switch (no cloud API call)
cloum describe <name>                   # Show cluster details

# Add / manage
cloum add gcp --name prod \
  --cluster-name my-cluster \
  --region us-central1 \
  --project my-project \
  --account user@example.com

cloum add aws --name staging \
  --cluster-name staging \
  --region us-east-1 \
  --profile myprofile

cloum add azure --name dev \
  --cluster-name dev \
  --region eastus \
  --resource-group dev-rg

cloum remove <name>                      # Remove a cluster
cloum rename <old> <new>                 # Rename a cluster

# Discover
cloum discover gcp --project my-project # List GKE clusters in a project
cloum discover aws --region us-east-1    # List EKS clusters in a region
cloum discover azure                    # List AKS clusters in subscription

# Auth & status
cloum status                             # Auth status for all providers
cloum registry gcp --region us-central1 # Docker login to GCR/ECR/ACR
cloum clean gcp                          # Revoke credentials + clear contexts

# Config & cloud sync
cloum config --json                     # Full config dump (JSON)
cloum sync --status                      # Show sync state
cloum sync --enable                      # Enable Gist sync (creates Gist)
cloum sync --push                        # Push config to Gist
cloum sync --pull                        # Pull config from Gist

# Favorites
cloum favorites                          # List starred clusters
cloum favorite <name>                    # Toggle star on/off

# Background daemon
cloum helper start                       # Start cloum-helper daemon
cloum helper status                      # Check if running
cloum helper stop                        # Stop daemon
cloum helper shell                       # Interactive JSON-RPC REPL

# AI assist
cloum ai                                 # Print AI setup prompt
cloum ask "connect prod cluster"        # Natural language — fast-path or LLM

# JSON output (scripting)
cloum list --json
cloum status --json
cloum config --json
cloum favorites --json
```

### Menu Bar App (macOS)

```bash
# Build
cd cloum-menu && swift build --configuration release
cp .build/release/cloum-menu /usr/local/bin/

# Run
open -a cloum-menu  # or just run cloum-menu
```

- 🟢 **Green** — connected
- 🔴 **Red** — auth error
- 🔄 **Spinning** — syncing
- ⚪ **White** — disconnected

### Global Hotkey

Press `⌘⇧K` from any app to bring up the cloum quick-connect palette.

## Configuration

Config file: `~/.config/cloum/clusters.json`

```json
{
  "clusters": [
    {
      "name": "prod-gke",
      "provider": "gcp",
      "region": "us-central1",
      "clusterName": "my-cluster",
      "project": "my-project",
      "account": "user@example.com"
    }
  ]
}
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `CLOUM_GIST_TOKEN` | GitHub personal access token for Gist sync |
| `CLOUM_CONFIG_PATH` | Override config file path |
| `CLOUM_MINIMAX_KEY` | MiniMax API key for `cloum ask` |

## Requirements

- [gcloud CLI](https://cloud.google.com/sdk/gcloud-cli) for GCP
- [AWS CLI v2](https://aws.amazon.com/cli/) for AWS
- [Azure CLI](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli) for Azure
- [kubectl](https://kubernetes.io/docs/tasks/tools/) for cluster connection
- [Bun](https://bun.sh) runtime (for source / `bun run`)
- For `cloum-menu`: macOS 14+ with Accessibility permission (for `⌘⇧K` global hotkey)

## AI Setup Guide

```bash
# Print the setup prompt (copy/paste into Claude)
cloum ai

# Open Claude with the prompt pre-filled
cloum ai --open

# Pipe to clipboard (macOS)
cloum ai | pbcopy
```

## Cloud Sync

Set up GitHub Gist sync to share your cluster config across machines:

```bash
export CLOUM_GIST_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
cloum sync --enable          # Creates Gist, stores ID locally
cloum sync --push            # Push current config to Gist
cloum sync --pull            # Pull from Gist (merges by cluster name)
```

On other machines, run `cloum sync --pull` to get the shared config.

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | General error |
| `2` | Usage error (invalid flags, missing args) |
| `3` | Authentication failure |
| `4` | Cloud API / config error |
| `5` | Cluster not found |

## License

MIT
