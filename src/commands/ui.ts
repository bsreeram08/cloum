import { createCliRenderer, Box, Text, Select, SelectRenderableEvents } from "@opentui/core";
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

  const menu = Select({
    width: "100%",
    height: "100%",
    options: options.map(o => ({ name: o.name, description: o.description })),
  });

  // Typecast or expect that VNode exposes on()
  (menu as any).on(SelectRenderableEvents.ITEM_SELECTED, async (index: number, option: any) => {
    renderer.destroy();
    console.log(`Connecting to ${option.name}...`);
    try {
      await connectCommand(option.name);
    } catch(e) {
      console.error(e);
    }
    process.exit(0);
  });

  menu.focus();
  renderer.root.add(menu);
}
