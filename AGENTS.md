# Purpose

Own the Defcoin DC903 explorer source and its current public-page copy.

# Ownership

- `views/` owns Pug templates; `public/` owns browser assets.
- `lib/` and `scripts/` own application and maintenance code.
- `test/` owns offline regression checks; `docs/` owns new change notes and the portable writing standard.
- Live credentials, wallet data, database exports, and deployment state stay outside Git.

# Local contracts

- Follow `docs/WRITING_STYLE.md` for new prose and edits to current page copy. Preserve existing release history, dated changelogs, and historical site records.
- Keep URLs, identifiers, versions, evidence dates, form controls, template variables, and security warnings intact during text edits.
- Keep the faucet unregistered and unavailable until a separate payout-safety review approves it.
- Invoke MongoDB backup tools through the shell-free helper. Keep passwords out of command arguments and remove the private temporary config on exit or spawn failure.
- Build immutable release archives with the operations repository's theme-CSS packaging helper. Test staging before switching production; retain the previous release for rollback.

# Work guidance

- Use small, reviewable changes. Do not restyle inherited upstream history or notices.
- Compile Pug templates and run offline tests before deployment. Public-market integration tests require external services and do not replace offline checks.

# Verification

- `git diff --check`
- `node ./node_modules/jasmine/bin/jasmine.js test/explorerSpec.js test/securitySpec.js test/copySpec.js`
- Compile every Pug template; run the operations health and web smoke checks on staging and production.
- Run dependency and secret scans before pushing.

# Child DOX Index

