/**
 * GitHub Gist-based cloud config sync for cloum.
 *
 * Stores clusters.json in a private Gist so multiple machines / agents
 * can share the same cluster definitions.
 *
 * Merge strategy: union by cluster name, latest timestamp wins.
 */

import { homedir } from "os";
import { join } from "path";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { loadClusters, saveClusters } from "./loader.ts";
import type { ClusterConfig } from "./types.ts";
import { GIST_TOKEN } from "../consts.ts";

export interface CloudSyncConfig {
  enabled: boolean;
  gistId: string;
  /** Stored separately in Keychain — passed in from config command */
  gistToken?: string;
  syncInterval: "auto" | "30s" | "5m" | "15m" | "1h";
  lastSync: string | null;
  conflictStrategy: "cloud-wins" | "local-wins" | "ask";
}

export interface SyncResult {
  success: boolean;
  direction: "push" | "pull" | "merge";
  clustersUpdated: number;
  error?: string;
}

const CLOUD_CONFIG_PATH = () =>
  join(homedir(), ".config", "cloum", "cloud.json");

/** Load cloud sync config */
export function loadCloudConfig(): CloudSyncConfig {
  const path = CLOUD_CONFIG_PATH();
  if (!existsSync(path)) {
    return {
      enabled: false,
      gistId: "",
      syncInterval: "auto",
      lastSync: null,
      conflictStrategy: "cloud-wins",
    };
  }
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as CloudSyncConfig;
  } catch {
    return {
      enabled: false,
      gistId: "",
      syncInterval: "auto",
      lastSync: null,
      conflictStrategy: "cloud-wins",
    };
  }
}

/** Save cloud sync config */
export function saveCloudConfig(config: CloudSyncConfig): void {
  const dir = join(homedir(), ".config", "cloum");
  const path = CLOUD_CONFIG_PATH();
  try {
    // Ensure directory exists
    if (!existsSync(dir)) {
      Bun.spawn(["mkdir", "-p", dir]);
    }
    writeFileSync(path, JSON.stringify(config, null, 2) + "\n");
  } catch (err) {
    throw new Error(`Failed to save cloud config: ${err}`);
  }
}

/** Merge two cluster lists — latest timestamp wins on conflict */
function mergeClusters(
  local: ClusterConfig[],
  remote: ClusterConfig[],
  strategy: CloudSyncConfig["conflictStrategy"],
): ClusterConfig[] {
  const byName = new Map<string, ClusterConfig & { _ts?: number }>();

  // Add local clusters with timestamp
  for (const c of local) {
    const enriched = { ...c } as ClusterConfig & { _ts?: number };
    enriched._ts = 0; // local = older unless remote has no timestamp
    byName.set(c.name, enriched);
  }

  // Merge remote — cloud-wins means remote overwrites local
  for (const c of remote) {
    const existing = byName.get(c.name);
    const remoteTs = (c as unknown as { _ts?: number })._ts ?? 1;
    if (!existing || strategy === "cloud-wins" || remoteTs > (existing._ts ?? 0)) {
      byName.set(c.name, { ...c });
    }
  }

  // Strip internal _ts field
  return Array.from(byName.values()).map(({ _ts: _ignore, ...c }) => c);
}

// ---------------------------------------------------------------------------
// Gist API
// ---------------------------------------------------------------------------

interface GistFile {
  content?: string;
}

interface GistResponse {
  id: string;
  files: Record<string, GistFile>;
  updated_at: string;
}

async function gistFetch(
  gistId: string,
  token: string,
): Promise<{ clusters: ClusterConfig[]; updatedAt: string } | null> {
  try {
    const res = await fetch(`https://api.github.com/gists/${gistId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Gist API ${res.status}: ${await res.text()}`);

    const data = (await res.json()) as GistResponse;
    const file = data.files["clusters.json"];
    if (!file?.content) return null;

    const parsed = JSON.parse(file.content);
    // Attach remote timestamp for merge decisions
    const remoteTs = new Date(data.updated_at).getTime();
    const clusters = (parsed.clusters ?? []).map((c: ClusterConfig) => ({
      ...c,
      _ts: remoteTs,
    })) as (ClusterConfig & { _ts: number })[];

    return { clusters, updatedAt: data.updated_at };
  } catch (err) {
    throw new Error(`Gist fetch failed: ${err}`);
  }
}

async function gistPush(
  gistId: string,
  token: string,
  clusters: ClusterConfig[],
): Promise<void> {
  const content = JSON.stringify({ clusters }, null, 2);
  const body = JSON.stringify({
    files: {
      "clusters.json": { content },
    },
  });

  const res = await fetch(`https://api.github.com/gists/${gistId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body,
  });

  if (!res.ok) {
    throw new Error(`Gist push failed: ${res.status} ${await res.text()}`);
  }
}

async function gistCreate(
  token: string,
  clusters: ClusterConfig[],
  description = "cloum cluster config",
): Promise<string> {
  const content = JSON.stringify({ clusters }, null, 2);
  const body = JSON.stringify({
    description,
    public: false,
    files: {
      "clusters.json": { content },
    },
  });

  const res = await fetch("https://api.github.com/gists", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body,
  });

  if (!res.ok) {
    throw new Error(`Gist create failed: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as { id: string };
  return data.id;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Pull from Gist, merge with local, save merged result.
 * Returns clusters that were updated.
 */
export async function syncPull(token: string): Promise<SyncResult> {
  const config = loadCloudConfig();
  if (!config.enabled || !config.gistId) {
    return { success: false, direction: "pull", clustersUpdated: 0, error: "Sync not enabled" };
  }

  const remote = await gistFetch(config.gistId, token);
  if (!remote) {
    return { success: false, direction: "pull", clustersUpdated: 0, error: "Gist not found or empty" };
  }

  const local = await loadClusters();
  const merged = mergeClusters(local, remote.clusters, config.conflictStrategy);
  const added = merged.length - local.length;

  await saveClusters(merged);

  config.lastSync = new Date().toISOString();
  saveCloudConfig(config);

  return { success: true, direction: "pull", clustersUpdated: added };
}

/**
 * Push local clusters to Gist.
 */
export async function syncPush(token: string): Promise<SyncResult> {
  const config = loadCloudConfig();
  if (!config.enabled || !config.gistId) {
    return { success: false, direction: "push", clustersUpdated: 0, error: "Sync not enabled" };
  }

  const local = await loadClusters();
  await gistPush(config.gistId, token, local);

  config.lastSync = new Date().toISOString();
  saveCloudConfig(config);

  return { success: true, direction: "push", clustersUpdated: local.length };
}

/**
 * Full sync: pull → merge → push.
 */
export async function syncAll(token: string): Promise<SyncResult> {
  const config = loadCloudConfig();
  if (!config.enabled || !config.gistId) {
    return { success: false, direction: "merge", clustersUpdated: 0, error: "Sync not enabled" };
  }

  const remote = await gistFetch(config.gistId, token);
  const local = await loadClusters();

  let merged: ClusterConfig[];
  if (remote) {
    merged = mergeClusters(local, remote.clusters, config.conflictStrategy);
  } else {
    // No remote yet — push local as the initial state
    await gistPush(config.gistId, token, local);
    config.lastSync = new Date().toISOString();
    saveCloudConfig(config);
    return { success: true, direction: "merge", clustersUpdated: local.length };
  }

  await saveClusters(merged);
  await gistPush(config.gistId, token, merged);

  config.lastSync = new Date().toISOString();
  saveCloudConfig(config);

  const changed = merged.length;
  return { success: true, direction: "merge", clustersUpdated: changed };
}

/**
 * Enable cloud sync: create a new Gist or use provided gistId.
 */
export async function enableSync(
  token: string,
  gistId?: string,
): Promise<{ gistId: string }> {
  const config = loadCloudConfig();

  if (!gistId) {
    // Create a new private Gist
    gistId = await gistCreate(token, []);
  }

  config.enabled = true;
  config.gistId = gistId;
  config.lastSync = null;
  saveCloudConfig(config);

  return { gistId };
}

/** Disable cloud sync */
export function disableSync(): void {
  const config = loadCloudConfig();
  config.enabled = false;
  saveCloudConfig(config);
}
