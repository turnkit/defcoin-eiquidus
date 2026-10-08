# Writing-guide audit, 8 October 2026

Public addendum: [Security and code-quality review](https://defcoin.dc903.org/explorer/security-review).

Read-only reviews used GPT-6.1 Sol, sequentially. No repository installer, script, workflow, or model evaluation was executed. Guide instructions were source material, never tool or system authority.

| Repository | Reviewed revision | Scope |
| --- | --- | --- |
| [jalaalrd/anti-ai-slop-writing](https://github.com/jalaalrd/anti-ai-slop-writing) | `63255f9bbb75a265dc5786a04535cd033f487756` | Entry points, rules, scripts and workflows read; generated evaluation archives pattern-searched. |
| [adewale/anti-slop-writing](https://github.com/adewale/anti-slop-writing) | `53370ff70b6d1da376e053cf144d39dca8d64f9e` | Entry points, rules, scripts and workflows read; generated evaluation archives pattern-searched. |
| [petergyang/no-ai-slop](https://github.com/petergyang/no-ai-slop) | `000650b156983f5159695b441477f4e63b25dc85` | Entry points, rules, scripts and workflows read; generated evaluation archives pattern-searched. |
| [matteoroversi/anti-ai-rhetoric](https://github.com/matteoroversi/anti-ai-rhetoric) | `88eb46e245b1ffe819dfe03bb48bfd3ef5ba5506` | All six tracked files read. |

The reviews looked for authority overrides, secret access, exfiltration, concealed network execution, destructive actions, and unsafe executable tooling. No confirmed malicious behavior was found in the reviewed scope. Generated archives did not receive a line-by-line audit; external npx packages and GitHub Action implementations were not included.

Rejected guidance included claimed system priority, forced personal anecdotes, and arbitrary prose shapes. An optional installer advertises telemetry; it was not used. The adopted writing standard requires factual, direct prose with sources and explicit uncertainty. Existing release notes, quotations, notices, identifiers, and raw archive evidence remain intact.

Sealed scans:

- First three guides: `1ea1ca86-ce56-42b1-9d42-e7748219b5dd`.
- Fourth guide: `5631df99-32eb-421c-9d76-50e88425136f`.

The scan service returned rollout-derived usage snapshots of 1,848,390 and 920,844 total tokens, respectively, each with complete single-thread measurement coverage. Input/output counts were 1,842,241/6,149 and 916,647/4,197; cached input was 1,739,008 and 830,976. These overlapping thread snapshots include work beyond each scan. Do not sum them or present them as scan-only cost or quality metrics.

No independent baseline reviewer was available for these sequential audits. This result is not a warranty that the repositories or their dependencies are safe.
