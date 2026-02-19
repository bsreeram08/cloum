import { statusGcp } from "../providers/gcp.ts";
import { statusAws } from "../providers/aws.ts";
import { statusAzure } from "../providers/azure.ts";
import { runCommandSilent } from "../utils/shell.ts";
import {
  green,
  red,
  yellow,
  blue,
  cyan,
  orange,
  gray,
} from "../utils/colors.ts";
import type { ProviderStatus } from "../config/types.ts";

const PROVIDER_LABEL: Record<string, string> = {
  gcp: "🔵 GCP  ",
  aws: "🟠 AWS  ",
  azure: "🔵 Azure",
};

/** Format a single provider status line with color */
function formatStatus(s: ProviderStatus): string {
  const label = PROVIDER_LABEL[s.provider] ?? s.provider.toUpperCase();
  const identity = s.identity ? ` — ${s.identity}` : "";
  const details = s.details ? gray(` (${s.details})`) : "";
  if (s.isAuthenticated) {
    return `  ${green("✅")} ${label}  ${green("authenticated")}${identity}${details}`;
  }
  return `  ${red("✗")}  ${label}  ${red("not authenticated")}`;
}

/** Show kubectl context, cluster name, namespace, and reachability */
async function kubectlStatus(): Promise<void> {
  const [ctx, ns, cluster] = await Promise.all([
    runCommandSilent("kubectl", ["config", "current-context"]),
    runCommandSilent("kubectl", [
      "config",
      "view",
      "--minify",
      "--output",
      "jsonpath={..namespace}",
    ]),
    runCommandSilent("kubectl", [
      "config",
      "view",
      "--minify",
      "--output",
      "jsonpath={.context.cluster}",
    ]),
  ]);

  console.log(cyan(`\n⚙️  Kubernetes:`));
  if (ctx.exitCode !== 0 || !ctx.stdout.trim()) {
    console.log(`  ${red("✗")}  No active context`);
    return;
  }

  const namespace = ns.stdout.trim() || "default";
  console.log(`  ${green("✅")} Context   : ${ctx.stdout.trim()}`);
  console.log(`     Cluster  : ${cluster.stdout.trim() || "(unknown)"}`);
  console.log(`     Namespace: ${namespace}`);

  // Test live reachability
  const nodes = await runCommandSilent("kubectl", [
    "get",
    "nodes",
    "--no-headers",
  ]);
  const nodeCount = nodes.stdout.trim().split("\n").filter(Boolean).length;
  if (nodes.exitCode === 0 && nodeCount > 0) {
    console.log(
      `     Status   : ${green(`✅ Reachable (${nodeCount} node(s))`)}`,
    );
  } else {
    console.log(`     Status   : ${yellow("⚠️  Not reachable")}`);
  }
}

/** Display authentication status for all cloud providers and kubectl */
export async function statusCommand(): Promise<void> {
  console.log(cyan(`\n🔍 Cloud Provider Authentication Status\n`));
  console.log(`  ${"─".repeat(60)}`);

  // Run all cloud status checks concurrently
  const [gcp, aws, azure] = await Promise.all([
    statusGcp(),
    statusAws(),
    statusAzure(),
  ]);

  console.log(blue(`\n  Cloud Providers:`));
  console.log(formatStatus(gcp));
  console.log(formatStatus(aws));
  console.log(formatStatus(azure));

  await kubectlStatus();
  console.log("");
}
