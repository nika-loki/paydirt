# Changelog

All notable changes to GTM Sandbox are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning is semantic.

## [0.4.0] — 2026-09-23

### Changed

- Brand rename: the repo and marketplace are now **paydirt** (formerly `sandbox-bootstrap`). Install path changes to `/plugin marketplace add nika-loki/paydirt` + `/plugin install gtm-sandbox@paydirt`; the plugin itself keeps the name `gtm-sandbox`.
- All three marketplace catalogs renamed to `paydirt` in lockstep with both plugin manifests (version 0.4.0).
- README/CONTRIBUTING badges and clone URLs point at `nika-loki/paydirt`.

### Decided

- Positioning per the design spec (`docs/superpowers/specs/2026-09-23-paydirt-monorepo-design.md`): paydirt becomes a governed go-to-market systems monorepo — plugin marketplace + deployable Vercel Workflow scenarios + connector substrate. This release ships the rename; the monorepo restructure follows as 0.5.0.

## [0.3.0] — 2026-09-23

### Added

- Owner→developer secrets delegation model: `references/team-access.md` — roles, the "use without seeing" permission mapping, owner and developer checklists.
- `/sandbox-join` command: developer onboarding for an existing sandbox (clone, access recon, first development dispatch, what-to-request summary).
- CI workflow running the offline test suites and manifest validation on Linux and macOS.
- Repository hygiene: `SECURITY.md`, `CONTRIBUTING.md`, this changelog, issue/PR templates, `CLAUDE.md`/`AGENTS.md` entry files for agents working on this repo.
- README rebuilt: trust model first, badges, supported-tools table, per-tool install, owner/developer quick starts, comparison table, FAQ.

### Decided

- GTM positioning retained (pilot-to-production for GTM automations as the wedge).
- License stays MIT.

## [0.2.0] — 2026-09-23

### Added

- Universal packaging: `.claude-plugin/` manifests and marketplace catalog for Claude Code alongside the existing ZCode ones, over the same shared `skills/` and `commands/` directories.
- `install.sh`: installs the skill into any Agent-Skills-compatible tool (`agents`, `claude`, `codex`, `zcode`, `cursor`, `gemini`) with guarded removal and exact-name input matching.
- Offline installer test suite (fake `$HOME`).
- SKILL.md documents the manual scaffold path for tools without slash commands.

## [0.1.0] — 2026-09-23

### Added

- Initial release: `gtm-sandbox` skill (operating model, secrets lifecycle, promotion, sandboxing references).
- `sync-secrets.sh` with `--dry-run` (names-only diff), `--prune` (interactive deletion), environment auto-create, placeholder-value warnings; values never printed.
- `/sandbox-init` and `/secrets-sync` commands; GitHub Actions workflow template; `.gitignore` guard and pre-commit hook.
- Offline test suite against a mock `gh` (17 checks).
