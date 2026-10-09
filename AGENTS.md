# Purpose

Own the Defcoin DC903 explorer source and its current public-page copy.

# Ownership

- `views/` owns Pug templates; `public/` owns browser assets.
- `lib/` and `scripts/` own application and maintenance code.
- `test/` owns offline regression checks; `docs/` owns new change notes, guide-audit provenance, and the portable writing standard.
- `DESIGN.md` mirrors canonical runtime tokens; `UX-CONTRACT.md` owns public reading/navigation behavior and the current polish scope.
- Live credentials, wallet data, database exports, and deployment state stay outside Git.

# Local contracts

- Follow `docs/WRITING_STYLE.md` for new prose and edits to current page copy, including community history. Preserve existing release notes and dated changelogs.
- Cite primary sources for historical claims. Keep archive capture dates distinct from launch, shutdown, and continuous-uptime claims. Record copy revision, research, and endpoint-check dates separately; a copy edit must retain the recorded service-check dates.
- Keep the public security addendum dated and linked near the top. Name models only from execution records; separate completed scans, provisional inventory, mitigations, tests, and unverified claims. Publish no credentials, private paths, peer identities, or raw production records.
- Preserve the existing Defcoin visual identity and tool behavior during polish. Shared focus/scrollbar tokens live in the integrated stylesheet; use readable prose and named, keyboard-scrollable evidence regions. No new payment or wallet workflow is authorized by visual work.
- Keep URLs, identifiers, versions, evidence dates, form controls, template variables, and security warnings intact during text edits.
- Keep the faucet unregistered and unavailable until a separate payout-safety review approves it.
- Generate payment QR images in the browser using the bundled QR library and the template's `qrcode` container. Do not send payment labels or messages to an external QR service. Clear stale previews when the address is empty and show a recoverable message if encoding fails.
- Invoke MongoDB backup tools through the shell-free helper. Keep passwords out of command arguments and remove the private temporary config on exit or spawn failure.
- Build immutable release archives with the operations repository's theme-CSS packaging helper. Test staging before switching production; retain the previous release for rollback.

# Work guidance

- Use small, reviewable changes. Do not restyle inherited upstream history or notices.
- Compile Pug templates and run offline tests before deployment. Public-market integration tests require external services and do not replace offline checks.
- Keep history-copy regressions for negative parallelism, relative dates, and actionable table hints alongside the source-evidence checks. Preserve known facts and unknowns when rewriting a qualification.

# Verification

- `git diff --check`
- `node ./node_modules/jasmine/bin/jasmine.js test/explorerSpec.js test/securitySpec.js test/copySpec.js test/historySpec.js test/browserToolsSpec.js test/uiPolishSpec.js`
- Run the scoped strict premium audit, official `DESIGN.md` lint, and runtime token/contrast checks after UI changes. Its CSS audit does not replace Pug render tests or browser verification.
- Compile every Pug template; run the operations health and web smoke checks on staging and production.
- Run dependency and secret scans before pushing.

# Child DOX Index
