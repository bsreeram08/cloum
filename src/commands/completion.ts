import { green, cyan, yellow } from "../utils/colors.ts";

const COMMANDS = [
  "connect",
  "use",
  "list",
  "status",
  "add",
  "remove",
  "import",
  "discover",
  "registry",
  "clean",
  "ai",
  "update",
  "uninstall",
  "rename",
  "describe",
  "completion",
  "help",
  "version",
];

const PROVIDERS = ["gcp", "aws", "azure"];

function cmdDescription(cmd: string): string {
  const descriptions: Record<string, string> = {
    connect: "Connect to a configured cluster",
    use: "Switch context without re-fetching credentials",
    list: "List all configured clusters",
    status: "Show cloud provider auth status",
    add: "Add a cluster to config",
    remove: "Remove a cluster from config",
    import: "Import clusters from JSON file",
    discover: "Discover clusters from cloud",
    registry: "Login to container registry",
    clean: "Clear cached sessions",
    ai: "Print AI setup prompt",
    update: "Check and install latest version",
    uninstall: "Uninstall cloum CLI",
    rename: "Rename a cluster alias",
    describe: "Show detailed info for a cluster",
    completion: "Generate shell completion script",
    help: "Show help message",
    version: "Show version",
  };
  return descriptions[cmd] ?? cmd;
}

function buildBash(): string {
  const commandList = COMMANDS.join(" ");
  const providerList = PROVIDERS.join(" ");
  return [
    "",
    "# cloum bash completion",
    "# Source this file or add to ~/.bashrc:",
    "#   source <(cloum completion bash)",
    "",
    "_cloum_complete() {",
    "  local cur prev words",
    "  COMPREPLY=()",
    '  cur="${COMP_WORDS[COMP_CWORD]}"',
    '  prev="${COMP_WORDS[COMP_CWORD-1]}"',
    '  words=("${COMP_WORDS[@]}")',
    "",
    `  local commands="${commandList}"`,
    `  local providers="${providerList}"`,
    "",
    "  if [[ ${COMP_CWORD} -eq 1 ]]; then",
    `    COMPREPLY=( $(compgen -W "${commandList}" -- "\${cur}") )`,
    "    return 0",
    "  fi",
    "",
    '  case "${words[1]}" in',
    "    connect|use|remove|describe|rename)",
    '      if [[ "${prev}" == "rename" && ${COMP_CWORD} -eq 3 ]]; then',
    "        return 0",
    "      fi",
    "      local clusters",
    "      clusters=$(cloum list --names-only 2>/dev/null)",
    '      COMPREPLY=( $(compgen -W "${clusters}" -- "${cur}") )',
    "      ;;",
    "    add|discover)",
    `      COMPREPLY=( $(compgen -W "${providerList}" -- "\${cur}") )`,
    "      ;;",
    "    registry)",
    `      COMPREPLY=( $(compgen -W "${providerList} all" -- "\${cur}") )`,
    "      ;;",
    "    clean)",
    `      COMPREPLY=( $(compgen -W "${providerList} --all" -- "\${cur}") )`,
    "      ;;",
    "    completion)",
    '      COMPREPLY=( $(compgen -W "bash zsh fish" -- "${cur}") )',
    "      ;;",
    "    list)",
    '      COMPREPLY=( $(compgen -W "--provider --names-only" -- "${cur}") )',
    "      ;;",
    "    update)",
    '      COMPREPLY=( $(compgen -W "--force" -- "${cur}") )',
    "      ;;",
    "    ai)",
    '      COMPREPLY=( $(compgen -W "--open" -- "${cur}") )',
    "      ;;",
    "  esac",
    "  return 0",
    "}",
    "",
    "complete -F _cloum_complete cloum",
    "",
  ].join("\n");
}

function buildZsh(): string {
  const cmdDescriptions = COMMANDS.map(
    (c) => `'${c}:${cmdDescription(c)}'`,
  ).join(" \\\n      ");
  return [
    "",
    "# cloum zsh completion",
    "# Add to ~/.zshrc:",
    "#   source <(cloum completion zsh)",
    "# Or place in a directory on your $fpath.",
    "",
    "_cloum() {",
    "  local state",
    "",
    "  _arguments -C \\",
    "    '1: :->command' \\",
    "    '*: :->args' && return 0",
    "",
    "  case $state in",
    "    command)",
    "      local commands",
    `      commands=(${cmdDescriptions})`,
    "      _describe 'command' commands",
    "      ;;",
    "    args)",
    "      case $words[2] in",
    "        connect|use|remove|describe)",
    "          local clusters",
    `          clusters=(\${(f)"$(cloum list --names-only 2>/dev/null)"})`,
    "          _describe 'cluster' clusters",
    "          ;;",
    "        rename)",
    "          if [[ $CURRENT -eq 3 ]]; then",
    "            local clusters",
    `            clusters=(\${(f)"$(cloum list --names-only 2>/dev/null)"})`,
    "            _describe 'cluster' clusters",
    "          fi",
    "          ;;",
    "        add|discover)",
    "          local providers",
    "          providers=(gcp aws azure)",
    "          _describe 'provider' providers",
    "          ;;",
    "        registry)",
    "          local providers",
    "          providers=(gcp aws azure all)",
    "          _describe 'provider' providers",
    "          ;;",
    "        clean)",
    "          local opts",
    "          opts=(gcp aws azure --all)",
    "          _describe 'option' opts",
    "          ;;",
    "        completion)",
    "          local shells",
    "          shells=(bash zsh fish)",
    "          _describe 'shell' shells",
    "          ;;",
    "        list)",
    "          _arguments '--provider[filter by provider]:(gcp aws azure)' '--names-only[output names only]'",
    "          ;;",
    "        update)",
    "          _arguments '--force[force reinstall]'",
    "          ;;",
    "        ai)",
    "          _arguments '--open[open in browser]'",
    "          ;;",
    "      esac",
    "      ;;",
    "  esac",
    "}",
    "",
    '_cloum "$@"',
    "",
  ].join("\n");
}

function buildFish(): string {
  const subcommandGuard = COMMANDS.join(" ");
  const fishCmds = COMMANDS.map(
    (c) =>
      `complete -c cloum -n "not __fish_seen_subcommand_from ${subcommandGuard}" -a ${c} -d "${cmdDescription(c)}"`,
  ).join("\n");
  return [
    "",
    "# cloum fish completion",
    "# Place this file at ~/.config/fish/completions/cloum.fish",
    "",
    "# Disable file completion by default",
    "complete -c cloum -f",
    "",
    "# Commands",
    fishCmds,
    "",
    "# connect / use / remove / describe — complete with cluster names",
    "for cmd in connect use remove describe",
    "  complete -c cloum -n \"__fish_seen_subcommand_from $cmd\" -a \"(cloum list --names-only 2>/dev/null)\" -d \"cluster\"",
    "end",
    "",
    "# rename — first arg is cluster name",
    "complete -c cloum -n \"__fish_seen_subcommand_from rename\" -a \"(cloum list --names-only 2>/dev/null)\" -d \"cluster\"",
    "",
    "# add / discover — providers",
    "for cmd in add discover",
    "  complete -c cloum -n \"__fish_seen_subcommand_from $cmd\" -a \"gcp aws azure\" -d \"provider\"",
    "end",
    "",
    "# registry — providers + all",
    "complete -c cloum -n \"__fish_seen_subcommand_from registry\" -a \"gcp aws azure all\" -d \"provider\"",
    "",
    "# clean — providers + --all",
    "complete -c cloum -n \"__fish_seen_subcommand_from clean\" -a \"gcp aws azure\" -d \"provider\"",
    "complete -c cloum -n \"__fish_seen_subcommand_from clean\" -l all -d \"revoke all cloud credentials\"",
    "",
    "# completion — shells",
    "complete -c cloum -n \"__fish_seen_subcommand_from completion\" -a \"bash zsh fish\" -d \"shell\"",
    "",
    "# list flags",
    "complete -c cloum -n \"__fish_seen_subcommand_from list\" -l provider -d \"filter by provider\" -r -a \"gcp aws azure\"",
    "complete -c cloum -n \"__fish_seen_subcommand_from list\" -l names-only -d \"output names only\"",
    "",
    "# update flags",
    "complete -c cloum -n \"__fish_seen_subcommand_from update\" -l force -d \"force reinstall\"",
    "",
    "# ai flags",
    "complete -c cloum -n \"__fish_seen_subcommand_from ai\" -l open -d \"open in browser\"",
    "",
    "# connect flags",
    "complete -c cloum -n \"__fish_seen_subcommand_from connect\" -l namespace -d \"set kubectl namespace\" -r",
    "",
  ].join("\n");
}

export type Shell = "bash" | "zsh" | "fish";

/** Generate and print shell completion script */
export async function completionCommand(shell?: string): Promise<void> {
  const supported: Shell[] = ["bash", "zsh", "fish"];

  if (!shell || !supported.includes(shell as Shell)) {
    console.log(cyan(`\n🔧 Shell Completion Setup\n`));
    console.log(`Usage: cloum completion <shell>\n`);
    console.log(`Supported shells: ${supported.join(", ")}\n`);
    console.log(`Examples:`);
    console.log(yellow(`  # Bash — add to ~/.bashrc:`));
    console.log(`  source <(cloum completion bash)\n`);
    console.log(yellow(`  # Zsh — add to ~/.zshrc:`));
    console.log(`  source <(cloum completion zsh)\n`);
    console.log(yellow(`  # Fish — install once:`));
    console.log(
      `  cloum completion fish > ~/.config/fish/completions/cloum.fish\n`,
    );
    return;
  }

  switch (shell as Shell) {
    case "bash":
      process.stdout.write(buildBash());
      break;
    case "zsh":
      process.stdout.write(buildZsh());
      break;
    case "fish":
      process.stdout.write(buildFish());
      break;
  }

  if (process.stdout.isTTY) {
    // Only show the tip when output is a terminal (not piped)
    console.error(green(`\n✅ Completion script generated for ${shell}.`));
    if (shell === "bash") {
      console.error(
        yellow(`   Add to ~/.bashrc: source <(cloum completion bash)`),
      );
    } else if (shell === "zsh") {
      console.error(
        yellow(`   Add to ~/.zshrc:  source <(cloum completion zsh)`),
      );
    } else if (shell === "fish") {
      console.error(
        yellow(
          `   Or run: cloum completion fish > ~/.config/fish/completions/cloum.fish`,
        ),
      );
    }
  }
}
