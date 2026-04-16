# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.3.x   | :white_check_mark: |
| < 1.3   | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability within cloum, please report it via:

- **GitHub Security Advisories**: [https://github.com/bsreeram08/cloum/security/advisories/new](https://github.com/bsreeram08/cloum/security/advisories/new)
- **Email**: sreeram [@] sreerams.in

Do **not** report security issues via public GitHub Issues.

Please include as much of the following as possible:

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Affected version(s)

## Security Model

### Secrets

- **Gist token** (`CLOUM_GIST_TOKEN`): Stored only in the user's environment, never written to disk or stdout. Displayed as `set (len: 40)` in `sync --status` output.
- **API keys** (`CLOUM_MINIMAX_KEY`): Same treatment — environment-only.
- **Cloud credentials**: Never stored by cloum. Delegated entirely to the cloud SDKs (`gcloud`, `aws`, `az`).

### Config File

- `~/.config/cloum/clusters.json` contains only cluster metadata (names, regions, project IDs). No credentials, tokens, or secrets.
- Config file permissions should be `0600` — cloum does not enforce this but respects the system's file permissions.

### Network

- All network traffic is to cloud provider APIs and GitHub (for Gist sync).
- No telemetry, no analytics, no third-party services.
- Gist sync uses HTTPS only.

### Sandboxing

- `cloum-helper` daemon runs as the same user — no privilege separation.
- `cloum-menu` is not sandboxed (App Sandbox disabled in entitlements) due to the global hotkey requirement via `CGEvent` tap. The hotkey requires Accessibility permission.

## Security Checklist for Operators

- [ ] Run `chmod 0600 ~/.config/cloum/clusters.json`
- [ ] Never commit `CLOUM_GIST_TOKEN` or `CLOUM_MINIMAX_KEY` to git
- [ ] Use `bun audit` / `cloum audit` regularly
- [ ] Review `cloum config --json` output for unexpected clusters
- [ ] Rotate `CLOUM_GIST_TOKEN` if a token is leaked — delete the Gist and re-enable sync
