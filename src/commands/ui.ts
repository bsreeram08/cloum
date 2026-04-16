import { createCliRenderer, Box, Text, Select, SelectRenderableEvents, TextRenderable, type KeyEvent } from "@opentui/core";
import { loadClusters } from "../config/loader.ts";
import { connectCommand } from "./connect.ts";
import { blue, cyan, gray, green, yellow } from "../utils/colors.ts";

export async function uiCommand() {
  const clusters = await loadClusters();
  
  const renderer = await createCliRenderer({
    exitOnCtrlC: true,
    targetFps: 30,
  });

  const options = clusters.map(c => ({
    name: c.name,
    description: `[${c.provider.toUpperCase()}] ${c.clusterName} in ${c.region}`,
    value: c
  }));

  if (options.length === 0) {
    renderer.root.add(
      Box({ padding: 2, flexDirection: "column" },
        Text({ content: "No clusters found. Run 'cloum add' or 'cloum discover' to get started.", fg: "#FF5555" }),
        Text({ content: "\nPress Ctrl+C to exit." })
      )
    );
    return;
  }

  // Create the detail text renderable explicitly so we can mutate it
  const detailText = new TextRenderable(renderer, {
    content: "Select a cluster to view details...",
  });

  const menu = Select({
    width: "100%",
    height: "100%",
    options: options.map(o => ({ name: o.name, description: `[${o.value.provider.toUpperCase()}]` })),
  });

  function updateDetails(cluster: any) {
    const details = [
      `Name:     ${cluster.name}`,
      `Provider: ${cluster.provider.toUpperCase()}`,
      `Region:   ${cluster.region}`,
      `Cluster:  ${cluster.clusterName}`,
    ];
    
    if (cluster.provider === "gcp") {
      details.push(`Project:  ${cluster.project}`);
      details.push(`Account:  ${cluster.account}`);
    } else if (cluster.provider === "aws") {
      if (cluster.profile) details.push(`Profile:  ${cluster.profile}`);
      if (cluster.roleArn) details.push(`Role ARN: ${cluster.roleArn}`);
    } else if (cluster.provider === "azure") {
      details.push(`Resource Group: ${cluster.resourceGroup}`);
      if (cluster.subscription) details.push(`Subscription: ${cluster.subscription}`);
    }

    details.push("\nActions:");
    details.push("  Enter - Connect & configure kubeconfig");
    details.push("  q / Esc - Quit");

    detailText.content = details.join("\n");
  }

  if (options.length > 0 && options[0]?.value) {
    updateDetails(options[0].value);
  }

  (menu as any).on(SelectRenderableEvents.SELECTION_CHANGED, (index: number, option: any) => {
    const cluster = options.find(o => o.name === option.name)?.value;
    if (cluster) updateDetails(cluster);
  });

  // Typecast or expect that VNode exposes on()
  (menu as any).on(SelectRenderableEvents.ITEM_SELECTED, async (index: number, option: any) => {
    renderer.destroy();
    console.log(`\nConnecting to ${option.name}...`);
    try {
      await connectCommand(option.name);
    } catch(e) {
      console.error(e);
    }
    process.exit(0);
  });

  const layout = Box(
    { width: "100%", height: "100%", flexDirection: "row", gap: 1 },
    Box(
      { width: "30%", height: "100%", borderStyle: "rounded", title: "Clusters" },
      menu
    ),
    Box(
      { flexGrow: 1, height: "100%", borderStyle: "rounded", title: "Cluster Details", padding: 1 },
      detailText
    )
  );

  renderer.keyInput.on("keypress", (key: KeyEvent) => {
    if (key.name === "escape" || (key.name === "q" && !key.ctrl && !key.meta)) {
      renderer.destroy();
      process.exit(0);
    }
  });

  menu.focus();
  renderer.root.add(layout);
}
