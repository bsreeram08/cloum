/**
 * Shared constants for cloum v1.3+
 *
 * API keys are read from environment variables.
 * MINIMAX_API_KEY is required for the LLM router in `cloum ask`.
 */

/** inference.sh MiniMax endpoint */
export const MINIMAX_BASE_URL =
  process.env["MINIMAX_BASE_URL"] ??
  "https://api.inference.net/v1";

/** MiniMax API key — set in environment or ~/.config/cloum/.env */
export const MINIMAX_API_KEY = process.env["MINIMAX_API_KEY"] ?? "";

/** Gist token for cloud sync — stored in Keychain / ~/.config/cloum/cloud.json */
export const GIST_TOKEN = process.env["CLOUM_GIST_TOKEN"] ?? "";

/** Config directory under ~/.config/cloum */
export const CONFIG_DIR = ".config/cloum";

/** Daemon socket path */
export const DAEMON_SOCKET = ".cloum/helper.sock";
