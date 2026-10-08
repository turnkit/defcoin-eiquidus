# Purpose

Own the Defcoin DC903 explorer source and its current public-page copy.

# Ownership

- `views/` owns Pug templates; `public/` owns browser assets.
- `lib/` and `scripts/` own application and maintenance code.
- `test/` owns offline regression checks; `docs/` owns new change notes and the portable writing standard.
- Live credentials, wallet data, database exports, and deployment state stay outside Git.

# Local contracts

- Follow `docs/WRITING_STYLE.md` for new prose and edits to current page copy, including community history. Preserve existing release notes and dated changelogs.
- Cite primary sources for historical claims. Keep archive capture dates distinct from launch, shutdown, and continuous-uptime claims. Record a research date separately from each endpoint's last live check.
- Keep URLs, identifiers, versions, evidence dates, form controls, template variables, and security warnings intact during text edits.
- Keep the faucet unregistered and unavailable until a separate payout-safety review approves it.
- Generate payment QR images in the browser using the bundled QR library and the template's `qrcode` container. Do not send payment labels or messages to an external QR service. Clear stale previews when the address is empty and show a recoverable message if encoding fails.
- Invoke MongoDB backup tools through the shell-free helper. Keep passwords out of command arguments and remove the private temporary config on exit or spawn failure.
- Build immutable release archives with the operations repository's theme-CSS packaging helper. Test staging before switching production; retain the previous release for rollback.

# Work guidance

- Use small, reviewable changes. Do not restyle inherited upstream history or notices.
- Compile Pug templates and run offline tests before deployment. Public-market integration tests require external services and do not replace offline checks.

# Verification

- `git diff --check`
- `node ./node_modules/jasmine/bin/jasmine.js test/explorerSpec.js test/securitySpec.js test/copySpec.js test/historySpec.js test/browserToolsSpec.js`
- Compile every Pug template; run the operations health and web smoke checks on staging and production.
- Run dependency and secret scans before pushing.

# Child DOX Index
