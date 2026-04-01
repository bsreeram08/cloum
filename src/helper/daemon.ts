/**
 * cloum-helper — background daemon with Unix socket JSON-RPC API.
 *
 * Protocol: RFC 952 JSON-RPC 2.0 over a Unix domain stream socket.
 *
 * Start:  cloum helper start
 * Stop:   cloum helper stop
 * Status: cloum helper status
 * Shell:  cloum helper shell
 *
 * Socket: ~/.cloum/helper.sock
 */

import { existsSync, unlinkSync, readFileSync } from "fs";
import { homedir, uptime } from "os";
import { join } from "path";
import { createServer, createConnection, type Socket } from "net";
import { loadClusters, saveClusters } from "../config/loader.ts";
import { loadCloudConfig } from "../config/cloud_sync.ts";
import { statusGcp } from "../providers/gcp.ts";
import { statusAws } from "../providers/aws.ts";
import { statusAzure } from "../providers/azure.ts";
import { syncAll } from "../config/cloud_sync.ts";
import { DAEMON_SOCKET, GIST_TOKEN } from "../consts.ts";

const SOCKET_PATH = join(homedir(), DAEMON_SOCKET);
const PID_FILE = join(homedir(), ".cloum", "helper.pid");

export interface RpcRequest {
  jsonrpc: "2.0";
  id: number | string | null;
  method: string;
  params?: Record<string, unknown>;
}

export interface RpcResponse {
  jsonrpc: "2.0";
  id: number | string | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

function buildResponse(
  id: RpcResponse["id"],
  result?: unknown,
  error?: RpcResponse["error"],
): RpcResponse {
  return error
    ? { jsonrpc: "2.0", id, error }
    : { jsonrpc: "2.0", id, result };
}

// ---------------------------------------------------------------------------
// RPC Methods
// ---------------------------------------------------------------------------

type Handler = (params: Record<string, unknown>) => Promise<unknown>;

const methods: Record<string, Handler> = {
  list_clusters: async () => {
    const clusters = await loadClusters();
    return clusters.map((c) => ({
      name: c.name,
      provider: c.provider,
      region: c.region,
      isFavorite: !!(c as { isFavorite?: boolean }).isFavorite,
    }));
  },

  get_cluster: async (params) => {
    const name = params["name"] as string;
    if (!name) throw new Error("name required");
    const clusters = await loadClusters();
    const c = clusters.find((x) => x.name === name);
    if (!c) throw new Error(`Cluster "${name}" not found`);
    return c;
  },

  toggle_favorite: async (params) => {
    const name = params["name"] as string;
    if (!name) throw new Error("name required");
    const clusters = await loadClusters();
    const idx = clusters.findIndex((x) => x.name === name);
    if (idx < 0) throw new Error(`Cluster "${name}" not found`);
    const current =
      (clusters[idx] as { isFavorite?: boolean }).isFavorite ?? false;
    clusters[idx] = {
      ...clusters[idx],
      isFavorite: !current,
    } as (typeof clusters)[number];
    await saveClusters(clusters);
    return { name, isFavorite: !current };
  },

  check_auth: async () => {
    const [gcp, aws, azure] = await Promise.all([
      statusGcp(),
      statusAws(),
      statusAzure(),
    ]);
    return {
      gcp: { authenticated: gcp.isAuthenticated, identity: gcp.identity },
      aws: { authenticated: aws.isAuthenticated, identity: aws.identity },
      azure: {
        authenticated: azure.isAuthenticated,
        identity: azure.identity,
      },
    };
  },

  sync_status: async () => {
    const cfg = loadCloudConfig();
    return {
      enabled: cfg.enabled,
      gistId: cfg.gistId || null,
      lastSync: cfg.lastSync,
    };
  },

  sync_now: async () => {
    if (!GIST_TOKEN) throw new Error("CLOUM_GIST_TOKEN not set");
    return await syncAll(GIST_TOKEN);
  },

  ping: async () => ({ ok: true, uptime: Math.floor(uptime()) }),

  daemon_status: async () => {
    const cfg = loadCloudConfig();
    return {
      socket: SOCKET_PATH,
      cloudSync: cfg.enabled,
      pid: process.pid,
    };
  },
};

async function handleRpc(req: RpcRequest): Promise<RpcResponse> {
  if (req.jsonrpc !== "2.0") {
    return buildResponse(req.id, undefined, {
      code: -32600,
      message: "Invalid Request",
    });
  }

  const handler = methods[req.method];
  if (!handler) {
    return buildResponse(req.id, undefined, {
      code: -32601,
      message: `Method not found: ${req.method}`,
    });
  }

  try {
    const result = await handler(req.params ?? {});
    return buildResponse(req.id, result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return buildResponse(req.id, undefined, {
      code: -32000,
      message: msg,
    });
  }
}

// ---------------------------------------------------------------------------
// Unix socket server (Node net module)
// ---------------------------------------------------------------------------

function runServer(): void {
  if (existsSync(SOCKET_PATH)) unlinkSync(SOCKET_PATH);

  const server = createServer((socket: Socket) => {
    let buf = "";

    socket.on("data", async (chunk: Buffer) => {
      buf += chunk.toString();
      // Each JSON-RPC request is newline-delimited
      const lines = buf.split("\n");
      buf = lines.pop() ?? ""; // keep incomplete line in buffer

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const req = JSON.parse(line) as RpcRequest;
          const resp = await handleRpc(req);
          socket.write(JSON.stringify(resp) + "\n");
        } catch {
          socket.write(
            JSON.stringify(
              buildResponse(null, undefined, {
                code: -32700,
                message: "Parse error",
              }),
            ) + "\n",
          );
        }
      }
    });

    socket.on("error", (err: Error) => {
      // Client disconnected — ignore
    });
  });

  server.on("error", (err: Error) => {
    console.error(`Socket server error: ${err.message}`);
    process.exit(1);
  });

  server.listen(SOCKET_PATH, () => {
    writePid(process.pid!);
  });
}

// ---------------------------------------------------------------------------
// Daemon lifecycle
// ---------------------------------------------------------------------------

function getPid(): number | null {
  try {
    if (!existsSync(PID_FILE)) return null;
    const pid = parseInt(readFileSync(PID_FILE, "utf-8").trim(), 10);
    // Verify process is alive with signal 0
    try {
      process.kill(pid, 0);
      return pid;
    } catch {
      return null; // stale PID file
    }
  } catch {
    return null;
  }
}

function writePid(pid: number): void {
  const dir = join(homedir(), ".cloum");
  try {
    if (!existsSync(dir)) {
      import("fs").then(({ mkdirSync }) => mkdirSync(dir, { recursive: true }));
    }
    import("fs").then(({ writeFileSync }) =>
      writeFileSync(PID_FILE, String(pid))
    );
  } catch (_err) {
    // best-effort PID write
  }
}

async function isRunning(): Promise<boolean> {
  if (!existsSync(SOCKET_PATH)) return false;
  const pid = getPid();
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function startDaemon(): Promise<void> {
  if (await isRunning()) {
    console.log("cloum-helper is already running.");
    return;
  }

  if (existsSync(SOCKET_PATH)) unlinkSync(SOCKET_PATH);

  // Start detached background process
  const self = import.meta.filename;
  // process.argv[0] is "helper" (script name) when run via "bun src/helper/daemon.ts"
  // process.argv[1] is the bun path when run via "bun run src/index.ts helper start"
  const bunPath = process.argv[1]?.startsWith("/")
    ? process.argv[1]
    : process.argv[0]!;
  const proc = Bun.spawn({
    cmd: [bunPath, self, "start"],
    detached: true,
    stdio: ["ignore", "ignore", "ignore"],
  });
  proc.unref();

  // Wait for socket to appear (up to 3s)
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 100));
    if (existsSync(SOCKET_PATH)) {
      console.log(
        `cloum-helper started (PID: ${proc.pid}). Socket: ${SOCKET_PATH}`,
      );
      return;
    }
  }
  console.error("cloum-helper failed to start.");
}

async function stopDaemon(): Promise<void> {
  const pid = getPid();
  if (pid) {
    try {
      process.kill(pid, 15); // SIGTERM
    } catch (_err) {
      // process already gone
    }
  }
  if (existsSync(SOCKET_PATH)) unlinkSync(SOCKET_PATH);
  if (existsSync(PID_FILE)) unlinkSync(PID_FILE);
  console.log("cloum-helper stopped.");
}

async function daemonStatus(): Promise<void> {
  const running = await isRunning();
  const pid = getPid();
  if (running) {
    console.log(`cloum-helper: running (PID ${pid ?? "unknown"}, ${SOCKET_PATH})`);
  } else {
    console.log("cloum-helper: not running");
  }
}

// ---------------------------------------------------------------------------
// Shell mode — interactive JSON-RPC REPL over the socket
// ---------------------------------------------------------------------------

async function shellMode(): Promise<void> {
  await startDaemon();

  // Wait for socket
  for (let i = 0; i < 20; i++) {
    if (existsSync(SOCKET_PATH)) break;
    await new Promise((r) => setTimeout(r, 100));
  }

  console.log(`
cloum-helper shell — JSON-RPC REPL
Socket: ${SOCKET_PATH}
Type JSON-RPC requests. Ctrl+D to exit.
Example: {"jsonrpc":"2.0","id":1,"method":"list_clusters","params":{}}
`);

  const rl = await import("readline").then((m) =>
    m.createInterface({
      input: process.stdin,
      output: process.stdout,
    })
  );

  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const req = JSON.parse(line) as RpcRequest;
      const resp = await callSocket(req);
      console.log(JSON.stringify(resp, null, 2));
    } catch (err) {
      console.error(JSON.stringify({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: String(err) },
      }));
    }
  }
  process.exit(0);
}

/** Send a JSON-RPC request via Unix socket */
function callSocket(req: RpcRequest): Promise<RpcResponse> {
  return new Promise((resolve, reject) => {
    const client = createConnection({ path: SOCKET_PATH }, () => {
      client.write(JSON.stringify(req) + "\n");
    });

    let data = "";
    client.on("data", (chunk: Buffer) => {
      data += chunk.toString();
    });
    client.on("end", () => {
      try {
        resolve(JSON.parse(data.trim()) as RpcResponse);
      } catch {
        reject(new Error(`Invalid response: ${data}`));
      }
    });
    client.on("error", reject);
  });
}

/** Public: send RPC from CLI to running daemon */
export async function sendRpc(
  method: string,
  params: Record<string, unknown> = {},
): Promise<unknown> {
  if (!(await isRunning())) {
    throw new Error(
      "cloum-helper is not running. Run: cloum helper start",
    );
  }
  const req: RpcRequest = { jsonrpc: "2.0", id: 1, method, params };
  const resp = await callSocket(req);
  if (resp.error) {
    throw new Error(resp.error.message);
  }
  return resp.result;
}

// ---------------------------------------------------------------------------
// Entrypoint
// ---------------------------------------------------------------------------

export async function runDaemon(): Promise<void> {
  const [action] = process.argv.slice(2);

  switch (action) {
    case "start": {
      runServer();
      // Keep alive
      await new Promise(() => {});
      break;
    }
    case "stop": {
      await stopDaemon();
      break;
    }
    case "status": {
      await daemonStatus();
      break;
    }
    case "shell": {
      await shellMode();
      break;
    }
    default: {
      console.error(`Usage: cloum helper [start|stop|status|shell]`);
      process.exit(1);
    }
  }
}
