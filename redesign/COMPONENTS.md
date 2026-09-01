# Coverage summary

This inventory covers the desktop marketing system visible in the supplied Behance project and screenshots. It is suitable as a component blueprint for an adapted website, not as proof of the original implementation.

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

## Navigation

- Purpose: Lightweight desktop navigation over the dark hero.
- Evidence: observed · medium · `screenshot:06`, `screenshot:07`
- Anatomy: logo/mark, 3-4 text links, right-aligned login/secondary action.
- Variants: only desktop default observed.
- Sizes: compact; exact height/padding unknown.
- States: default observed; hover, focus, active, mobile menu unobserved.
- Tokens: `semantic.color.text.primary`, `semantic.color.text.secondary`, `primitive.space.3`, `primitive.space.4`.
- Responsive behavior: unknown from source; adapt to the target project's existing navigation pattern.
- Accessibility: real links/buttons; visible focus must be added/verified.
- Implementation notes: keep navigation visually quiet so the hero mockup remains dominant.

## Hero showcase

- Purpose: Establish product value through a large, cinematic product composition.
- Evidence: observed · high · `screenshot:06`, `screenshot:07`
- Anatomy: dark rounded stage, main device/browser frame, foreground application panel, 1-2 floating secondary panels, product mark, ambient particles/orbs/arcs.
- Variants: front-facing composite and angled/isometric close-up are both shown as project frames.
- Sizes: occupies most of the viewport width in desktop presentation; exact max-width unknown.
- States: static frame only; hover/parallax unobserved.
- Tokens: `semantic.color.background.canvas`, `primitive.color.purple-glow`, `primitive.color.pink-glow`, `primitive.radius.lg`.
- Responsive behavior: unknown; on smaller screens prioritize the main product panel and drop nonessential floating layers.
- Accessibility: mockup images need meaningful alt text when they communicate product information; decorative particles should be hidden from assistive tech.
- Implementation notes: for the new site, replace every Meeting Assistant UI element with the target product's own visuals.

## Bento feature grid

- Purpose: Explain capabilities without a long feature list.
- Evidence: observed · high · `screenshot:02`
- Anatomy: one larger image-led tile, one wide text tile, three smaller text/icon tiles; borders, small icon wells, titles, concise descriptions.
- Variants: image-led, wide text-led, compact text-led.
- Sizes: mixed spans in an asymmetric two-column desktop layout; exact grid tracks unknown.
- States: default only; hover/focus unobserved.
- Tokens: `semantic.color.surface.raised`, `semantic.color.border.subtle`, `semantic.color.text.primary`, `semantic.color.text.secondary`, `primitive.radius.md`, `primitive.space.4`, `primitive.space.5`.
- Responsive behavior: source does not show stacking. Preserve content order and let wide/image tiles span full width before compact tiles.
- Accessibility: icons should not replace text labels; maintain readable body contrast.
- Implementation notes: use one visual tile as a focal point and keep the rest information-dense but quiet.

## Process card row

- Purpose: Communicate a three-step workflow.
- Evidence: observed · high · `screenshot:03`
- Anatomy: icon/motif, step title, central mini-visualization, short supporting copy.
- Variants: default side cards; emphasized center card with brighter blue-violet edge/glow.
- Sizes: three equal desktop cards; center card slightly taller/more prominent visually.
- States: center emphasis observed; hover/focus/pressed unobserved.
- Tokens: `semantic.color.surface.raised`, `semantic.color.border.subtle`, `semantic.color.accent.primary`, `semantic.color.accent.secondary`, `primitive.radius.md`.
- Responsive behavior: unknown; adaptation should stack in reading order while preserving the center step's emphasis without changing sequence.
- Accessibility: do not encode step order by glow alone; number or label steps in the adapted content.
- Implementation notes: the center emphasis creates rhythm and a visual narrative; reuse that pattern for the most important step.

## Pricing cards

- Purpose: Compare three plans with one recommended option.
- Evidence: observed · high · `screenshot:04`
- Anatomy: plan name, short description, price, CTA, feature list, optional badge.
- Variants: standard left/right cards; featured center card with brighter border, badge and filled violet CTA.
- Sizes: three equal desktop columns; exact width unknown.
- States: featured/default observed; button hover/focus/disabled unobserved.
- Tokens: `semantic.color.surface.raised`, `semantic.color.border.subtle`, `semantic.color.action.primary`, `semantic.color.action.primary-text`, `primitive.radius.md`, `primitive.space.4`, `primitive.space.5`.
- Responsive behavior: unknown; on narrow screens keep the featured plan first or visually distinct without changing plan semantics.
- Accessibility: include accessible plan names and button labels; do not rely on border color alone to mark the recommended plan.
- Implementation notes: only one CTA should be visually dominant.

## Button

- Purpose: Primary and secondary actions.
- Evidence: observed · medium · `screenshot:04`, `screenshot:06`
- Anatomy: label inside a compact rounded rectangle; primary version uses saturated violet, secondary version is dark/outlined.
- Variants: primary filled, secondary dark/outlined.
- Sizes: medium; exact height unknown.
- States: default observed; hover, focus, pressed, disabled, loading unobserved.
- Tokens: `semantic.color.action.primary`, `semantic.color.action.primary-text`, `semantic.color.border.subtle`, `primitive.radius.sm`, `primitive.space.2`, `primitive.space.4`.
- Responsive behavior: typically full-width inside pricing cards; source behavior beyond desktop not shown.
- Accessibility: preserve clear focus, adequate hit target, and readable text contrast.
- Implementation notes: optional gradient treatment may be introduced between extracted accent colors, but that is an adaptation choice rather than an exact extracted token.

## Badge

- Purpose: Mark a preferred pricing tier or tiny status.
- Evidence: observed · medium · `screenshot:04`
- Anatomy: small icon or mark plus short text in a compact outlined pill/rounded rectangle.
- Variants: only pricing recommendation badge observed.
- Sizes: micro/label scale.
- States: static only.
- Tokens: `semantic.color.accent.secondary`, `semantic.color.border.subtle`, `primitive.font.size.label`, `primitive.radius.sm`.
- Responsive behavior: should remain attached to its card title area.
- Accessibility: badge text must remain readable and not be the sole indicator of recommendation.
- Implementation notes: keep badges rare.

## FAQ accordion

- Purpose: Compress common questions into one wide information block.
- Evidence: observed · high · `screenshot:05`
- Anatomy: question row, plus icon when closed, close/minus-like icon when open, answer region, dividers.
- Variants: closed row, open row.
- Sizes: one wide rounded container with large horizontal padding.
- States: open and closed observed; hover/focus/keyboard behavior unobserved.
- Tokens: `semantic.color.surface.raised`, `semantic.color.text.primary`, `semantic.color.text.secondary`, `semantic.color.border.subtle`, `primitive.radius.md`, `primitive.space.4`, `primitive.space.5`.
- Responsive behavior: unknown; keep full-width on mobile with reduced side padding.
- Accessibility: implement with native button semantics, `aria-expanded`, and programmatic association to the answer region.
- Implementation notes: use a real disclosure component; do not make the whole section depend on JavaScript-only non-semantic divs.

## Icon well

- Purpose: Give small feature icons a consistent visual anchor.
- Evidence: observed · high · `screenshot:02`
- Anatomy: compact square dark surface, thin purple edge, centered simple icon.
- Variants: icon changes by feature; container treatment stays consistent.
- Sizes: estimated 36-44 px square from frame proportions.
- States: static only.
- Tokens: `semantic.color.surface.raised`, `semantic.color.border.subtle`, `semantic.color.accent.secondary`, `primitive.radius.sm`.
- Responsive behavior: unchanged.
- Accessibility: decorative icons should be hidden if the adjacent title already provides the accessible name.
- Implementation notes: keep icons simple and monoline/compact.

## Ambient background field

- Purpose: Create the space/AI atmosphere without adding content noise.
- Evidence: observed · high · `screenshot:02-07`
- Anatomy: radial glows, blurred violet/magenta orbs, sparse particles, thin orbital arcs, halftone/dot field.
- Variants: section halo, hero particles, local card glow.
- Sizes: large diffuse effects; exact blur radii unknown.
- States: static frames only; animation unobserved.
- Tokens: `primitive.color.purple-glow`, `primitive.color.pink-glow`, `semantic.color.background.canvas`.
- Responsive behavior: reduce density on small screens and behind text.
- Accessibility: fully decorative, non-interactive, `aria-hidden`; reduced-motion safe if animated.
- Implementation notes: use pseudo-elements or a dedicated decorative layer below content. Limit each section to one dominant halo.

## Footer

- Purpose: Low-emphasis navigation and brand closure.
- Evidence: observed · medium · `behance:composite-01`
- Anatomy: brand/mark area plus multiple link columns and small social/legal items.
- Variants: only one desktop footer observed.
- Sizes: compact relative to major sections.
- States: link interactions unobserved.
- Tokens: `semantic.color.background.canvas`, `semantic.color.text.primary`, `semantic.color.text.secondary`, `primitive.space.4`, `primitive.space.6`.
- Responsive behavior: unknown; collapse to stacked columns for narrow screens as a project-specific adaptation.
- Accessibility: maintain clear landmarks and link focus states.
- Implementation notes: keep footer visually quieter than the content sections.

## Unobserved and uncertain behavior

The following are not verified by the supplied evidence: exact font family, CSS grid tracks, breakpoints, mobile navigation, hover states, focus styles, disabled/loading states, animation duration/easing, scroll effects, parallax, keyboard behavior beyond what a semantic implementation should provide, and final contrast ratios. Any such behavior added to the adapted site must be treated as an implementation decision rather than an extracted fact.
