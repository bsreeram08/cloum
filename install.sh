#!/bin/bash
set -euo pipefail

REPO="bsreeram08/cloum"
BIN_DIR="${HOME}/.local/bin"
INSTALL_DIR="${HOME}/.local/share/cloum"

# ── helpers ────────────────────────────────────────────────────────────────────

detect_os() {
    case "$(uname -s)" in
        Linux*)  echo "linux";;
        Darwin*) echo "darwin";;
        *)       echo "unknown";;
    esac
}

detect_arch() {
    case "$(uname -m)" in
        x86_64)        echo "x64";;
        aarch64|arm64) echo "arm64";;
        *)             echo "unknown";;
    esac
}

fetch() {
    if command -v curl &>/dev/null; then
        curl -fsSL "$1"
    elif command -v wget &>/dev/null; then
        wget -qO- "$1"
    else
        echo "Error: curl or wget is required" >&2
        exit 1
    fi
}

fetch_file() {
    local url=$1 dest=$2
    if command -v curl &>/dev/null; then
        curl -fsSL "$url" -o "$dest"
    elif command -v wget &>/dev/null; then
        wget -q "$url" -O "$dest"
    else
        echo "Error: curl or wget is required" >&2
        exit 1
    fi
}

resolve_version() {
    local version
    version=$(fetch "https://api.github.com/repos/${REPO}/releases/latest" \
        | grep '"tag_name"' | head -1 | sed 's/.*"tag_name": *"\([^"]*\)".*/\1/')
    if [ -z "$version" ]; then
        echo "Error: Could not resolve latest version from GitHub API" >&2
        exit 1
    fi
    echo "$version"
}

ensure_in_path() {
    if echo ":${PATH}:" | grep -q ":${BIN_DIR}:"; then
        return
    fi
    echo ""
    echo "  ${BIN_DIR} is not in your PATH."
    echo "  Add the following to your shell profile (~/.zshrc, ~/.bashrc, etc.):"
    echo ""
    echo "    export PATH=\"\${HOME}/.local/bin:\${PATH}\""
    echo ""
}

# ── commands ───────────────────────────────────────────────────────────────────

install() {
    local os arch version binary_name url

    os=$(detect_os)
    arch=$(detect_arch)

    if [ "$os" = "unknown" ] || [ "$arch" = "unknown" ]; then
        echo "Error: Unsupported platform $(uname -s)/$(uname -m)" >&2
        exit 1
    fi

    echo "Detected platform: ${os}-${arch}"

    # Use provided version or fetch latest
    if [ -n "${VERSION:-}" ]; then
        version="$VERSION"
    else
        version=$(resolve_version)
    fi
    echo "Installing cloum ${version}..."

    # Binary names match the GitHub release artifacts (using bun-darwin/bun-linux/bun-windows format)
    if [ "$os" = "darwin" ]; then
        binary_name="cloum-${os}-${arch}"
    elif [ "$os" = "linux" ]; then
        binary_name="cloum-${os}-${arch}"
    else
        binary_name="cloum-${os}-${arch}.exe"
    fi

    url="https://github.com/${REPO}/releases/download/${version}/${binary_name}"

    mkdir -p "${BIN_DIR}" "${INSTALL_DIR}"

    echo "Downloading ${url}..."
    fetch_file "$url" "${INSTALL_DIR}/cloum"
    chmod +x "${INSTALL_DIR}/cloum"

    # Replace any existing symlink or binary
    rm -f "${BIN_DIR}/cloum"
    ln -sf "${INSTALL_DIR}/cloum" "${BIN_DIR}/cloum"

    echo "✓ Installed cloum ${version} → ${BIN_DIR}/cloum"
    ensure_in_path
}

uninstall() {
    rm -rf "${INSTALL_DIR}"
    rm -f "${BIN_DIR}/cloum"
    echo "✓ Uninstalled cloum"
}

# ── entrypoint ─────────────────────────────────────────────────────────────────

case "${1:-install}" in
    install)   install ;;
    uninstall) uninstall ;;
    *)
        echo "Usage: $0 [install|uninstall]" >&2
        exit 1
        ;;
esac
