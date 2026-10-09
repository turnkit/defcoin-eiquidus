# Defcoin UI behavior contract

Scope: public navigation, History, and existing tool controls during the October 2026 copy/polish pass. The owner withdrew the public security report on 9 October 2026. Payout, wallet, administrative, and authenticated workflows retain their existing contracts.

## Canonical UI Map

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
| --- | --- | --- | --- | --- |
| Table Selection | None on the changed read-only surfaces | History template and route data | No selection or bulk action added | History render and browser checks |
| Select/Listbox | Existing native select controls | Owning tool template/controller | Platform-owned popup retained; no authored popup introduced | Preserved template fingerprints and tool checks |
| Date | History evidence data | `lib/defcoin_history_data.js` | Full dates use time elements; coarse years remain text; no picker | Evidence/date tests |
| Form | Existing tool templates/controllers | QR/calculator templates and browser scripts | QR creates/copies a URI, never pays; calculator is an estimate | Copy/browser-tool specs and browser checks |
| Scrollbar | Shared integrated stylesheet | `public/css/defcoin-integrated.css` | Local overflow geometry; global theme; platform forced colors | UI specs, computed styles and table keyboard scrolling |
| Toast | No new toast system | History view | Persistent inline content only | Escaped render tests |
| CRUD | Not exposed by these public reading/tool routes | Router and disabled-faucet contract | No create/update/delete/payout operation added | Route registration and smoke checks |

## Navigation and state

- Links navigate; no click-only containers or new scripted navigation. Public pages contain no security-report links or banners. The former report routes use the existing `404` behavior; detailed reports stay in private operations documentation as required by `AGENTS.md`.
- Page titles use the existing `{Page} - {Explorer}` policy. History uses an h1 with h2 sections; chronological chapters use h3.
- Reading anchors and focused elements remain visible below the existing header. No new fixed/sticky shell or nested vertical scroller.
- Tables preserve all evidence, columns, order, and identifiers. Named horizontal regions are keyboard-focusable; no responsive column loss.
- The existing server error/404 behavior remains. This public content change adds no role/authentication boundary or special 403 workflow.
- QR amount/label/message defaults and URI behavior are not altered by the polish pass. No form input is sent to an external QR service.
- Async polling, paging, fees, payout identity, RPC authorization, and wallet/key generation are not redesigned here. The pool transaction-feed/block-label mismatch remains separate, disclosed work.

## Verification boundaries

`premium-ui.json` scopes the generic static auditor to shared CSS, which it supports. Pug is not supported by that auditor; project-owned template compile/render/escaping tests and staging/live checks are required. A passing static audit does not claim the unchanged application’s entire UX is conformant.
