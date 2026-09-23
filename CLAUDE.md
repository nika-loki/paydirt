# Working on this repo

This repository builds the **gtm-sandbox** plugin (skill + slash commands + scripts + templates). Read `CONTRIBUTING.md` before changing anything; the essentials:

- Source of truth is `plugins/gtm-sandbox/skills/gtm-sandbox/` — never duplicate skill content per tool; manifests in `.claude-plugin/` and `.zcode-plugin/` share it.
- **Never print, log, commit, or paste secret values anywhere.** Examples use `replace-me`-style placeholders only. No `.env*` file is ever committed.
- Shell scripts target bash 3.2 (macOS default): no `mapfile`, no associative arrays, no GNU-only flags (`diff -r`, not `-R`).
- Tests are offline (mock `gh`, fake `$HOME`): `for t in tests/*.sh; do bash "$t"; done` must pass before every commit.
- Version bumps update both plugin manifests and all three marketplace catalogs in lockstep, plus a `CHANGELOG.md` entry.
