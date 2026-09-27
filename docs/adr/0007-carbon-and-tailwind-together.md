# ADR-0007: Carbon Design System components + Tailwind CSS utilities, together

## Context

The web dashboard (`web/`) is built with `@carbon/react` (IBM's Carbon Design System) for its component library — `Header`, `SideNav`, `DataTable`, `Modal`, `Select`, etc. — which ships its own layout primitives (`Grid`/`Column` with `sm`/`md`/`lg` breakpoint props) and CSS. `@tailwindcss/vite` is also a dependency and `index.css` globally imports Tailwind. Most of the app's page-level layout (inline `style={{}}` objects for colors, spacing, flex layouts) predates any responsive design work; when mobile responsiveness was added across every Admin/Officer page, it needed a way to express breakpoint-conditional styles that plain inline `style` objects can't do (no media queries in inline styles).

## Options Considered

1. **Carbon's own `Grid`/`Column` breakpoint props everywhere.** Fully idiomatic Carbon, but would require rewriting large amounts of existing inline-`style`-based layout (not originally built with Carbon's grid) just to make it responsive — a much bigger diff for what was meant to be a targeted responsiveness fix.
2. **A separate CSS-in-JS or styled-components layer.** New dependency, new pattern to learn, doesn't fit the existing "inline style objects everywhere" codebase style at all.
3. **Tailwind utility classes alongside the existing inline styles**, used specifically where a media query is actually needed (responsive margins, hiding elements below a breakpoint, responsive widths) — Tailwind was already a dependency and globally imported, just barely used.

## Decision

Option 3. Layout properties that need to change per breakpoint (e.g. the sidebar's `margin-left`, header search box width, two-column layouts collapsing to one column) moved to Tailwind `className`s — including a custom `min-[66rem]:` arbitrary breakpoint chosen specifically to match Carbon's own `SideNav` collapse breakpoint (66rem/1056px), so the Tailwind-driven layout changes and Carbon's own responsive `SideNav` behavior switch at the same viewport width instead of drifting apart. Everything that doesn't need a breakpoint (colors, one-off spacing) stays as inline `style` objects, unchanged.

## Consequences

- Every page now mixes three styling mechanisms: Carbon component internals (not directly stylable), inline `style` objects, and Tailwind `className`s — there's no single place to look for "how is this styled," and a future contributor has to know all three exist. This is deliberately the *smallest* change that made pages responsive without a full styling-system migration, not an endorsement of this as an ideal long-term pattern.
- The `min-[66rem]:` breakpoint is hand-matched to Carbon's SideNav breakpoint by reading Carbon's source/behavior, not by a documented, enforced contract — if Carbon changes that breakpoint in a future version bump, the Tailwind classes using `min-[66rem]:` would silently drift out of sync with when the sidebar actually collapses, and nothing would catch that automatically.
- No visual regression testing exists (see `README.md`'s Testing section — there's no web test runner configured at all), so responsiveness changes across ~20 pages were verified by code review and `tsc --noEmit`/build success only, not by an automated or even a manual full pass in a real browser at the time they were made (the Chrome extension needed for live verification wasn't connected in that session) — worth a manual pass across breakpoints before relying on this for a demo.
