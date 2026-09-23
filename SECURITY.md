# Security Policy

GTM Sandbox is a secrets *workflow* tool. By design it never transmits, displays, or stores credential values anywhere except: (a) the owner's local `.env.*` files, and (b) GitHub's encrypted environment secrets via the `gh` CLI. If you find a case where this tool leaks, logs, or commits a value, that is a security report, not a bug report.

## Supported versions

Only the latest release line receives security fixes.

## Reporting a vulnerability

Please use GitHub's **private vulnerability reporting** on this repository (Security → Report a vulnerability). Include:

- What you expected vs. what happened
- The minimal `.env.*` content shape (use `KEY=redacted` — **never paste real values into a report**)
- Logs with any values redacted

You should receive a response within a few days. Please do not open a public issue for anything security-related.

## Scope

In scope:

- Any path where a secret value could reach stdout/stderr, git, CI logs, or agent context
- The pre-commit guard failing to block `.env*` staging
- The sync script or installer executing unvalidated input
- Marketplace/manifest trickery in this repository (e.g. path escape in `source`)

Out of scope:

- GitHub's own secret storage and environment protection rules
- Credential values already exposed by user action elsewhere (rotate them with the vendor)
- Social-engineering an owner into pasting a value into chat (the docs prohibit it; the tool cannot prevent it)
