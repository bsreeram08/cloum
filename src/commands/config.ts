/**
 * cloum config — cloud sync management
 *
 * Usage:
 *   cloum config sync --status
 *   cloum config sync --enable [--gist-id <id>]
 *   cloum config sync --disable
 *   cloum config sync --push
 *   cloum config sync --pull
 *   cloum config sync          (full sync: pull + merge + push)
 */

import { loadCloudConfig, enableSync, disableSync, syncAll, syncPull, syncPush } from "../config/cloud_sync.ts";
import { jsonSuccess } from "../utils/output.ts";
import { green, yellow, cyan, red } from "../utils/colors.ts";
import { GIST_TOKEN } from "../consts.ts";

export interface ConfigOptions {
  readonly json: boolean;
}

export interface SyncOptions {
  readonly json: boolean;
  readonly enable: boolean;
  readonly disable: boolean;
  readonly push: boolean;
  readonly pull: boolean;
  readonly status: boolean;
  readonly gistId?: string;
  readonly token?: string;
}

export async function configCommand(opts: ConfigOptions): Promise<void> {
  const start = Date.now();
  const config = loadCloudConfig();

  if (opts.json) {
    console.log(jsonSuccess({
      cloudSync: {
        enabled: config.enabled,
        gistId: config.gistId || null,
        syncInterval: config.syncInterval,
        lastSync: config.lastSync,
        conflictStrategy: config.conflictStrategy,
      },
    }, "config", start));
    return;
  }

  console.log(cyan(`\n⚙️  cloum config\n`));
  console.log(`  Config file:  ~/.config/cloum/cloud.json`);
  console.log(`  Config file:  ~/.config/cloum/clusters.json`);
  console.log(`\n  Cloud Sync:   ${config.enabled ? green("enabled") : yellow("disabled")}`);
  if (config.enabled) {
    console.log(`  Gist ID:     ${config.gistId}`);
    console.log(`  Interval:    ${config.syncInterval}`);
    console.log(`  Last sync:   ${config.lastSync ?? "never"}`);
    console.log(`  Strategy:    ${config.conflictStrategy}`);
    if (!GIST_TOKEN) {
      console.log(yellow(`\n  ⚠️  CLOUM_GIST_TOKEN not set — sync will fail`));
    }
  }
  console.log(`\n  ${green("CLOUM_GIST_TOKEN")} env var controls authentication`);
  console.log(`  Set in ~/.bashrc or ~/.zshrc to persist.\n`);
}

export async function syncCommand(opts: SyncOptions): Promise<void> {
  const start = Date.now();
  const config = loadCloudConfig();

  // --status
  if (opts.status || (!opts.enable && !opts.disable && !opts.push && !opts.pull)) {
    if (opts.json) {
      console.log(jsonSuccess({
        enabled: config.enabled,
        gistId: config.gistId || null,
        lastSync: config.lastSync,
        syncInterval: config.syncInterval,
        conflictStrategy: config.conflictStrategy,
        tokenSet: !!GIST_TOKEN,
      }, "sync", start));
      return;
    }
    console.log(cyan(`\n☁️  cloum sync status\n`));
    console.log(`  Enabled:    ${config.enabled ? green("yes") : red("no")}`);
    console.log(`  Gist ID:    ${config.gistId || yellow("(none)")}`);
    console.log(`  Last sync:  ${config.lastSync ?? yellow("never")}`);
    console.log(`  Interval:   ${config.syncInterval}`);
    console.log(`  Strategy:   ${config.conflictStrategy}`);
    console.log(`  Token:      ${GIST_TOKEN ? green("set") : red("not set — set CLOUM_GIST_TOKEN env var")}`);
    return;
  }

  // --disable
  if (opts.disable) {
    disableSync();
    if (opts.json) {
      console.log(jsonSuccess({ disabled: true }, "sync", start));
      return;
    }
    console.log(green(`\n  ✅ Cloud sync disabled.\n`));
    return;
  }

  // Require token for all other operations
  const token = opts.token ?? GIST_TOKEN;
  if (!token) {
    if (opts.json) {
      console.log(jsonSuccess({
        error: "CLOUM_GIST_TOKEN not set. Set it as an env var or pass --token.",
      }, "sync", start));
      return;
    }
    console.error(red(`\n  ❌ CLOUM_GIST_TOKEN not set.`));
    console.error(`  Set it as an env var: export CLOUM_GIST_TOKEN=ghp_...`);
    console.error(`  Or pass it directly: cloum config sync --enable --token ghp_...\n`);
    return;
  }

  // --enable
  if (opts.enable) {
    const result = await enableSync(token, opts.gistId);
    if (opts.json) {
      console.log(jsonSuccess({ enabled: true, gistId: result.gistId }, "sync", start));
      return;
    }
    console.log(green(`\n  ✅ Cloud sync enabled`));
    console.log(`  Gist ID: ${result.gistId}`);
    console.log(yellow(`\n  Save this Gist ID to reuse it:`));
    console.log(`  cloum config sync --enable --gist-id ${result.gistId}\n`);
    return;
  }

  // --push
  if (opts.push) {
    try {
      const result = await syncPush(token);
      if (opts.json) {
        console.log(jsonSuccess(result, "sync", start));
        return;
      }
      console.log(green(`\n  ✅ Pushed ${result.clustersUpdated} clusters to Gist\n`));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (opts.json) {
        console.log(jsonSuccess({ success: false, error: msg }, "sync", start));
        return;
      }
      console.error(red(`\n  ❌ Push failed: ${msg}\n`));
    }
    return;
  }

  // --pull
  if (opts.pull) {
    try {
      const result = await syncPull(token);
      if (opts.json) {
        console.log(jsonSuccess(result, "sync", start));
        return;
      }
      if (result.success) {
        console.log(green(`\n  ✅ Pulled — ${result.clustersUpdated} clusters updated\n`));
      } else {
        console.log(yellow(`\n  ⚠️  ${result.error}\n`));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (opts.json) {
        console.log(jsonSuccess({ success: false, error: msg }, "sync", start));
        return;
      }
      console.error(red(`\n  ❌ Pull failed: ${msg}\n`));
    }
    return;
  }

  // Full sync
  try {
    const result = await syncAll(token);
    if (opts.json) {
      console.log(jsonSuccess(result, "sync", start));
      return;
    }
    console.log(green(`\n  ✅ Synced — ${result.clustersUpdated} clusters`));
    console.log(`  Direction: ${result.direction}\n`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (opts.json) {
      console.log(jsonSuccess({ success: false, error: msg }, "sync", start));
      return;
    }
    console.error(red(`\n  ❌ Sync failed: ${msg}\n`));
  }
}
