import { join } from "path";
import { homedir } from "os";
import { runCommandSilent } from "../utils/shell.ts";

const SETUP_PROMPT = `You are helping a user set up the Cloum CLI tool on their machine.

## About Cloum

Cloum (Cloud Manager) is a CLI tool for managing Kubernetes cluster connections across GCP, AWS,
and Azure. It reads cluster definitions from ~/.config/cloum/clusters.json and handles
authentication/connection to GKE, EKS, and AKS clusters.

## Your Task

Work through these steps in order, asking the user for input where needed:

### Step 1 — Detect environment

Run these checks and report what is/isn't installed:
- \`cloum --version 2>/dev/null || echo missing\`
- \`gcloud --version 2>/dev/null | head -1 || echo missing\`
- \`aws --version 2>/dev/null || echo missing\`
- \`az --version 2>/dev/null | head -1 || echo missing\`
- \`kubectl version --client --short 2>/dev/null || echo missing\`

### Step 2 — Install missing CLIs

For any missing CLI, provide the install command for the user's OS:

**gcloud**: https://cloud.google.com/sdk/docs/install
**aws**: \`pip install awscli\` or https://aws.amazon.com/cli/
**az**: \`brew install azure-cli\` (macOS) or https://docs.microsoft.com/cli/azure/install-azure-cli
**kubectl**: \`brew install kubectl\` (macOS) or https://kubernetes.io/docs/tasks/tools/

### Step 3 — Authenticate cloud providers

Ask which providers the user needs, then guide them:

**GCP**:
\`\`\`bash
gcloud auth login
gcloud config set project <PROJECT_ID>
\`\`\`

**AWS** (SSO):
\`\`\`bash
aws configure sso
aws sso login --profile <PROFILE_NAME>
\`\`\`

**AWS** (access keys):
\`\`\`bash
aws configure
\`\`\`

**Azure**:
\`\`\`bash
az login
az account set --subscription <SUBSCRIPTION_NAME_OR_ID>
\`\`\`

### Step 4 — Add clusters

For each cluster the user wants to manage, run the appropriate command:

\`\`\`bash
# GCP GKE
cloum add gcp --name <ALIAS> --cluster-name <CLUSTER> --region <REGION> --project <PROJECT>

# AWS EKS
cloum add aws --name <ALIAS> --cluster-name <CLUSTER> --region <REGION> --profile <PROFILE>

# Azure AKS
cloum add azure --name <ALIAS> --cluster-name <CLUSTER> --region <REGION> --resource-group <RG>
\`\`\`

### Step 5 — Verify

\`\`\`bash
cloum list      # Should show all added clusters
cloum status    # Should show authenticated providers
cloum connect <ALIAS>   # Test connecting to a cluster
kubectl get nodes       # Verify the connection works
\`\`\`

## Notes

- Config file: ~/.config/cloum/clusters.json (human-editable JSON)
- If \`cloum\` is not found, install it: \`curl -sL https://raw.githubusercontent.com/sreeramsa/clowm/master/install.sh | bash\`
- For errors, share the full output and the user's OS/shell
`;

/** Print the AI setup prompt to stdout so it can be piped to Claude or copied */
export async function aiCommand(opts: {
  readonly open: boolean;
}): Promise<void> {
  if (opts.open) {
    await openInClaude();
    return;
  }
  console.log(SETUP_PROMPT);
  console.log(
    "\n─────────────────────────────────────────────────────────────────",
  );
  console.log("Copy the prompt above and paste it into Claude (claude.ai).");
  console.log("Or pipe it directly:");
  console.log("  cloum ai | pbcopy   # macOS — copies to clipboard");
  console.log("  cloum ai | xclip    # Linux");
  console.log(
    "─────────────────────────────────────────────────────────────────\n",
  );
}

/** Attempt to open claude.ai in the default browser with the prompt pre-filled */
async function openInClaude(): Promise<void> {
  const encoded = encodeURIComponent(SETUP_PROMPT);
  const url = `https://claude.ai/new?q=${encoded}`;

  const opener =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "start"
        : "xdg-open";

  const result = await runCommandSilent(opener, [url]);
  if (result.exitCode !== 0) {
    console.log("Could not open browser. Visit this URL manually:");
    console.log(`  https://claude.ai`);
    console.log("\nOr run: cloum ai  (to print the setup prompt)");
  } else {
    console.log("✓ Opened Claude in your browser with the setup prompt.");
  }
}
