#!/usr/bin/env bash
# sync-secrets.sh — sync local .env.<environment> files to GitHub environment secrets.
#
# Invariants:
#   - .env.* files are never committed; this script only reads them locally.
#   - Secret VALUES are never printed or logged — only key names appear in output.
#
# Requires bash 3.2+ and the gh CLI (https://cli.github.com). See --help for usage.
set -euo pipefail

SCRIPT_NAME="${0##*/}"
APP="actions"
REPO_FLAG=""
DRY_RUN=0
PRUNE=0
ASSUME_YES=0
ENVS=""

usage() {
  cat <<EOF
Usage: ${SCRIPT_NAME} [options] [environment ...]

Sync local .env.<environment> files to GitHub environment secrets (gh CLI).
Default environments: development pilot production
Override with positional arguments or the GTM_ENVS variable.

Options:
  -n, --dry-run     Show what would change (key names only; reads remote names)
  -p, --prune       Also delete remote secrets missing from the local file
  -e, --env NAME    Sync only this environment (repeatable)
  -R, --repo SLUG   Target OWNER/REPO explicitly (default: repo in cwd)
  -a, --app APP     Secret app: actions (default) or codespaces
  -y, --yes         Skip the confirmation prompt when pruning
  -h, --help        Show this help

Examples:
  ${SCRIPT_NAME} --dry-run
  ${SCRIPT_NAME} --env pilot
  ${SCRIPT_NAME} --prune --yes production

Env file format: KEY=value per line; blank lines and #-comments ignored;
an optional "export " prefix is tolerated. Values are passed to gh as-is
(no shell expansion); multiline values are not supported.
EOF
}

log()  { printf '%s\n' "$*"; }
warn() { printf 'warning: %s\n' "$*" >&2; }
die()  { printf 'error: %s\n' "$*" >&2; exit 1; }

while [ $# -gt 0 ]; do
  case "$1" in
    -n|--dry-run) DRY_RUN=1 ;;
    -p|--prune)   PRUNE=1 ;;
    -y|--yes)     ASSUME_YES=1 ;;
    -e|--env)     [ $# -ge 2 ] || die "--env needs a value"; ENVS="$ENVS $2"; shift ;;
    -R|--repo)    [ $# -ge 2 ] || die "--repo needs a value"; REPO_FLAG="-R $2"; shift ;;
    -a|--app)     [ $# -ge 2 ] || die "--app needs a value"; APP="$2"; shift ;;
    -h|--help)    usage; exit 0 ;;
    -*)           usage >&2; die "unknown option: $1" ;;
    *)            ENVS="$ENVS $1" ;;
  esac
  shift
done

command -v gh >/dev/null 2>&1 || die "gh CLI not found — install from https://cli.github.com"
[ -n "$ENVS" ] || ENVS="${GTM_ENVS:-development pilot production}"
# shellcheck disable=SC2086
set -- $ENVS

# Run gh with an optional -R flag. The flag goes last; gh accepts global flags anywhere.
run_gh() {
  if [ -n "$REPO_FLAG" ]; then
    # shellcheck disable=SC2086
    gh "$@" $REPO_FLAG
  else
    gh "$@"
  fi
}

# Key names only — values never pass through this script's output.
env_keys() {
  grep -E '^[[:space:]]*(export[[:space:]]+)?[A-Za-z_][A-Za-z0-9_]*=' "$1" \
    | sed -E 's/^[[:space:]]*(export[[:space:]]+)?//; s/=.*$//' | sort -u
}

key_count() { env_keys "$1" | grep -c . || true; }

# Names of secrets currently on GitHub for the environment; empty on failure or none.
remote_keys() {
  run_gh secret list --env "$1" --app "$APP" --json name --jq '.[].name' 2>/dev/null | sort -u || true
}

# exists | missing | unknown (unknown = no repo access at all)
environment_state() {
  if run_gh api --silent "repos/{owner}/{repo}/environments/$1" >/dev/null 2>&1; then
    echo exists
  elif run_gh repo view --json nameWithOwner >/dev/null 2>&1; then
    echo missing
  else
    echo unknown
  fi
}

ensure_environment() {
  local state
  state="$(environment_state "$1")"
  if [ "$state" = "exists" ]; then
    return 0
  fi
  if [ "$state" = "unknown" ]; then
    if [ "$DRY_RUN" -eq 1 ]; then
      warn "cannot verify environment '$1' (no repo access)"
      return 0
    fi
    die "no repo access — cannot create environment '$1'"
  fi
  if [ "$DRY_RUN" -eq 1 ]; then
    log "  environment '$1' does not exist (would be created)"
    return 0
  fi
  run_gh api --silent -X PUT "repos/{owner}/{repo}/environments/$1" >/dev/null \
    || die "could not create environment '$1' (requires repo admin)"
  log "  created environment '$1'"
}

warn_placeholders() {
  local hits
  hits="$(grep -Ei '=(replace-me|changeme|change-me|placeholder|example-key|xxx+)([[:space:]]|$)' "$1" | sed -E 's/=.*$//' || true)"
  if [ -n "$hits" ]; then
    warn "$(printf '%s\n' "$hits" | tr '\n' ' ')still hold placeholder values — fine for development, not for pilot/production"
  fi
}

dry_run_env() { # $1 = environment, $2 = file
  local env="$1" file="$2" state remote new upd dead n
  warn_placeholders "$file"
  state="$(environment_state "$env")"
  if [ "$state" = "missing" ]; then
    log "  environment '$env' does not exist (would be created)"
  elif [ "$state" = "unknown" ]; then
    warn "cannot verify environment '$env' (no repo access)"
  fi
  n="$(key_count "$file")"
  remote=""
  if [ "$state" = "exists" ]; then
    remote="$(remote_keys "$env")"
  fi
  if [ -n "$remote" ]; then
    new="$(comm -23 <(env_keys "$file") <(printf '%s\n' "$remote"))"
    upd="$(comm -12 <(env_keys "$file") <(printf '%s\n' "$remote"))"
    if [ -n "$new" ]; then
      log "  would set $n secrets — new: $(printf '%s\n' "$new" | tr '\n' ' ')"
    else
      log "  would set $n secrets (all updates, nothing new)"
    fi
    if [ -n "$upd" ]; then
      log "  update in place: $(printf '%s\n' "$upd" | tr '\n' ' ')"
    fi
    dead="$(comm -13 <(env_keys "$file") <(printf '%s\n' "$remote"))"
    if [ "$PRUNE" -eq 1 ]; then
      if [ -n "$dead" ]; then
        log "  would prune: $(printf '%s' "$dead" | tr '\n' ' ')"
      else
        log "  nothing to prune"
      fi
    fi
  else
    log "  would set $n secrets: $(env_keys "$file" | tr '\n' ' ')"
  fi
}

sync_env() { # $1 = environment, $2 = file
  local env="$1" file="$2" remote dead reply
  ensure_environment "$env"
  warn_placeholders "$file"
  log "  syncing $(key_count "$file") secrets from $file to environment '$env'..."
  run_gh secret set --env-file "$file" --env "$env" --app "$APP"
  log "  synced."
  if [ "$PRUNE" -eq 1 ]; then
    remote="$(remote_keys "$env")"
    if [ -z "$remote" ]; then
      log "  nothing to prune (no remote secrets listed)"
      return 0
    fi
    dead="$(comm -13 <(env_keys "$file") <(printf '%s\n' "$remote"))"
    if [ -z "$dead" ]; then
      log "  nothing to prune"
      return 0
    fi
    if [ "$ASSUME_YES" -ne 1 ]; then
      printf '  prune these from "%s"? %s\n' "$env" "$(printf '%s' "$dead" | tr '\n' ' ')"
      read -r -p "  type yes to confirm: " reply
      if [ "$reply" != "yes" ]; then
        log "  skipped pruning for '$env'"
        return 0
      fi
    fi
    for k in $dead; do
      run_gh secret delete "$k" --env "$env" --app "$APP"
      log "  deleted $k"
    done
  fi
}

for env in "$@"; do
  file=".env.$env"
  log "== $env ($file) =="
  if [ ! -f "$file" ]; then
    log "  skipped: $file not found"
    continue
  fi
  if [ "$(key_count "$file")" -eq 0 ]; then
    warn "no KEY=value lines in $file — skipped"
    continue
  fi
  if [ "$DRY_RUN" -eq 1 ]; then
    dry_run_env "$env" "$file"
  else
    sync_env "$env" "$file"
  fi
done

log "done."
