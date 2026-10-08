'use strict';

// Public, dated evidence only. No credentials, peer identities or private paths.
module.exports = {
  reviewedOn: '2026-10-08',
  title: 'Security & code-quality addendum',
  summary: 'The DC903 migration, source repairs, and security review used model-assisted analysis, deterministic tests, signed package checks, and staged deployment. This report separates completed work from incomplete audits and remaining risks. It is not a penetration-test certification or a guarantee that malicious code is absent.',
  sections: [
    {
      id: 'models',
      title: 'Models and audit provenance',
      paragraphs: [
        'Daybreak Blue (gpt-daybreak-blue-latest) is recorded in the October 8 audit sessions from 08:44 through 12:05 UTC. That phase investigated the Nu link failure, audited the explorer source, repaired its MongoDB maintenance boundary, and checked the migrated host. The sealed explorer scan ran from 08:47 to 10:13 UTC against revision 03b31bb9cae1e7e8bfce78d6ff47e8f31c47c5d3; scan ID 66593ef5-0f96-460b-86e1-9f3809be43a3.',
        'GPT-6.1 Sol (gpt-6.1-sol) is recorded in the later October 8 writing-guide audits, source-backed history revision, additional regression tests, QR repair, UI checks, and deployment work. GPT-5.6 Sol (gpt-5.6-sol) is recorded in the September 4–6 migration, Ubuntu Pro/AIDE acceptance, and offline advisory-archive work.',
        'These were successive phases of one operator-directed workflow, not an independent multi-model certification. No independent reviewer participated in the current writing-guide audits. Recorded model use does not establish that a result is correct; the checks and limits below are the evidence.'
      ]
    },
    {
      id: 'audits',
      title: 'Source and supply-chain audits',
      items: [
        'The completed October explorer audit covered request/route handling, template and browser output, database/RPC boundaries, and operator scripts, plus package locks and bounded live-response checks. It reported one medium-severity, high-confidence local credential-exposure finding. No source area was deferred in that scan.',
        'Earlier September repository-wide deep scans for eIquidus and P2Pool stopped when the scan allowance was exhausted. They produced no sealed final report. Their provisional discovery counts are not validated vulnerabilities and do not substitute for a completed deep scan.',
        'The OpenFixes MongoDB installer was inspected at commit 04db645f632e36db40594cc692f116f344376b14 and rejected for production: unsafe eval/input handling, unpinned packages, missing signing-fingerprint enforcement, overwritten service overrides, and incomplete rollback. No deliberate exfiltration was established. The installer was not run.',
        'All four requested writing guides were pinned and reviewed as untrusted source material. Instruction entry points, scripts, and workflows were read; generated evaluation archives in the first three were pattern-searched, not audited line by line. All six tracked files in the fourth were read. Their installers and model-evaluation scripts were not executed. No confirmed malicious behavior was found in that reviewed scope.',
        'Guide text claiming system-level authority, requiring invented anecdotes, or imposing arbitrary prose shapes was not adopted. One optional installer advertises telemetry; it was not installed. External npx packages and GitHub Action implementations were outside the guide-source audits.',
        'Production npm advisory checks and Gitleaks secret scans passed in the recorded release checks. The preserved September 5 OSV database is an immutable historical checkpoint, not a current advisory feed or evidence that every dependency is safe.'
      ],
      sources: [
        { label: 'Reviewed writing-guide revisions and audit scope', url: 'https://github.com/turnkit/defcoin-eiquidus/blob/main/docs/WRITING_GUIDE_AUDIT_2026-10-08.md' }
      ]
    },
    {
      id: 'repairs',
      title: 'Code changes that reduced risk',
      items: [
        'MongoDB backup/restore now invokes an allowlisted executable with a separate argument vector instead of a shell command. Reusable passwords are kept out of process arguments, placed in an owner-only temporary configuration, and removed on exit or spawn failure. Tests cover metacharacters, Unicode, quoting, permissions, and cleanup.',
        'The migrated explorer retains bounded request/response handling, trusted-proxy checks, escaped HTML and script serialization, timed remote calls, direct daemon RPC, and startup rejection of production placeholder credentials. Public mining-stat requests remain read-only; sampler election and chart bounds limit write amplification and response size.',
        'P2Pool hardening bounds Stratum/HTTP/RPC/peer input and connection state, checks the native scrypt input is exactly 80 bytes, and preserves observed plaintext miner behavior. September local records include 101 focused tests and 700 simulated mining operations. Those counts are historical test evidence, not a claim that every miner or native dependency was audited.',
        'The public mining daemon remains compile-time walletless. A separate, normally stopped wallet-backup sidecar is a design artifact, not an activated wallet service. The faucet remains unregistered; its latent payout code has unresolved safety work and must not be enabled by a cosmetic change.',
        'Paper-wallet generation retains the fail-closed Web Crypto requirement and offline/private-key warnings. This pass did not certify the wallet generator or perform a full cryptographic audit.',
        'The QR generator now targets the actual qrcode container and uses the bundled browser-side encoder. Six tests cover payload encoding, blank/reset clearing, failure recovery, and copying. Browser checks verified an image and the expected payment URI. QR generation does not send a payment or use an external QR service.'
      ],
      sources: [
        { label: 'MongoDB helper remediation', url: 'https://github.com/turnkit/defcoin-eiquidus/pull/1' },
        { label: 'QR repair and regression tests', url: 'https://github.com/turnkit/defcoin-eiquidus/pull/3' }
      ]
    },
    {
      id: 'host',
      title: 'Host survey and hardening',
      items: [
        'The October 8 acceptance checked Ubuntu 24.04, the running kernel, pending upgrades/reboot state, signed package provenance, Ubuntu Pro ESM Apps/Infra, Livepatch, and unattended-upgrade timers. That snapshot had no pending apt upgrades or currently fixable Pro CVEs. This is dated evidence, not a permanent clean bill of health.',
        'SSH is key-only; password and keyboard-interactive authentication and X11 forwarding are disabled, and authentication attempts are limited. UFW, Fail2ban, and auditd are active. MongoDB, application backends, and administrative RPC listeners remain loopback-only. Public miner, P2P, DNS-seed, and fast-sync protocols were checked after hardening.',
        'AIDE monitors persistent boot/configuration, executable/library, package-metadata, scheduled-job, deployed-code, and administrative-access paths. Mutable chain/database/log/backup trees are excluded from noisy file hashing and checked through service-aware gates. Persistent children retain hashes, types, ownership, modes, links, and extended attributes; only proven volatile directory attributes and fixed transient markers are suppressed.',
        'Daily focused and weekly full integrity timers are enabled. Failures create root-owned alert markers and dedicated logs, with a passive SSH-login notice. AIDE is tamper detection, not a stealth agent: a privileged attacker may alter the local checker or alerts. There is no claim of external, tamper-resistant alert delivery.',
        'Baseline differences were investigated against authorized package, certificate, and deployment activity before acceptance. New release baselines are restricted to approved deployment paths; unrelated baseline records are independently compared byte for byte. Previous baselines and releases remain available for review and rollback.',
        'HTTP checks covered HSTS, nosniff, referrer/permissions policies, framing restrictions, and CSP. Secret/configuration probes returned 404. TLS renewal was tested with Certbot dry runs. Legacy inline script/style and selected CDNs still constrain the CSP; nonce/hash-based removal of unsafe-inline remains follow-up work.'
      ]
    },
    {
      id: 'cves',
      title: 'CVE inventory and open work',
      paragraphs: [
        'The October 8 Pro inventory contained 78,219 package-CVE rows, 205 installed package names, and 4,376 unique CVE identifiers. Rows include repeated kernel/header/tool records; these are not 4,376 demonstrated reachable vulnerabilities.',
        'The critical subset reduced to five kernel CVEs associated with NFSD, AMD KVM/SEV, NVMe/TCP target, SCTP, and RDMA SRP target. The checked host did not use or load those facilities. Their modules are blocked by both blacklist and install-denial policy, and initramfs images were regenerated. Mitigation is not a patch; vendor fixes must still be applied when available.'
      ],
      items: [
        'Recheck newly fixable advisories and install supported vendor updates; refresh the inventory after kernel, MongoDB, Node.js, or other exposed-runtime changes.',
        'Review unused development packages and old kernels without discarding rollback options or removing dependencies blindly.',
        'Finish the legacy inline/CDN CSP refactor and obtain an independent security review. Earlier incomplete deep scans remain a coverage gap.',
        'The pool Recent Blocks widget uses a transaction feed and can repeat heights. Its label/pagination semantics need a separate data-contract repair; CSS repair alone does not solve that mismatch.',
        'The Nu source fix remains an upstream-maintainer merge gate. Windows and a new public Nu binary release were not revalidated or published in this pass.'
      ]
    },
    {
      id: 'quality',
      title: 'Tests, deployment, and AI-code quality',
      paragraphs: [
        'The reported Nu bug was a release blocker: two declared NuRpcService methods had no definitions, so public-source builds could compile but fail at the final link. Existing installed binaries were unaffected. The fix supplies the methods; clean Linux and macOS links were recorded, and 14 later isolated Qt/SQLite runtime checks exercise the actual method bodies, escaping, SQL values, failures, and connection cleanup.',
        'At QR revision fb5575df, 71 focused offline explorer/security/copy/history/browser-tool tests passed. The full suite ran 78 tests with two unchanged Dexomy/Dextrade external-provider failures. Those failures are disclosed, not counted as passes. The subsequent UI/addendum checks and deployment results are recorded in the current change notes.',
        'The broken pool layout was a packaging defect: ignored/generated theme CSS was absent from a bare Git archive. Release packaging now builds and verifies those assets, creates a service-readable archive root, rejects macOS metadata sidecars, and tests the extracted candidate before activation.',
        'Releases are staged, checked with real page/assets/data requests, activated through an atomic release link, and retained for rollback. Public service, chain-peer, P2Pool, Stratum, route, and security-header checks run after activation. A quiet sole miner is not treated as a failure when those protocol checks are healthy.'
      ],
      items: [
        'AI-generated code is treated as untrusted until reviewed and exercised. Source revisions, specific regressions, secret/dependency scans, deployment checks, and limitations are recorded. Tests do not replace an independent review or prove the absence of a backdoor.',
        'Current prose uses primary sources and preserves raw archive evidence, unknown dates, warnings, and release notes. The style rules prohibit invented anecdotes, unsupported certainty, promotional filler, and cosmetic rewriting of historical release records.',
        'UI changes retain Defcoin’s dark/gold/cyan identity and existing tool controls. The history uses a real dated source rail, readable line lengths, semantic headings, keyboard focus, and locally scrollable evidence tables. No new font, analytics, remote QR endpoint, or application dependency was added.',
        'The design rationale cites USWDS typography and W3C guidance for contrast, reflow, focus, and target size. Browser and contrast checks cover the changed surfaces; they are not a whole-site WCAG certification or a user study.'
      ],
      sources: [
        { label: 'Nu source repair and verification', url: 'https://github.com/defcoincore/Defcoin-Core-Nu/pull/2' },
        { label: 'Current change notes and verification', url: 'https://github.com/turnkit/defcoin-eiquidus/blob/main/docs/change-log-2026-10-08.md' },
        { label: 'Design rationale and token contract', url: 'https://github.com/turnkit/defcoin-eiquidus/blob/main/DESIGN.md' }
      ]
    },
    {
      id: 'limits',
      title: 'Limits of this report',
      paragraphs: [
        'This is an operator-authorized defensive review and dated implementation record. It did not include destructive production payloads, credential guessing, a broad port scan, denial-of-service testing, every transitive dependency’s source, every historical miner, or an independent penetration test. No confidential keys, wallet material, credentials, raw production records, or private peer identities are published here.',
        '“No confirmed finding” means none was validated in the stated scope. It does not mean no vulnerability or malicious code exists. AIDE and update automation reduce risk only while their checks, alerts, advisories, and baselines continue to be reviewed.'
      ]
    }
  ]
};
