import { runCommand, runCommandSilent } from "../utils/shell.ts";
import { green, yellow, blue, orange, cyan, gray } from "../utils/colors.ts";
import type { Provider } from "../config/types.ts";

/** Remove all kubeconfig contexts */
async function cleanKubeconfig(): Promise<void> {
  console.log(cyan(`  ⚙️  Cleaning kubectl contexts...`));
  const result = await runCommandSilent("kubectl", [
    "config",
    "get-contexts",
    "--output=name",
  ]);
  if (result.exitCode !== 0 || !result.stdout.trim()) {
    console.log(gray(`     No kubectl contexts found.`));
    return;
  }
  const contexts = result.stdout.trim().split("\n").filter(Boolean);
  console.log(gray(`     Removing ${contexts.length} context(s)...`));
  for (const ctx of contexts) {
    await runCommandSilent("kubectl", ["config", "delete-context", ctx]);
    await runCommandSilent("kubectl", ["config", "delete-cluster", ctx]);
  }
  console.log(green(`  ✅ kubectl contexts cleared`));
}

/** Revoke active gcloud credentials */
async function cleanGcp(): Promise<void> {
  console.log(blue(`  🔵 Cleaning GCP sessions...`));
  const result = await runCommandSilent("gcloud", [
    "auth",
    "list",
    "--filter=status:ACTIVE",
    "--format=value(account)",
  ]);
  if (result.exitCode !== 0 || !result.stdout.trim()) {
    console.log(gray(`     No active GCP accounts found.`));
    return;
  }
  const accounts = result.stdout.trim().split("\n").filter(Boolean);
  for (const account of accounts) {
    console.log(gray(`     Revoking: ${account}`));
    await runCommand("gcloud", ["auth", "revoke", account, "--quiet"]);
  }
  console.log(green(`  ✅ GCP credentials revoked`));
}

/** Log out of AWS SSO */
async function cleanAws(): Promise<void> {
  console.log(orange(`  🟠 Cleaning AWS sessions...`));
  const result = await runCommandSilent("aws", ["sso", "logout"]);
  if (result.exitCode === 0) {
    console.log(green(`  ✅ AWS SSO session cleared`));
  } else {
    console.log(
      gray(
        `     aws sso logout: ${result.stderr.trim() || "no active session"}`,
      ),
    );
  }
}

/** Log out of Azure */
async function cleanAzure(): Promise<void> {
  console.log(blue(`  🔵 Cleaning Azure sessions...`));
  const result = await runCommandSilent("az", ["logout"]);
  if (result.exitCode === 0) {
    console.log(green(`  ✅ Azure session cleared`));
  } else {
    console.log(
      gray(`     az logout: ${result.stderr.trim() || "no active session"}`),
    );
  }
}

/**
 * Clear cached sessions.
 * - No provider arg: clears kubectl contexts only
 * - provider arg: clears that provider's auth + kubectl contexts
 * - all: true: clears all providers + kubectl contexts
 */
export async function cleanCommand(opts: {
  readonly all: boolean;
  readonly provider?: Provider;
}): Promise<void> {
  console.log(yellow(`\n🧹 Cleaning cloud sessions...\n`));

  if (opts.provider) {
    switch (opts.provider) {
      case "gcp":
        await cleanGcp();
        break;
      case "aws":
        await cleanAws();
        break;
      case "azure":
        await cleanAzure();
        break;
    }
    await cleanKubeconfig();
  } else if (opts.all) {
    await cleanGcp();
    console.log("");
    await cleanAws();
    console.log("");
    await cleanAzure();
    console.log("");
    await cleanKubeconfig();
  } else {
    await cleanKubeconfig();
    console.log(
      gray(
        `\n  Tip: Use "cloum clean --all" to also revoke cloud provider credentials.`,
      ),
    );
    console.log(
      gray(`       Or target a provider: "cloum clean gcp|aws|azure"`),
    );
  }

  console.log(green(`\n✅ Done.\n`));
}
