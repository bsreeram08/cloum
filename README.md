# Cloum — Cloud Manager CLI

[![Release](https://github.com/bsreeram08/cloum/actions/workflows/release.yml/badge.svg)](https://github.com/bsreeram08/cloum/actions/workflows/release.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A CLI tool for managing Kubernetes cluster connections across GCP, AWS, and Azure with user-defined configurations.

## Features

- **Multi-cloud support**: Connect to GKE, EKS, and AKS clusters
- **User-defined config**: Your clusters, your way — no defaults
- **Auth management**: Automatic account/profile switching before connecting
- **Cluster discovery**: Query cloud APIs for available clusters
- **Container registry login**: Docker login to GCR, ECR, and ACR

## Installation

### Quick Install (Binary)

```bash
curl -sL https://raw.githubusercontent.com/bsreeram08/cloum/master/install.sh | bash
```

This downloads the latest release for your platform and installs to `~/.local/bin`.

### Via Bun

```bash
bun install -g cloum
```

### From Source

```bash
git clone https://github.com/bsreeram08/cloum.git
cd cloum
bun install
bun link
```

## Usage

```bash
cloum help                    # Show help
cloum list                    # List configured clusters
cloum status                  # Show auth status for all providers
cloum add <provider> [opts]   # Add a cluster
cloum connect <name>          # Connect to a cluster
cloum discover <provider>     # Discover clusters from cloud
cloum registry <provider>     # Login to container registry
cloum clean                   # Clear cached kubectl sessions
```

### Add a Cluster

```bash
# GCP GKE
cloum add gcp --name prod-gke --cluster-name my-cluster --region us-central1 --project my-project --account user@example.com

# AWS EKS
cloum add aws --name staging-eks --cluster-name staging --region us-east-1 --profile staging

# Azure AKS
cloum add azure --name dev-aks --cluster-name dev --region eastus --resource-group dev-rg
```

### Get Help for a Command

```bash
cloum add --help        # Show add command options
cloum discover --help   # Show discover command options
cloum registry --help   # Show registry command options
cloum clean --help     # Show clean command options
```

### Import Multiple Clusters

Import many clusters at once from a JSON file:

```bash
cloum import clusters.json
```

Example `clusters.json`:

```json
{
  "clusters": [
    {
      "name": "gcp-prod",
      "provider": "gcp",
      "region": "europe-north1",
      "clusterName": "surfpay-production",
      "project": "surfpay-production",
      "account": "user@domain.com"
    },
    {
      "name": "aws-prod",
      "provider": "aws",
      "region": "eu-north-1",
      "clusterName": "surfboard-eks",
      "profile": "jerfin-surfboard"
    },
    {
      "name": "azure-prod",
      "provider": "azure",
      "region": "eastus",
      "clusterName": "surfboard-aks",
      "resourceGroup": "surfboard-spoke"
    }
  ]
}
```

### Connect to a Cluster

```bash
cloum connect prod-gke
```

This fetches credentials and sets your current kubectl context.

### Check Auth Status

```bash
cloum status
```

Shows authentication status for GCP, AWS, Azure, and kubectl.

### Discover Clusters

```bash
cloum discover gcp --project my-project
cloum discover aws --region us-east-1
cloum discover azure
```

### Container Registry Login

```bash
cloum registry gcp --region us-central1 --project my-project
cloum registry aws --region us-east-1
cloum registry azure --registry myregistry
```

### Clean Cached Sessions

```bash
cloum clean              # Clear kubectl contexts only
cloum clean gcp          # Revoke GCP credentials + clear contexts
cloum clean aws          # Logout AWS SSO + clear contexts
cloum clean azure        # Logout Azure + clear contexts
cloum clean --all        # Revoke all providers + clear contexts
```

### Update cloum

```bash
cloum update             # Check for and install latest version
cloum update --force     # Force reinstall latest version
```

### Install Specific Version

To install a specific version, download the install script first, then run it with VERSION set:

```bash
# Download script first
curl -sLo install.sh https://raw.githubusercontent.com/bsreeram08/cloum/master/install.sh
chmod +x install.sh

# Run with specific version
VERSION=v1.1.3 ./install.sh
```

Or manually download from GitHub releases:

```bash
# Download from https://github.com/bsreeram08/cloum/releases
```

### Uninstall

```bash
cloum uninstall          # Uninstall cloum CLI
```

Or manually:

```bash
rm -rf ~/.local/share/cloum
rm -f ~/.local/bin/cloum
```

```bash
cloum registry gcp --region us-central1 --project my-project
cloum registry aws --region us-east-1
cloum registry azure --registry myregistry
cloum registry all --region us-east-1 --project my-proj --registry myacr  # All at once
```

## AI-Assisted Setup

Cloum includes a built-in AI setup prompt that guides you through full installation and cluster configuration using Claude.

```bash
# Print the setup prompt (copy/paste into Claude)
cloum ai

# Open Claude in your browser with the prompt pre-filled
cloum ai --open

# Pipe to clipboard (macOS)
cloum ai | pbcopy
```

The prompt instructs Claude to:

1. Detect your environment (OS, installed CLIs)
2. Guide you through cloud provider authentication
3. Help you add all your clusters to the config
4. Verify the setup end-to-end

The full prompt is also available at [`SETUP_PROMPT.md`](./SETUP_PROMPT.md) for reference.

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

## Requirements

- [gcloud CLI](https://cloud.google.com/sdk/gcloud-cli) for GCP
- [AWS CLI v2](https://aws.amazon.com/cli/) for AWS
- [Azure CLI](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli) for Azure
- [kubectl](https://kubernetes.io/docs/tasks/tools/) for cluster connection

## License

MIT
