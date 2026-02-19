import type {
  AwsCluster,
  CommandResult,
  ProviderStatus,
} from "../config/types.ts";
import {
  runCommand,
  runCommandSilent,
  runCommandWithEnv,
} from "../utils/shell.ts";
import { green, yellow, blue, cyan, gray } from "../utils/colors.ts";
import { parseAwsError, printError } from "../utils/errors.ts";

/** Build the env overrides needed to activate an AWS profile */
function profileEnv(profile?: string): Record<string, string> {
  return profile ? { AWS_PROFILE: profile } : {};
}

/** Update kubeconfig for an EKS cluster with verbose status output */
export async function connectAws(cluster: AwsCluster): Promise<void> {
  const env = profileEnv(cluster.profile);

  console.log(blue(`  Target profile:  ${cluster.profile ?? "(default)"}`));
  console.log(blue(`  Target cluster:  ${cluster.clusterName}`));
  console.log(blue(`  Target region:   ${cluster.region}`));
  if (cluster.roleArn)
    console.log(blue(`  Assume role:     ${cluster.roleArn}`));
  console.log("");

  // Ensure SSO session is active for the profile
  if (cluster.profile) {
    console.log(yellow(`  🔐 Verifying AWS profile: ${cluster.profile}...`));
    const identity = await runCommandSilent("aws", [
      "sts",
      "get-caller-identity",
      "--query",
      "Account",
      "--output",
      "text",
    ]);
    if (identity.exitCode !== 0) {
      console.log(
        yellow(`  🔐 SSO session expired — launching aws sso login...`),
      );
      await runCommand("aws", ["sso", "login", "--profile", cluster.profile]);
    } else {
      console.log(
        green(`  ✅ AWS account verified: ${identity.stdout.trim()}`),
      );
    }
  }

  const args = [
    "eks",
    "update-kubeconfig",
    "--name",
    cluster.clusterName,
    "--region",
    cluster.region,
  ];
  if (cluster.roleArn) args.push("--role-arn", cluster.roleArn);

  console.log(yellow(`  ⚙️  Updating kubeconfig for EKS cluster...`));
  const result = await runCommandWithEnv("aws", args, env);
  if (result.exitCode !== 0) {
    const err = parseAwsError(result.stderr);
    printError(err);
    throw new Error(`aws eks update-kubeconfig failed: ${err.message}`);
  }

  // Verify auth alignment
  console.log(yellow(`  🔍 Verifying authentication alignment...`));
  const finalIdentity = await runCommandSilent("aws", [
    "sts",
    "get-caller-identity",
    "--query",
    "Account",
    "--output",
    "text",
  ]);
  if (finalIdentity.exitCode === 0) {
    console.log(green(`  ✅ Authentication properly aligned`));
  } else {
    console.log(yellow(`  ⚠️  Could not verify auth alignment`));
  }

  // Test reachability
  console.log(yellow(`  🔍 Testing cluster connection...`));
  const nodes = await runCommandSilent("kubectl", [
    "get",
    "nodes",
    "--no-headers",
  ]);
  const nodeCount = nodes.stdout.trim().split("\n").filter(Boolean).length;
  if (nodes.exitCode === 0 && nodeCount > 0) {
    console.log(
      green(`  ✅ Cluster reachable — ${nodeCount} node(s) available`),
    );
  } else {
    console.log(
      yellow(
        `  ⚠️  Cluster not immediately reachable (may still be propagating)`,
      ),
    );
  }

  // Final status summary
  const ctx = await runCommandSilent("kubectl", ["config", "current-context"]);
  console.log("");
  console.log(cyan(`  📊 Final Status:`));
  console.log(gray(`     AWS Profile  : ${cluster.profile ?? "default"}`));
  console.log(
    gray(`     AWS Account  : ${finalIdentity.stdout.trim() || "unknown"}`),
  );
  console.log(gray(`     AWS Region   : ${cluster.region}`));
  console.log(gray(`     K8s Context  : ${ctx.stdout.trim()}`));
}

/** Check current AWS authentication status */
export async function statusAws(): Promise<ProviderStatus> {
  try {
    const result = await runCommandSilent("aws", [
      "sts",
      "get-caller-identity",
      "--query",
      "Arn",
      "--output",
      "text",
    ]);
    if (result.exitCode !== 0 || !result.stdout.trim()) {
      return { provider: "aws", isAuthenticated: false };
    }
    const profile = process.env["AWS_PROFILE"];
    return {
      provider: "aws",
      isAuthenticated: true,
      identity: result.stdout.trim(),
      details: profile ? `profile: ${profile}` : undefined,
    };
  } catch {
    return {
      provider: "aws",
      isAuthenticated: false,
      details: "aws CLI not installed",
    };
  }
}

/** Discover EKS clusters in a region */
export async function discoverAws(
  region?: string,
  profile?: string,
): Promise<void> {
  const env = profileEnv(profile);
  const args = ["eks", "list-clusters", "--output", "table"];
  if (region) args.push("--region", region);
  const result = await runCommandWithEnv("aws", args, env);
  if (result.exitCode !== 0) {
    throw new Error(`Discovery failed (exit ${result.exitCode})`);
  }
}

/** Login to AWS ECR via Docker */
export async function registryAws(
  region: string,
  profile?: string,
): Promise<void> {
  const env = profileEnv(profile);
  console.log(yellow(`  🐳 Fetching ECR login token for region ${region}...`));
  const tokenResult = await runCommandSilent("aws", [
    "ecr",
    "get-login-password",
    "--region",
    region,
  ]);
  if (tokenResult.exitCode !== 0) {
    throw new Error(`Failed to get ECR token: ${tokenResult.stderr}`);
  }
  const idResult = await runCommandSilent("aws", [
    "sts",
    "get-caller-identity",
    "--query",
    "Account",
    "--output",
    "text",
  ]);
  if (idResult.exitCode !== 0) {
    throw new Error(`Failed to resolve AWS account ID: ${idResult.stderr}`);
  }
  const accountId = idResult.stdout.trim();
  const registry = `${accountId}.dkr.ecr.${region}.amazonaws.com`;
  console.log(yellow(`  🐳 Logging Docker into ${registry}...`));
  const loginProc = Bun.spawn(
    ["docker", "login", "--username", "AWS", "--password-stdin", registry],
    {
      stdout: "inherit",
      stderr: "inherit",
      stdin: new Blob([tokenResult.stdout]),
      env: { ...process.env, ...env } as Record<string, string>,
    },
  );
  const exitCode = await loginProc.exited;
  if (exitCode !== 0) {
    throw new Error(`Docker login to ECR failed (exit ${exitCode})`);
  }
  console.log(green(`  ✅ Authenticated to ${registry}`));
}

/** Authenticate AWS interactively via SSO */
export async function loginAws(profile?: string): Promise<CommandResult> {
  const args = ["sso", "login"];
  if (profile) args.push("--profile", profile);
  return runCommand("aws", args);
}
