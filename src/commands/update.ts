import { VERSION, REPO } from "./version.ts";
import { green, yellow, red, cyan } from "../utils/colors.ts";

interface GitHubRelease {
  tag_name: string;
  assets: Array<{
    name: string;
    browser_download_url: string;
  }>;
}

/** Get the current platform's binary name */
function getCurrentBinaryName(): string {
  const os = process.platform;
  const arch = process.arch;

  let osName: string;
  switch (os) {
    case "darwin":
      osName = "darwin";
      break;
    case "win32":
      osName = "windows";
      break;
    default:
      osName = "linux";
  }

  let archName: string;
  switch (arch) {
    case "arm64":
      archName = "arm64";
      break;
    default:
      archName = "x64";
  }

  const name = `cloum-${osName}-${archName}`;
  return os === "win32" ? `${name}.exe` : name;
}

/** Fetch latest release from GitHub */
async function fetchLatestRelease(): Promise<GitHubRelease | null> {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${REPO}/releases/latest`,
    );
    if (!response.ok) {
      return null;
    }
    return await response.json() as GitHubRelease;
  } catch {
    return null;
  }
}

/** Download and replace the binary */
async function downloadAndReplace(
  url: string,
  binaryPath: string,
): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download: ${response.statusText}`);
  }

  const blob = await response.blob();
  const arrayBuffer = await blob.arrayBuffer();

  // Download to temp file first, then atomically replace
  const tempDir = process.env.TMPDIR || "/tmp";
  const tempPath = `${tempDir}/cloum-${Date.now()}`;
  
  await Bun.write(tempPath, new Uint8Array(arrayBuffer));

  // Make executable (Unix only)
  if (process.platform !== "win32") {
    await Bun.spawn(["chmod", "+x", tempPath]);
  }

  // Use install command to atomically replace the binary
  // This handles the case where we're running from the binary itself
  await Bun.spawn(["install", tempPath, binaryPath]);
  
  // Cleanup temp file
  await Bun.spawn(["rm", tempPath]);
}

/** Run the install script as fallback */
async function runInstallScript(): Promise<void> {
  console.log(yellow(`\n⬇️  Running install script...`));

  const proc = Bun.spawn(
    [
      "bash",
      "-c",
      `curl -sL https://raw.githubusercontent.com/${REPO}/main/install.sh | bash`,
    ],
    {
      stdout: "inherit",
      stderr: "inherit",
    },
  );

  await proc.exited;

  if (proc.exitCode === 0) {
    console.log(green(`\n✅ Update complete!`));
  } else {
    console.log(red(`\n❌ Update script failed with code ${proc.exitCode}`));
  }
}

/** Check if update is needed */
export async function updateCommand(force: boolean = false): Promise<void> {
  console.log(cyan(`\n🔄 Checking for updates...`));
  console.log(`   Current version: ${VERSION}`);

  const release = await fetchLatestRelease();
  if (!release) {
    console.log(yellow(`   Could not fetch release info. Using fallback.`));
    await runInstallScript();
    return;
  }

  const latestVersion = release.tag_name.startsWith("v")
    ? release.tag_name.slice(1)
    : release.tag_name;

  console.log(`   Latest version: ${latestVersion}`);

  // Compare versions properly (not as strings)
  function compareVersions(a: string, b: string): number {
    const aParts = a.split(".").map(Number);
    const bParts = b.split(".").map(Number);
    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
      const aNum = aParts[i] || 0;
      const bNum = bParts[i] || 0;
      if (aNum > bNum) return 1;
      if (aNum < bNum) return -1;
    }
    return 0;
  }

  const cmp = compareVersions(VERSION, latestVersion);
  
  if (!force && cmp === 0) {
    console.log(green(`\n✅ You are on the latest version!`));
    return;
  }

  if (!force && cmp > 0) {
    console.log(
      yellow(`\n⚠️  You are on a newer version than latest release.`),
    );
    return;
  }

  console.log(yellow(`\n⬆️  Updating to v${latestVersion}...`));

  // Find the correct binary
  const binaryName = getCurrentBinaryName();
  const asset = release.assets.find((a) => a.name === binaryName);

  if (!asset) {
    console.log(
      red(
        `\n❌ No compatible binary found for ${process.platform}-${process.arch}`,
      ),
    );
    console.log(yellow(`   Available assets:`));
    for (const a of release.assets) {
      console.log(`   - ${a.name}`);
    }
    console.log(yellow(`\n   Trying install script instead...`));
    await runInstallScript();
    return;
  }

  try {
    console.log(`   Downloading: ${asset.name}`);
    // Get the actual binary path - use which command as fallback
    let binaryPath = Bun.argv[0];
    
    // If running as just "bun" or "./", we need to find the actual binary
    if (!binaryPath || binaryPath === "bun" || binaryPath.includes("bun")) {
      // Try to find it in PATH
      const which = Bun.spawnSync(["which", "cloum"]);
      if (which.stdout.toString().trim()) {
        binaryPath = which.stdout.toString().trim();
      } else {
        // Fallback to default location
        const home = process.env.HOME || process.env.USERPROFILE;
        binaryPath = `${home}/.local/bin/cloum`;
      }
    }
    
    await downloadAndReplace(asset.browser_download_url, binaryPath);
    console.log(green(`\n✅ Updated to v${latestVersion}!`));
    console.log(`   Restart or run \`cloum --version\` to verify.`);
  } catch (error) {
    console.log(red(`\n❌ Update failed: ${error}`));
    console.log(yellow(`   Trying install script as fallback...`));
    await runInstallScript();
  }
}
