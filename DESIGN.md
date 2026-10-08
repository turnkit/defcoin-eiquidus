---
version: alpha
name: "Defcoin DC903"
description: "Community evidence and practical blockchain tools in the existing dark Defcoin identity."
colors:
  primary: "#CCBB44"
  secondary: "#66CCEE"
  background: "#111111"
  surface: "#16161A"
  foreground: "#EEF3F5"
  muted: "#AAB3BC"
  scrollbar: "#7D8995"
typography:
  sans:
    fontFamily: "Lucida Grande, Helvetica, Arial, sans-serif"
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace"
rounded:
  DEFAULT: "0.25rem"
  stat: "0.65rem"
spacing:
  reading-gap: "2rem"
components:
  reading:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.foreground}"
  reading-heading:
    textColor: "{colors.primary}"
  metadata:
    textColor: "{colors.muted}"
  navigation:
    textColor: "{colors.secondary}"
  table:
    textColor: "{colors.muted}"
  input:
    textColor: "{colors.foreground}"
  scrollbar-thumb:
    backgroundColor: "{colors.scrollbar}"
---

# Defcoin DC903 design contract

## Overview

Audience: DEF CON community members, miners, and infosec professionals. Readers need a factual community account and inspectable evidence; tool users need recognizable controls and accurate data. The current user brief and the owning `AGENTS.md` are the product context. This is an English-language, global community site, not a jurisdiction-specific financial service.

History and the security addendum are reading surfaces. Pool, explorer, calculator, QR, and mining statistics are product tools. Preserve their routes, input/control contracts, financial warnings, and data behavior during visual work.

The visual reference is a conference workshop notebook: dated observations beside source material. The signature is a chronological date rail, using real evidence dates. Existing gold, cyan, charcoal, coin imagery, and navigation remain. Avoid generic marketing cards, invented trust badges, decorative counters, or animated audit claims.

## Token ownership

This document mirrors the existing runtime source (Model B), not a second generator. `public/css/defcoin-integrated.css :root` owns the custom tokens; Bootstrap Darkly and `style.scss` remain the inherited theme/geometry owners. `test/uiPolishSpec.js` checks the concrete mirror below. A token change updates its source, this mirror, and its test together.

| Frontmatter color | Runtime token |
| --- | --- |
| primary | `--dc34-gold` |
| secondary | `--dc34-cyan` |
| background | `--dc34-charcoal` |
| surface | `--dc34-panel` |
| foreground | `--dc34-text` |
| muted | `--dc34-muted` |
| scrollbar | `--dc34-scroll-thumb` |

Other existing chart/semantic accents remain owned by the runtime theme. Do not replace them during a prose pass. No remote font or application dependency is added.

## Colors and states

Gold identifies headings, dates, and focus; cyan identifies links. Reading panels use the solid surface token, with foreground prose and muted metadata. Underlines make source links identifiable without color alone. Focus uses a 3px gold outline and 3px offset. Existing control disabled/busy semantics remain unchanged.

Global scrollbars use the scrollbar token against background, muted on hover and secondary on active, with standards properties and WebKit fallbacks. Forced colors restore the platform scrollbar and Highlight focus color. Scrollbars remain visible; classes define overflow geometry, not theme opt-in.

## Typography

Reuse the installed Lucida Grande/Helvetica/Arial body stack, inherited heading weight, and monospace utility stack. No new typeface download. Reading text is `1rem`, line height `1.65`, with a maximum `66ch` measure. Date metadata uses `0.875rem` monospace. Reading section headings are `1.15rem`; chapter/report headings are `1.35rem`. Hero size remains the existing responsive `#page-title` rule.

## Layout, shape, and depth

Keep the existing responsive navigation and natural document scrolling. The story uses an `8.5rem` date column plus a `66ch` prose column and `1rem` gap, stacking below `768px`. Chapters are separated by a real-date rail and rule, not individual decorative cards. Reading cards retain the observed 4px theme radius and remove the heavy shadow; compact stat cards keep their existing `0.65rem` exception. No shared shell gets a fixed viewport height or overflow trap.

Archive tables keep all columns, `scope=col` headers, a named focusable horizontal-scroll region, and a visible scrolling hint. Prose reflows; genuine evidence tables and the pool diagram scroll locally. New navigation links have a minimum 44px height, distinct focus, and ordinary anchor behavior. No sticky contents bar, new modal, or form behavior is introduced.

## Content and motion

Follow `docs/WRITING_STYLE.md`. Cite primary historical sources, label dated checks and unknowns, retain identifiers and archive dates, and leave old release notes unchanged. Audit claims need named scope, evidence, limits, and remaining work; no model name implies certification.

No entrance, scroll, or decorative animation is added. Reduced motion removes reading-surface transitions; keyboard navigation remains native. The report link is informational, not an alert or a security seal.

## Research and verification

The following are design inputs, not proof of whole-site conformance:

- [USWDS typography](https://designsystem.digital.gov/components/typography/): effective 16px body text, measured lines, left alignment, and adequate line spacing. `66ch` is a CSS approximation, not a promise of exactly 66 characters on every line.
- [W3C contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html): measure actual foreground/background pairs against the 4.5:1 normal-text threshold.
- [W3C reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html): check reading content at 320 CSS px; retain local scrolling where tabular relationships require it.
- [W3C focus](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html): visible keyboard focus, checked against the existing header.
- [W3C target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html): 24px minimum or allowed spacing/inline exceptions; new standalone links target 44px height.

Run token/contrast/render tests, the strict premium static audit, official DESIGN.md lint, the release build, and staging/production smoke checks. Inspect desktop and narrow portrait/landscape in the real in-app Chromium browser. Static audit tooling does not parse Pug; project render tests and browser checks cover that gap. Do not call this a user study or a WCAG certification.
