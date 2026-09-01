---
source: "https://www.behance.net/gallery/238300811/Meeting-Assistant-Web"
generated_at: "2026-08-31T10:40:00Z"
coverage: "Behance project page, Behance composite image, and seven supplied desktop screenshots"
evidence_summary: "Exact palette from screenshot:01; layout/component treatment observed across screenshot:02-07; dimensions, alpha, spacing, typography scale and hidden states remain estimated/inferred/unknown."
---

# Overview

This is a dark, high-contrast AI/SaaS marketing language built around a **deep-space interface metaphor**: almost-black canvas, blue-violet and magenta energy, restrained glassy panels, thin luminous edges, soft radial/halftone glows, floating product UI, and very sparse white typography.

The public reference is [Meeting Assistant - Web on Behance](https://www.behance.net/gallery/238300811/Meeting-Assistant-Web). The requested adaptation should preserve the atmosphere and information architecture, not the original Meeting Assistant logo, product copy, screenshots, or proprietary illustration content.

Observed page regions: desktop navigation, hero/product showcase, bento-style feature cards, three-step process cards, three-tier pricing, FAQ accordion, and footer. See [COMPONENTS.md](COMPONENTS.md) for anatomy and [design-tokens.json](design-tokens.json) for reusable tokens.

# Colors

The supplied palette frame gives four exact brand colors. These are the strongest evidence in the extraction.

| Role | Value | Evidence | Confidence | Notes |
|---|---:|---|---|---|
| Space Black | `#020107` | exact · `screenshot:01` | high | Primary canvas/background. |
| Polar White | `#FFFFFF` | exact · `screenshot:01` | high | Primary text and icons. |
| Cosmic Pink | `#CB7CFD` | exact · `screenshot:01` | high | Secondary energy/glow accent. |
| Midnight Purple | `#4D30FF` | exact · `screenshot:01` | high | Primary interactive/energy accent. |
| Raised panel | approx. `#0B0A18` | estimated · `screenshot:02-05` | low | Near-black violet card surface; do not treat as source CSS. |
| Muted text | white at approx. 52% alpha | inferred · `screenshot:02-05` | medium | Secondary copy consistently appears dimmer than headings. |
| Violet border | Midnight Purple at approx. 38% alpha | inferred · `screenshot:02-06` | medium | Thin neon edge; alpha is a reconstruction choice. |

Color dominance is heavily biased to black/near-black. Saturated violet is concentrated in focus areas: featured cards, waveform visualizations, CTA buttons, selected pricing, floating product modules, and ambient section glows.

# Typography

The exact font family is **unknown** from the raster references. The visible type is a clean modern sans/grotesk with rounded-neutral forms. Do not claim a specific family.

| Role | Approx. size | Weight | Evidence | Confidence |
|---|---:|---:|---|---|
| Section heading | ~40 px | ~700 | estimated · `screenshot:02-05` | low |
| Card title | ~18 px | ~600 | estimated · `screenshot:02-04` | medium |
| Body | ~14 px | ~400 | estimated · `screenshot:02-05` | medium |
| Micro/label | ~12 px | ~400-600 | estimated · `screenshot:02,04` | medium |

Large headings use compact line-height and short centered copy. Body text uses relaxed leading and low-contrast white. The system avoids uppercase display headings; labels and tiny UI metadata are concise and functional.

# Layout

Desktop composition is spacious and centered. Sections sit inside a broad central container with large vertical breathing room. A useful inferred rhythm is 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96 px; these are normalization values, not measured CSS.

Observed structures:

- Hero: one dominant product/device composition centered on the page, with floating UI panels overlapping the device plane (`screenshot:06-07`).
- Feature section: asymmetric bento grid, with one image-led feature tile and several smaller text-led tiles (`screenshot:02`).
- Process section: three equal desktop cards in a row, with the center card visually emphasized (`screenshot:03`).
- Pricing: three equal plans in a row; center plan gets a brighter border and filled CTA (`screenshot:04`).
- FAQ: one wide accordion container with generous internal padding (`screenshot:05`).

No mobile/tablet frame is supplied, so exact breakpoints and responsive transitions are unknown. For an adaptation, use the target project's existing breakpoints and preserve reading order when stacking.

# Elevation and Depth

Depth comes from **glow, overlap, blur and edge light**, not strong drop shadows. Panels stay nearly black while thin violet borders and diffuse colored halos separate layers. Hero mockups overlap one another in a shallow 3D/isometric composition. Decorative particles and blurred orbs sit behind content and should never compete with text.

Conventional shadow values are not exposed. Do not claim an exact box-shadow. Recreate depth with low-opacity accent glows, subtle inner/outer edge highlights, and large-radius background blurs.

# Shapes

- Cards: estimated ~12 px radius, thin 1 px edge.
- Large hero/device frames: softer, estimated ~20 px radius.
- Buttons and tags: restrained rounding, estimated ~6 px.
- Decorative energy elements: circles, concentric rings, waveform lines, radial dots/halftone fields.

The overall geometry is rectangular and technical, softened by luminous circular effects.

# Components

Primary observed components are documented in [COMPONENTS.md](COMPONENTS.md): navigation, hero showcase, bento feature grid, process cards, pricing cards, CTA buttons, badges, FAQ accordion, footer, floating product panels, icon tiles, and ambient background effects.

Use tokens from [design-tokens.json](design-tokens.json) rather than copying raw values into each component.

# Do's and Don'ts

**Do**

- Keep 80-90% of the visual field dark and let violet/pink appear selectively.
- Use one dominant glow/focus region per section.
- Use thin luminous borders instead of bright card fills.
- Keep headings short, centered, and high contrast.
- Use product screenshots/mockups as the primary hero evidence for the *new* website.
- Preserve generous negative space around section headings and card groups.
- Emphasize one choice in repeated sets: center process step, featured plan, primary CTA.

**Don't**

- Do not copy the Meeting Assistant logo, product UI, copy, proprietary illustrations, or exact marketing claims.
- Do not turn every card into a bright gradient; the reference depends on dark restraint.
- Do not use heavy glass blur everywhere; most panels read as opaque or nearly opaque dark surfaces.
- Do not invent exact CSS values, font family, breakpoints, motion durations, or WCAG scores from screenshots.
- Do not let ambient glows sit directly behind long body text at high intensity.

# Motion and Interaction

Observed interaction state evidence is limited. The FAQ shows both closed rows and one open row (`screenshot:05`). Featured/selected visual states are visible in the center process card and center pricing card (`screenshot:03-04`). Hover, focus, pressed, disabled, loading, menu-open, and mobile-nav states are not shown.

Motion is therefore **unknown**. If motion is added in the adapted site, keep it subtle: short opacity/translate transitions for cards, a gentle glow pulse or background drift, and accordion height/opacity transitions. These would be implementation choices, not extracted facts. Respect `prefers-reduced-motion`.

# Imagery and Icons

The visual language uses product UI as imagery: large dashboard/browser panels, floating calendar/meeting cards, waveform/AI symbols, and isometric device framing. In the adaptation, replace all reference UI with the target website's own product screenshots, diagrams, or application panels.

Icons are small, simple, mostly line/monoline or compact glyphs inside small dark square containers. The repeated waveform/energy symbol acts as a motif. Exact icon set is unknown.

Background imagery is abstract: blurred purple orbs, sparse particles, thin orbital arcs, halftone/radial dot fields, and soft blue-violet/magenta bloom.

# Accessibility

Visual evidence supports strong primary contrast: white headings on near-black canvas. Secondary text is intentionally muted and may fail contrast if opacity is reduced too far; verify its final rendered contrast instead of assuming compliance. The FAQ uses clear row separation and plus/close indicators, but keyboard semantics and focus treatment are not visible.

Implementation requirements for the adapted site:

- Use semantic buttons/links and an actual disclosure/accordion pattern for FAQ.
- Provide visible keyboard focus distinct from decorative glows.
- Ensure muted text and violet-on-black combinations meet the target contrast requirements.
- Keep tap/click targets at least project-standard size; screenshot measurements are insufficient to certify target size.
- Treat decorative particles/glows as `aria-hidden` and non-interactive.
- Respect reduced motion if decorative animation is introduced.

This is not a site-wide WCAG audit.

# Voice and Content

The reference voice is concise, benefit-led SaaS copy: short section headings, one-sentence explanatory subtitles, compact card titles, and direct CTA labels. It avoids long editorial paragraphs. Pricing copy is brief and scannable; FAQ questions are plain-language and task-oriented.

For another website, keep the **density pattern**, not the original wording: one idea per card, one clear action per CTA, and minimal explanatory text around product visuals.

# Evidence, Conflicts, and Unknowns

| Source ID | Source | Role |
|---|---|---|
| `url:primary` | [Behance project](https://www.behance.net/gallery/238300811/Meeting-Assistant-Web) | Project context and public project metadata |
| `behance:composite-01` | Behance-hosted composite project image | Full-page composition reference |
| `screenshot:01` | `5b809bac-be3b-48ef-99ab-e9d7df13babe.png` | Supplied desktop reference frame |
| `screenshot:02` | `69f4267c-3508-4a7e-94ed-2d606a14b2c3(2).png` | Supplied desktop reference frame |
| `screenshot:03` | `b540bc35-24dc-4c07-8350-bdeb6574c616(1).png` | Supplied desktop reference frame |
| `screenshot:04` | `8320663d-0680-4466-9f93-e80cae65da13(1).png` | Supplied desktop reference frame |
| `screenshot:05` | `7fc881e8-ae00-4f3c-a9dd-c29158d3880b(1).png` | Supplied desktop reference frame |
| `screenshot:06` | `a2a35998-722f-49de-9202-f8aca863b858(1).png` | Supplied desktop reference frame |
| `screenshot:07` | `eacefa98-3b1c-4844-a1d4-1e8351855826(1).png` | Supplied desktop reference frame |

Key limitations:

- The Behance page exposes project context but not source CSS, DOM, computed styles, breakpoints, or full interaction behavior.
- `screenshot:01` contains exact palette labels; most other numeric values are estimated from visual proportions.
- The exact font family, responsive breakpoints, motion timing/easing, hover/focus states, and implementation-level shadows are unknown.
- Supplied screenshots include portions of the Behance viewer chrome on the right edge; that chrome is not part of the target design.
- The extraction intentionally documents a reusable concept rather than a pixel-for-pixel clone.
