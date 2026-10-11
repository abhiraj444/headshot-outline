# Design System — Headshot Outline

Generated with [ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill):

```
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "AI photo tool image editor utility minimal" \
  --design-system -p "Headshot Outline" -f markdown --variance 3 --motion 4
```

## How it is applied in this app

- **Style:** Minimalism & Swiss — spacious, high contrast, one primary action per view, no heavy chrome.
- **Single accent:** the generator proposed violet primary `#7C3AED` + cyan CTA `#0891B2`. The product brief asks for **one accent color**, so only violet is used (light `#7C3AED`, dark `#A78BFA` for AA contrast on dark surfaces). The cyan is intentionally dropped.
- **Typography:** Inter (loaded with a system-font fallback stack; no build-time font fetch).
- **Tokens:** shadcn semantic OKLCH/hex CSS variables in `src/app/globals.css`, with full `:root` and `.dark` schemes (shadcn stack rule "Support dark mode").
- **Motion:** framer-motion for the self-drawing outline (pathLength) and filmstrip enter (stagger 60ms). All motion is disabled under `prefers-reduced-motion` (UX rule "Reduced Motion", severity High). Max 1–2 animated elements per view.
- **Touch:** every interactive control is ≥44px tall, 8px+ gaps (UX rules "Touch Target Size", "Touch Spacing").
- **Feedback:** stepper ("Step 2 of 4"), model-download progress with aria-busy, round captions (UX rules "Progress Indicators", "Loading Indicators").
- **Forms:** visible labels, helper text, inline validation on blur, progressive disclosure (technical controls live only in /settings and the Details sheet).
- **Next.js:** heavy pipeline code is loaded via dynamic import and a Web Worker; client components kept as leaves (stack rules "Use dynamic imports", "Push Client Components down").
- **shadcn:** Sheet for the Details drawer (stack rule "Use Sheet for side panels").

---

## Generator output (verbatim)

## Design System: Headshot Outline

### Design Dials
- **Variance:** 3/10 — Centered / Minimal
- **Motion:** 4/10 — Standard

### Pattern
- **Name:** Product Demo + Features
- **Conversion Focus:** Use an interactive demo only when it explains value better than static media. Provide captions, transcript, visible play/pause controls, and a non-video fallback; do not autoplay under reduced motion. Pause media when offscreen or hidden and keep the final product state available as static content.
- **CTA Placement:** Video center + CTA right/bottom
- **Color Strategy:** Video surround: Brand color overlay. Features: Icon color #0080FF. Text: Dark #222
- **Sections:** Hero > Product video/mockup (center) > Feature breakdown per section > Comparison (optional) > CTA

### Style
- **Name:** Minimalism & Swiss Style
- **Mode Support:** Light supported | Dark supported
- **Keywords:** Clean, simple, spacious, functional, white space, high contrast, geometric, sans-serif, grid-based, essential
- **Best For:** Enterprise apps, dashboards, documentation sites, SaaS platforms, professional tools
- **Performance:** cost:low|drivers:none | **Accessibility:** risk:low|requires:contrast-text-4.5,keyboard,visible-focus,reduced-motion

### Colors
| Role | Hex | CSS Variable |
|------|-----|--------------|
| Primary | `#7C3AED` | `--color-primary` |
| On Primary | `#FFFFFF` | `--color-on-primary` |
| Secondary | `#A78BFA` | `--color-secondary` |
| On Secondary | `#0F172A` | `--color-on-secondary` |
| Accent/CTA | `#0891B2` | `--color-accent` |
| On Accent/CTA | `#000000` | `--color-on-accent` |
| Background | `#FAF5FF` | `--color-background` |
| Foreground | `#1E1B4B` | `--color-foreground` |
| Card | `#FFFFFF` | `--color-card` |
| Card Foreground | `#1E1B4B` | `--color-card-foreground` |
| Muted | `#ECEEF9` | `--color-muted` |
| Muted Foreground | `#475569` | `--color-muted-foreground` |
| Border | `#DDD6FE` | `--color-border` |
| Destructive | `#DC2626` | `--color-destructive` |
| On Destructive | `#FFFFFF` | `--color-on-destructive` |
| Ring | `#7C3AED` | `--color-ring` |

*Notes: AI purple + cyan interactions [Accent adjusted from #06B6D4]*

### Typography
- **Heading:** Inter
- **Body:** Inter
- **Mood:** dark, cinematic, technical, precision, clean, premium, developer, professional, high-end utility
- **Best For:** Developer tools, fintech/trading, AI dashboards, streaming platforms, high-end productivity apps
- **Google Fonts:** https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap
- **CSS Import:**
```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
```

### Key Effects
Subtle hover (200-250ms), smooth transitions, sharp shadows if any, clear type hierarchy, fast loading

### Motion
**Stagger List** (Standard) — Trigger: load or scroll | Duration: 300-450ms | Easing: `back.out(1.4)`
```js
gsap.from('.grid-item', { opacity: 0, scale: 0.92, y: 16, duration: 0.4, stagger: { each: 0.06, from: 'start', grid: 'auto' }, ease: 'back.out(1.4)' });
```
*Framework notes: grid: 'auto' lets GSAP infer rows/columns from a CSS grid layout for a natural wave stagger; Use matchMedia('(prefers-reduced-motion: reduce)') to skip non-essential motion and render the final state immediately*
- ✅ Combine with from: 'center' for a bento-grid layout to draw the eye inward first
- ❌ Don't use back.out on dense data tables; the overshoot reads as sloppy on informational UI

### Avoid (Anti-patterns)
- Heavy chrome
- Slow response feedback

### Pre-Delivery Checklist
- [ ] No emojis as icons (use SVG: Heroicons/Lucide)
- [ ] cursor-pointer on all clickable elements
- [ ] Hover states with smooth transitions (150-300ms)
- [ ] Light mode: text contrast 4.5:1 minimum
- [ ] Focus states visible for keyboard nav
- [ ] prefers-reduced-motion respected
- [ ] Responsive: 375px, 768px, 1024px, 1440px


---

## UX guideline searches (verbatim)

## UI Pro Max Search Results
**Domain:** ux | **Query:** progress loading feedback
**Source:** ux-guidelines.csv | **Found:** 2 results

### Result 1
- **Category:** Feedback
- **Issue:** Progress Indicators
- **Platform:** All
- **Description:** Show progress for multi-step processes
- **Do:** Step indicators or progress bar
- **Don't:** No indication of progress
- **Code Example Good:** Step 2 of 4 indicator
- **Code Example Bad:** No step information
- **Severity:** Medium

### Result 2
- **Category:** Feedback
- **Issue:** Loading Indicators
- **Platform:** All
- **Description:** Loading feedback should match the expected wait and avoid flashing for near-instant work
- **Do:** Follow platform and component guidance; preserve layout focus and accessible busy status
- **Don't:** Apply one timing threshold to every operation or leave long waits unexplained
- **Code Example Good:** Stable skeleton or progress with aria-busy
- **Code Example Bad:** Flickering spinner or frozen UI
- **Severity:** High

## UI Pro Max Search Results
**Domain:** ux | **Query:** touch target mobile
**Source:** ux-guidelines.csv | **Found:** 2 results

### Result 1
- **Category:** Touch
- **Issue:** Touch Target Size
- **Platform:** Mobile
- **Description:** Touch target guidance depends on platform and web context
- **Do:** Use 44pt on iOS and 48dp on Android; for web use the separate WCAG Target Size rule
- **Don't:** Treat one unit or minimum as universal across platforms
- **Code Example Good:** iOS 44pt; Android 48dp; Web 24 CSS px plus WCAG exceptions
- **Code Example Bad:** w-6 h-6 buttons
- **Severity:** High

### Result 2
- **Category:** Touch
- **Issue:** Touch Spacing
- **Platform:** Mobile
- **Description:** Adjacent touch targets need adequate spacing
- **Do:** Minimum 8px gap between touch targets
- **Don't:** Tightly packed clickable elements
- **Code Example Good:** gap-2 between buttons
- **Code Example Bad:** gap-0 or gap-1
- **Severity:** Medium

## UI Pro Max Search Results
**Domain:** ux | **Query:** reduced motion animation
**Source:** ux-guidelines.csv | **Found:** 2 results

### Result 1
- **Category:** Animation
- **Issue:** Reduced Motion
- **Platform:** All
- **Description:** Respect user's motion preferences
- **Do:** Check prefers-reduced-motion media query
- **Don't:** Ignore accessibility motion settings
- **Code Example Good:** @media (prefers-reduced-motion: reduce)
- **Code Example Bad:** No motion query check
- **Severity:** High

### Result 2
- **Category:** Animation
- **Issue:** Excessive Motion
- **Platform:** All
- **Description:** Too many animations cause distraction and motion sickness
- **Do:** Animate 1-2 key elements per view maximum
- **Don't:** Animate everything that moves
- **Code Example Good:** Single hero animation
- **Code Example Bad:** animate-bounce on 5+ elements
- **Severity:** High

## UI Pro Max Search Results
**Domain:** ux | **Query:** progressive disclosure forms
**Source:** ux-guidelines.csv | **Found:** 2 results

### Result 1
- **Category:** Typography
- **Issue:** Heading Line Balance
- **Platform:** Web
- **Description:** Short multi-line headings may use balanced wrapping as a progressive visual heuristic
- **Do:** Bound the measure and test natural-wrap fallback across widths fonts and locales
- **Don't:** Promise an exact final line or insert blanket nonbreaking spaces or hardcoded br tags
- **Code Example Good:** .hero-title { max-inline-size: 20ch; text-wrap: balance; }
- **Code Example Bad:** Heading copy rewritten with forced last-line breaks
- **Severity:** Medium

### Result 2
- **Category:** Forms
- **Issue:** Inline Validation
- **Platform:** All
- **Description:** Validate as user types or on blur
- **Do:** Validate on blur for most fields
- **Don't:** Validate only on submit
- **Code Example Good:** onBlur validation
- **Code Example Bad:** Submit-only validation
- **Severity:** Medium


## Stack searches (verbatim)

## UI Pro Max Stack Guidelines
**Stack:** nextjs | **Query:** client component dynamic import worker
**Source:** stacks/nextjs.csv | **Found:** 3 results

### Result 1
- **Category:** Performance
- **Guideline:** Use dynamic imports
- **Description:** Code split with next/dynamic
- **Do:** dynamic() for heavy components
- **Don't:** Import everything statically
- **Code Good:** const Chart = dynamic(() => import('./Chart'))
- **Code Bad:** import Chart from './Chart'
- **Severity:** Medium
- **Docs URL:** https://nextjs.org/docs/app/building-your-application/optimizing/lazy-loading
- **Applies To:** nextjs 16.2
- **Status:** active
- **Verified At:** 2026-08-13

### Result 2
- **Category:** Rendering
- **Guideline:** Push Client Components down
- **Description:** Keep Client Components as leaf nodes
- **Do:** Client wrapper for interactive parts only
- **Don't:** Mark page as Client Component
- **Code Good:** <InteractiveButton/> in Server Page
- **Code Bad:** ('use client') on page.tsx
- **Severity:** High
- **Docs URL:** https://nextjs.org/docs/app/building-your-application/rendering/client-components
- **Applies To:** nextjs 16.2
- **Status:** active
- **Verified At:** 2026-08-13

### Result 3
- **Category:** Rendering
- **Guideline:** Mark Client Components explicitly
- **Description:** 'use client' for interactive components
- **Do:** Add 'use client' only when needed
- **Don't:** Server Component with hooks/events
- **Code Good:** ('use client') for onClick useState
- **Code Bad:** No directive with useState
- **Severity:** High
- **Docs URL:** https://nextjs.org/docs/app/building-your-application/rendering/client-components
- **Applies To:** nextjs 16.2
- **Status:** active
- **Verified At:** 2026-08-13


## UI Pro Max Stack Guidelines
**Stack:** shadcn | **Query:** theme dark mode form sheet
**Source:** stacks/shadcn.csv | **Found:** 3 results

### Result 1
- **Category:** Theming
- **Guideline:** Support dark mode
- **Description:** Override semantic OKLCH variables under .dark for every custom theme token
- **Do:** Define complete :root and .dark semantic schemes
- **Don't:** Keep legacy space-separated HSL snippets or omit dark tokens
- **Code Good:** .dark { --background: oklch(0.145 0 0); }
- **Code Bad:** .dark { --background: 240 10% 3.9%; }
- **Severity:** High
- **Docs URL:** https://ui.shadcn.com/docs/dark-mode
- **Applies To:** shadcn cli 4; base=base|radix|aria
- **Status:** active
- **Verified At:** 2026-08-13

### Result 2
- **Category:** Theming
- **Guideline:** Use CSS variables for colors
- **Description:** Define semantic OKLCH variables in globals.css and expose them to Tailwind v4 with @theme inline
- **Do:** :root and .dark variables plus @theme inline mappings
- **Don't:** Hardcode palette colors in components
- **Code Good:** @theme inline { --color-primary: var(--primary); }
- **Code Bad:** bg-blue-500 text-white
- **Severity:** High
- **Docs URL:** https://ui.shadcn.com/docs/theming
- **Applies To:** shadcn cli 4; base=base|radix|aria
- **Status:** active
- **Verified At:** 2026-08-13

### Result 3
- **Category:** Sheet
- **Guideline:** Use Sheet for side panels
- **Description:** Sheet component for slide-out panels and drawers
- **Do:** Sheet for navigation filters settings
- **Don't:** Dialog for side content
- **Code Good:** <Sheet side="right">
- **Code Bad:** <Dialog> with slide animation
- **Severity:** Medium
- **Docs URL:** https://ui.shadcn.com/docs/components/sheet
- **Applies To:** shadcn cli 4; base=base|radix|aria
- **Status:** active
- **Verified At:** 2026-08-13


---

## Addendum — facial-feature line art

The Studio's only visible control besides export is the **Detail** segmented toggle (Outline / Features / Detailed), a `role="radiogroup"` with arrow-key navigation and 44 px segments. The self-drawing animation draws the outline first (≈1.3 s) and then the features with a small stagger; under reduced motion both appear instantly.
