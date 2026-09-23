#!/usr/bin/env bash
# install.sh — install the gtm-sandbox Agent Skill into any compatible coding agent.
#
# The skill (SKILL.md + references + scripts + assets) follows the open Agent
# Skills format (https://agentskills.io) supported by Claude Code, Codex,
# Gemini CLI, Cursor, ZCode and others. The format is universal; only the
# discovery path differs per tool — so this script copies the skill into each
# tool's skills directory.
#
# Marketplace/plugin installs additionally provide the /sandbox-init and
# /secrets-sync commands in tools that support plugins (Claude Code, ZCode).
# See README.md for both paths.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
SKILL_NAME="gtm-sandbox"
SKILL_SRC="$REPO_ROOT/plugins/gtm-sandbox/skills/$SKILL_NAME"

[ -d "$SKILL_SRC" ] || { echo "error: skill source not found at $SKILL_SRC" >&2; exit 1; }

tilde() { # $1 = path; print with ~ prefix when under $HOME (bash 3.2-safe)
  case "$1" in
    "$HOME"*) printf '~%s' "${1#"$HOME"}" ;;
    *)        printf '%s' "$1" ;;
  esac
}

usage() {
  cat <<EOF
Usage: ./install.sh [options]

Options:
  --tool LIST   Comma-separated tool names to install for (see --list)
  --all         Install for every known tool, detected or not
  --list        Show known tools and their skill directories, then exit
  --remove      Remove the skill from targets instead of installing
  -h, --help    Show this help

Without --tool/--all: installs for every detected tool (skill directory
already exists), always including the cross-tool default ~/.agents/skills.
EOF
}

MODE="install"
WANT=""
ALL=0
while [ $# -gt 0 ]; do
  case "$1" in
    --tool)   [ $# -ge 2 ] || { echo "--tool needs a value" >&2; exit 1; }; WANT="$WANT $2"; shift ;;
    --all)    ALL=1 ;;
    --list)   MODE="list" ;;
    --remove) MODE="remove" ;;
    -h|--help) usage; exit 0 ;;
    *)        usage >&2; echo "unknown option: $1" >&2; exit 1 ;;
  esac
  shift
done
# Normalize "a,b" into "a b" for exact word matching below.
WANT="$(printf '%s' "$WANT" | tr ',' ' ')"

# tool|skill directory (under $HOME)
TOOLS="agents|$HOME/.agents/skills
claude|$HOME/.claude/skills
codex|$HOME/.codex/skills
zcode|$HOME/.zcode/skills
cursor|$HOME/.cursor/skills
gemini|$HOME/.gemini/skills"

if [ "$MODE" = "list" ]; then
  printf '%-8s %-30s %s\n' "TOOL" "SKILL DIRECTORY" "DETECTED"
  printf '%s\n' "------------------------------------------------------------------"
  printf '%s\n' "$TOOLS" | while IFS='|' read -r tool dir; do
    if [ -d "$dir" ]; then det="yes"; else det="no"; fi
    printf '%-8s %-30s %s\n' "$tool" "$(tilde "$dir")" "$det"
  done
  exit 0
fi

# Exact string comparison only — tool names are never used as glob/regex patterns.
TOOL_NAMES="agents claude codex zcode cursor gemini"
is_known_tool() { # $1 = candidate name
  local n
  for n in $TOOL_NAMES; do
    [ "$n" = "$1" ] && return 0
  done
  return 1
}

wants_tool() { # $1 = tool name; exact match against the parsed --tool list
  local item
  for item in $WANT; do
    [ "$item" = "$1" ] && return 0
  done
  return 1
}

# Validate explicit tool names before touching anything.
if [ -n "$WANT" ]; then
  for w in $WANT; do
    is_known_tool "$w" || { echo "error: unknown tool '$w' (see ./install.sh --list)" >&2; exit 1; }
  done
fi

selected() { # selected <tool> <dir>: 0 = act on this target
  [ "$ALL" -eq 1 ] && return 0
  if [ -n "$WANT" ]; then
    wants_tool "$1" && return 0
    return 1
  fi
  [ "$1" = "agents" ] && return 0
  [ -d "$2" ]
}

# Guarded removal: only ever deletes <tool-skills-dir>/gtm-sandbox — a fixed
# name directly under a known directory, never a symlink, never a parent.
remove_skill_dir() { # $1 = dest path, $2 = tool skills dir
  local dest="$1" dir="$2"
  [ -d "$dest" ] || return 0
  if [ -L "$dest" ] || [ "$(basename "$dest")" != "$SKILL_NAME" ] || [ "$(dirname "$dest")" != "$dir" ]; then
    echo "error: refusing to remove unexpected path: $dest" >&2
    exit 1
  fi
  rm -rf -- "$dest"
}

printf '%s\n' "$TOOLS" | while IFS='|' read -r tool dir; do
  selected "$tool" "$dir" || continue
  dest="$dir/$SKILL_NAME"
  if [ "$MODE" = "remove" ]; then
    if [ -d "$dest" ]; then
      remove_skill_dir "$dest" "$dir"
      printf 'removed:   %s/%s (%s)\n' "$(tilde "$dir")" "$SKILL_NAME" "$tool"
    else
      printf 'absent:    %s/%s (%s)\n' "$(tilde "$dir")" "$SKILL_NAME" "$tool"
    fi
  else
    mkdir -p "$dir"
    remove_skill_dir "$dest" "$dir"
    cp -R "$SKILL_SRC" "$dest"
    chmod +x "$dest/scripts/sync-secrets.sh" "$dest/assets/hooks/pre-commit"
    printf 'installed: %s/%s (%s)\n' "$(tilde "$dir")" "$SKILL_NAME" "$tool"
  fi
done

if [ "$MODE" = "install" ]; then
  printf '\nSkill installed. Re-run with --list to see targets.\n'
  printf 'For the /sandbox-init and /secrets-sync commands, install as a plugin (README.md).\n'
fi
