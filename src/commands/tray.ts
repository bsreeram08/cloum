import { green, yellow, red, cyan, gray, blue } from "../utils/colors.ts";
import { homedir } from "os";
import { join } from "path";
import { runCommandSilent } from "../utils/shell.ts";
import { REPO, VERSION } from "./version.ts";

// ─── Installation paths ──────────────────────────────────────────────────────

const HOME = homedir();
const BIN_DIR = join(HOME, ".local", "bin");
const TRAY_BIN = join(BIN_DIR, "cloum-tray");
const LAUNCH_AGENTS_DIR = join(HOME, "Library", "LaunchAgents");
const PLIST_PATH = join(LAUNCH_AGENTS_DIR, "io.cloum.tray.plist");
const SWIFT_ASSET = "macos/MenuBar.swift";

// ─── Help ────────────────────────────────────────────────────────────────────

const TRAY_HELP = `
cloum tray — macOS menu bar companion for cloum v${VERSION}

Usage:
  cloum tray install        Compile & install the menu bar app + LaunchAgent
  cloum tray start          Start the menu bar app (or reload after changes)
  cloum tray stop           Stop the running menu bar app
  cloum tray status         Show whether the menu bar app is running
  cloum tray uninstall      Remove the binary and LaunchAgent

The menu bar app provides:
  • Cloud icon (⎈) in the macOS notification bar
  • Current kubectl context shown at a glance
  • ⭐ Favourites with keyboard shortcuts 1–9
  • All clusters grouped by provider (GCP / AWS / Azure)
  • One-click connect that opens a Terminal/iTerm2 session
  • Auto-refresh when ~/.config/cloum/clusters.json changes

Requires:
  • macOS 10.15+ (Catalina or later)
  • Swift toolchain: xcode-select --install

Note: Terminal must have Automation permission for Scripting (System Settings →
  Privacy & Security → Automation → Terminal → enable "Terminal" / "iTerm").
`;

// ─── LaunchAgent plist ───────────────────────────────────────────────────────

function buildPlist(binaryPath: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>io.cloum.tray</string>
  <key>ProgramArguments</key>
  <array>
    <string>${binaryPath}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <false/>
  <key>StandardErrorPath</key>
  <string>/tmp/cloum-tray.log</string>
  <key>StandardOutPath</key>
  <string>/tmp/cloum-tray.log</string>
</dict>
</plist>
`;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function fileExists(path: string): Promise<boolean> {
  return Bun.file(path).exists();
}

/** Locate the Swift source: prefer a local copy, then GitHub */
async function fetchSwiftSource(): Promise<string> {
  // 1. Check well-known local paths
  const candidates = [
    // When running from a cloned repo (e.g. bun link / bun run src/index.ts)
    join(process.cwd(), "macos", "MenuBar.swift"),
    // Cached copy left by a previous `tray install`
    join(HOME, ".local", "share", "cloum", "MenuBar.swift"),
  ];

  for (const p of candidates) {
    if (await fileExists(p)) {
      console.log(gray(`  Using local source: ${p}`));
      return await Bun.file(p).text();
    }
  }

  // 2. Download from GitHub
  const url = `https://raw.githubusercontent.com/${REPO}/master/${SWIFT_ASSET}`;
  console.log(gray(`  Downloading source from: ${url}`));
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `Failed to download Swift source (HTTP ${res.status}). ` +
        `Check your internet connection or run from the cloned repository.`,
    );
  }
  return await res.text();
}

async function ensureDir(path: string): Promise<void> {
  const proc = Bun.spawn(["mkdir", "-p", path]);
  await proc.exited;
}

// ─── Subcommands ─────────────────────────────────────────────────────────────

async function installTray(): Promise<void> {
  console.log(blue(`\n🍎 Installing Cloum menu bar app…\n`));

  // Check for swiftc
  const swiftCheck = await runCommandSilent("which", ["swiftc"]);
  if (swiftCheck.exitCode !== 0) {
    console.error(
      red(
        "  ❌ Swift toolchain not found.\n" +
          "     Install Xcode Command Line Tools first:\n\n" +
          "       xcode-select --install\n",
      ),
    );
    process.exit(1);
  }
  const swiftPath = swiftCheck.stdout.trim();
  console.log(gray(`  Swift compiler: ${swiftPath}`));

  // Fetch Swift source
  const source = await fetchSwiftSource();

  // Write to a temp file
  const tmpSwift = "/tmp/cloum-MenuBar.swift";
  await Bun.write(tmpSwift, source);
  console.log(gray(`  Source written to: ${tmpSwift}`));

  // Ensure bin directory exists
  await ensureDir(BIN_DIR);

  // Compile
  console.log(yellow(`  ⚙️  Compiling (this may take ~30 s on first run)…`));
  const compile = Bun.spawn(
    ["swiftc", "-O", "-o", TRAY_BIN, tmpSwift],
    { stdout: "pipe", stderr: "pipe" },
  );
  const [compileExit, compileErr] = await Promise.all([
    compile.exited,
    new Response(compile.stderr).text(),
  ]);

  if (compileExit !== 0) {
    console.error(red(`\n  ❌ Compilation failed:\n`));
    console.error(compileErr);
    process.exit(1);
  }
  console.log(green(`  ✅ Binary installed: ${TRAY_BIN}`));

  // Copy Swift source to share dir for future reinstalls
  const shareDir = join(HOME, ".local", "share", "cloum");
  await ensureDir(shareDir);
  await Bun.write(join(shareDir, "MenuBar.swift"), source);

  // Create LaunchAgent
  await ensureDir(LAUNCH_AGENTS_DIR);
  const plist = buildPlist(TRAY_BIN);
  await Bun.write(PLIST_PATH, plist);
  console.log(green(`  ✅ LaunchAgent installed: ${PLIST_PATH}`));

  // Load the LaunchAgent (start it now)
  const load = Bun.spawn(["launchctl", "load", "-w", PLIST_PATH], {
    stdout: "pipe",
    stderr: "pipe",
  });
  await load.exited;

  console.log(
    green(
      `\n  ✅ Cloum Tray is running! Look for the ⎈ cloud icon in your menu bar.\n`,
    ),
  );
  console.log(
    gray(
      `  To stop:       cloum tray stop\n` +
        `  To uninstall:  cloum tray uninstall\n`,
    ),
  );
}

async function startTray(): Promise<void> {
  if (!(await fileExists(TRAY_BIN))) {
    console.error(
      red(
        `\n  ❌ cloum-tray binary not found at ${TRAY_BIN}.\n` +
          `     Run ${cyan("cloum tray install")} first.\n`,
      ),
    );
    process.exit(1);
  }
  if (!(await fileExists(PLIST_PATH))) {
    console.error(
      red(
        `\n  ❌ LaunchAgent plist not found at ${PLIST_PATH}.\n` +
          `     Run ${cyan("cloum tray install")} to recreate it.\n`,
      ),
    );
    process.exit(1);
  }

  // Unload first (in case it was already loaded) then reload
  const unload = Bun.spawn(["launchctl", "unload", PLIST_PATH], {
    stdout: "pipe",
    stderr: "pipe",
  });
  await unload.exited;

  const load = Bun.spawn(["launchctl", "load", "-w", PLIST_PATH], {
    stdout: "pipe",
    stderr: "pipe",
  });
  await load.exited;

  console.log(green(`\n  ✅ Cloum Tray started. Check the ⎈ icon in your menu bar.\n`));
}

async function stopTray(): Promise<void> {
  if (!(await fileExists(PLIST_PATH))) {
    console.log(yellow(`\n  Cloum Tray is not installed (no LaunchAgent found).\n`));
    return;
  }
  const unload = Bun.spawn(["launchctl", "unload", PLIST_PATH], {
    stdout: "pipe",
    stderr: "pipe",
  });
  await unload.exited;
  console.log(yellow(`\n  ⏹  Cloum Tray stopped.\n`));
}

async function trayStatus(): Promise<void> {
  const binOk = await fileExists(TRAY_BIN);
  const plistOk = await fileExists(PLIST_PATH);

  console.log(cyan(`\n  Cloum Tray status:\n`));
  console.log(`  Binary:      ${binOk ? green(TRAY_BIN) : red("not installed")}`);
  console.log(`  LaunchAgent: ${plistOk ? green(PLIST_PATH) : red("not installed")}`);

  if (binOk) {
    // Check if the process is running
    const ps = await runCommandSilent("pgrep", ["-x", "cloum-tray"]);
    const running = ps.exitCode === 0 && ps.stdout.trim() !== "";
    console.log(`  Process:     ${running ? green("running (PID " + ps.stdout.trim() + ")") : yellow("not running")}`);
  }

  if (!binOk) {
    console.log(
      gray(`\n  Run ${cyan("cloum tray install")} to get started.\n`),
    );
  }
  console.log("");
}

async function uninstallTray(): Promise<void> {
  console.log(yellow(`\n  🗑️  Uninstalling Cloum Tray…\n`));

  // Stop first
  if (await fileExists(PLIST_PATH)) {
    const unload = Bun.spawn(["launchctl", "unload", PLIST_PATH], {
      stdout: "pipe",
      stderr: "pipe",
    });
    await unload.exited;

    // Remove plist
    const rm1 = Bun.spawn(["rm", "-f", PLIST_PATH]);
    await rm1.exited;
    console.log(gray(`  Removed: ${PLIST_PATH}`));
  }

  if (await fileExists(TRAY_BIN)) {
    const rm2 = Bun.spawn(["rm", "-f", TRAY_BIN]);
    await rm2.exited;
    console.log(gray(`  Removed: ${TRAY_BIN}`));
  }

  console.log(green(`\n  ✅ Cloum Tray uninstalled.\n`));
}

// ─── Public entry point ───────────────────────────────────────────────────────

export async function trayCommand(args: string[]): Promise<void> {
  if (process.platform !== "darwin") {
    console.error(
      red(
        "\n  ❌ The tray command is only supported on macOS.\n" +
          "     On Linux/Windows you can still use the CLI commands directly.\n",
      ),
    );
    process.exit(1);
  }

  const sub = args[0] ?? "help";

  switch (sub) {
    case "install":
      await installTray();
      break;
    case "start":
      await startTray();
      break;
    case "stop":
      await stopTray();
      break;
    case "status":
      await trayStatus();
      break;
    case "uninstall":
      await uninstallTray();
      break;
    default:
      console.log(TRAY_HELP);
  }
}
