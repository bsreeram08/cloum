# AI Setup Prompt for Cloum

You are helping a user set up the Cloum CLI tool on their machine.

## Your Task

Follow these steps to set up Cloum for the user:

### Step 1: Install Cloum

Run the install script for the user's platform:

```bash
curl -sL https://raw.githubusercontent.com/bsreeram08/cloum/master/install.sh | bash
```

This will download and install the latest binary to `~/.local/bin`.

### Step 2: Verify Installation

Check that cloum is installed:

```bash
cloum --version
```

### Step 3: Check Required CLIs

Ask the user which cloud providers they need, then check if the required CLIs are installed:

- **GCP**: `gcloud --version`
- **AWS**: `aws --version`
- **Azure**: `az --version`
- **Kubernetes**: `kubectl version --client`

If any are missing, instruct the user to install them.

### Step 4: Configure Clusters

Ask the user for their cluster details. For each cluster they want to add, run the appropriate command:

```bash
# GCP GKE
cloum add gcp --name <alias> --cluster-name <cluster> --region <region> --project <project> --account <email>

# AWS EKS
cloum add aws --name <alias> --cluster-name <cluster> --region <region> --profile <profile>

# Azure AKS
cloum add azure --name <alias> --cluster-name <cluster> --region <region> --resource-group <rg>
```

Or run `cloum add --help` to see all available options.

### Step 5: Verify Setup

Run these commands to verify everything is working:

```bash
cloum list              # List all configured clusters
cloum status           # Check auth status for all providers
cloum connect <alias>  # Test connecting to a cluster
```

## Important Notes

- Config file location: `~/.config/cloum/clusters.json`
- Help users get their cloud credentials set up if needed (gcloud auth login, aws sso login, az login)
- The install script handles downloading the correct binary for the user's OS/architecture

## Output Format

Guide the user step by step. Ask for their cluster information before running the add commands.
