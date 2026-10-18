# Login screen redesign (October 2026)

The sign-in screen used to look like two different screens bolted together: a
permanently-navy hero next to a theme-following form column. This change makes
it **one continuous deep-navy canvas in both themes** with the form sitting on a
single elevated card.

Commits (branch `sop2-measurement-v2`):

| Commit | Scope |
| --- | --- |
| *Login: unify the auth screen into one continuous canvas* | layout + `--auth-*` tokens |
| *Login: polish the card controls and announce the toggle state* | card polish, `aria-pressed`, cache bump |
| *Test: gate the login layout and accessibility contract* | `tests/login-layout.test.js`, `tests/login-a11y.test.js` |
| *Login: land 768px on the tablet layout and lift code text to 12px* | breakpoint + font fixes found by measurement |
| *Docs: login redesign report and before/after screenshots* | this report + `docs/qa/login-redesign/` |

## Diagnosis (before)

| Symptom | Cause |
| --- | --- |
| A body-coloured band along the top/bottom edge of the auth screen | a `@supports (padding: env(safe-area-inset-top))` block padded `.login-page` on every modern desktop, exposing `--bg-primary` behind it |
| A visible vertical seam between the two halves | `.login-form-section::before` painted a 1px divider and the two halves were painted separately |
| The form looked like a floating, unstyled column | `.login-form-section` had `background: rgb(248, 250, 252)` (light) / `rgb(6, 6, 11)` (dark) and the inner form had no surface of its own |
| Controls were small | inputs 39px tall, submit 33px, labels 12.25px |

## Design decision

One deep-navy canvas for the whole page, defined by tokens that are **identical
in both themes**; the form becomes an elevated card whose surface *does* change
with the theme (light card on the navy canvas in light mode, dark glass card in
dark mode). The hero text uses theme-independent `--auth-hero-*` colours because
the canvas is always navy.

## Tokens

Defined once in `:root` and once in `[data-theme='dark']`; no hard-coded colours
remain in the login rules (the only `#000` left is an alpha channel inside two
`mask-image` declarations).

| Token | Light | Dark | Purpose |
| --- | --- | --- | --- |
| `--auth-bg-start` / `--auth-bg-mid` / `--auth-bg-end` | `#070713` / `#0a1628` / `#0d1530` | same | the canvas gradient (theme-independent) |
| `--auth-surface` | `#ffffff` | `rgba(17,17,25,0.72)` | the card surface |
| `--auth-border` | `rgba(15,23,42,.10)` | `rgba(255,255,255,.12)` | card/input border |
| `--auth-text` | `#0f172a` | `#f0f0f5` | card text |
| `--auth-muted` | `#475569` | `#cbd5e1` | footer/version text |
| `--auth-accent` | `#2563eb` | `#60a5fa` | links, focus ring, primary button |

## Measured result (after)

Probed in headless Chrome against the real `index.html` + `style.css`
(`docs/qa/login-redesign/*-metrics.json`):

| Width | Layout | Hero | Card | Input / submit height | Smallest text |
| ---: | --- | --- | ---: | ---: | ---: |
| 375 | single column, compact hero | 375×283 | 340 | 46 / 46 | 12px |
| 768 | two columns 45 / 55 | 346×1024 | 366 | 46 / 46 | 12px |
| 1366 | two columns 55 / 45 | 751×768 | 420 | 46 / 46 | 12px |
| 1920 | two columns 55 / 45 | 1056×1080 | 420 | 46 / 46 | 12px |

The page paints the navy gradient (`linear-gradient(135deg, #070713 0%, #0d1530
68%, #0a1628 100%)`) while `.login-form-section` is transparent, so the two
halves share one surface. No horizontal overflow at any width.

The card is `min(100%, 420px)`, so on a 768px tablet it narrows to the column
(366px) rather than overflowing; the 400–440px figure is the desktop cap.

## Defects found during verification and fixed

Live measurement caught two things a static CSS read did not:

1. **Breakpoint off-by-one.** `@media (max-width: 768px)` *matched* at 768px, so
   a 768px viewport got the phone layout (hero stacked, 733px-wide card) instead
   of the intended two-column tablet layout. Changed to `max-width: 767.98px`
   (and the short-phone variant), so 768–1023px keeps the two-column view.
2. **Sub-12px text.** The root font is 14px, so the decorative hero code card was
   `.code-card-title` `0.7rem` (9.8px) and `.code-card-body` `0.8rem` (11.2px).
   Both lifted to `max(12px, …)`.

Both are now pinned by assertions in `tests/login-layout.test.js`.

## Accessibility

- Password visibility is a real `<button type="button">` with `aria-label` and
  `aria-pressed`; `togglePasswordVisibility` flips `aria-pressed` with the input
  type (covered by a fake-DOM test).
- `autocomplete="username"` / `"current-password"`, `enterkeyhint` retained.
- A persistent `#login-error` (`role="alert"`, `aria-live="polite"`, `[hidden]`)
  sits **after** the submit button so an error cannot shift it.
- `:focus-visible` ring on inputs and buttons; 44–48px touch targets.
- Focus rings and labels in both themes are checked for WCAG 2.2 AA contrast in
  `tests/login-layout.test.js`.

## Screenshots

Headless-Chrome renders of the real login markup and stylesheet — no auth and no
application shell, so they show the auth screen only.

| File | State | Width | Theme |
| --- | --- | ---: | --- |
| `before-375-light.png` | old | 375 | light |
| `before-375-dark.png` | old | 375 | dark |
| `before-768-light.png` | old | 768 | light |
| `before-768-dark.png` | old | 768 | dark |
| `before-1366-light.png` | old | 1366 | light |
| `before-1366-dark.png` | old | 1366 | dark |
| `before-1920-light.png` | old | 1920 | light |
| `before-1920-dark.png` | old | 1920 | dark |
| `after-375-light.png` | new | 375 | light |
| `after-375-dark.png` | new | 375 | dark |
| `after-768-light.png` | new | 768 | light |
| `after-768-dark.png` | new | 768 | dark |
| `after-1366-light.png` | new | 1366 | light |
| `after-1366-dark.png` | new | 1366 | dark |
| `after-1920-light.png` | new | 1920 | light |
| `after-1920-dark.png` | new | 1920 | dark |

`before-metrics.json` / `after-metrics.json` hold the raw probe output behind the
table above.

## Known limitations / follow-ups

- Login logic, validation, Firebase and the password-recovery flow are unchanged.
- The 768–1023px card is narrower than 400px because the two-column split leaves
  the form ~55% of a narrow viewport; widening the form column (e.g. 40/60) would
  restore 400px+ if that matters more than hero width.
- The screenshots are harness renders, not captures of the signed-in app.
