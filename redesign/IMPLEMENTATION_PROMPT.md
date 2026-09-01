# Implementation prompt: adapt the Meeting Assistant visual concept to another website

Build a production-ready marketing landing page for the target website using the **visual system extracted from the Meeting Assistant Behance project**, without copying its brand identity, proprietary logo, copy, screenshots, or illustrations.

## Sources

- Public reference: https://www.behance.net/gallery/238300811/Meeting-Assistant-Web
- `behance:composite-01`: full Behance-hosted project composite.
- `screenshot:01`: `5b809bac-be3b-48ef-99ab-e9d7df13babe.png` — exact palette labels.
- `screenshot:02`: `69f4267c-3508-4a7e-94ed-2d606a14b2c3(2).png` — bento feature section.
- `screenshot:03`: `b540bc35-24dc-4c07-8350-bdeb6574c616(1).png` — three-step process section.
- `screenshot:04`: `8320663d-0680-4466-9f93-e80cae65da13(1).png` — pricing cards.
- `screenshot:05`: `7fc881e8-ae00-4f3c-a9dd-c29158d3880b(1).png` — FAQ accordion.
- `screenshot:06`: `a2a35998-722f-49de-9202-f8aca863b858(1).png` — hero/product showcase.
- `screenshot:07`: `eacefa98-3b1c-4844-a1d4-1e8351855826(1).png` — angled hero/product detail.

Read `DESIGN.md`, `design-tokens.json`, and `COMPONENTS.md` before implementation.

## Build target

Create a reusable **dark-space SaaS/product landing page concept** for the user's other website. Map the target site's existing information architecture and content into the extracted visual grammar. Do not reproduce the Meeting Assistant product or branding.

Recommended section order when the target content supports it:

1. quiet top navigation;
2. hero with target product visual/mockup as the dominant object;
3. bento-style feature/capability grid;
4. three-step process or workflow section;
5. pricing/comparison section only if the target site needs pricing;
6. FAQ/disclosure section;
7. restrained footer.

If the target website has different content needs, preserve its content architecture and apply the system rather than forcing irrelevant sections.

## Design-system summary

The concept is a deep-space interface: almost-black canvas, white typography, blue-violet primary energy, magenta secondary energy, near-black panels, hairline luminous borders, selective glow, sparse particles, radial/halftone light fields, and overlapping product UI for depth.

Use the exact palette tokens where applicable:

- Space Black `#020107`
- Polar White `#FFFFFF`
- Cosmic Pink `#CB7CFD`
- Midnight Purple `#4D30FF`

All implementation values must come from `design-tokens.json` where a token exists. Do not duplicate raw values in components unless the project architecture requires it. Estimated/inferred tokens are reconstruction aids, not claims about the source implementation.

## Token rules

- Background: `semantic.color.background.canvas`.
- Primary/secondary text: `semantic.color.text.primary` / `semantic.color.text.secondary`.
- Primary/secondary accents: `semantic.color.accent.primary` / `semantic.color.accent.secondary`.
- Card surface and borders: `semantic.color.surface.raised` / `semantic.color.border.subtle`.
- CTA: `semantic.color.action.primary` + `semantic.color.action.primary-text`.
- Spacing: use the `primitive.space.*` scale consistently before inventing new gaps.
- Shape: use `primitive.radius.sm`, `md`, `lg` according to control/card/hero scale.
- Type family is not extracted. Prefer the target project's existing sans-serif. If the project has no established family, choose one explicitly as a new project decision and document it.

## Component requirements

Follow `COMPONENTS.md` for anatomy and states.

- Navigation must stay visually quiet.
- Hero should contain one main target-product panel and at most 1-2 secondary floating panels. Use the target site's own UI/screenshots.
- Bento grid should mix one visual focal tile with smaller text-led tiles.
- Repeated 3-card groups should visually emphasize only one item.
- Pricing should have one clearly recommended plan if pricing exists.
- FAQ must be a semantic disclosure/accordion with open and closed states.
- Ambient glows/particles are decorative and must remain behind content.

## Visual composition rules

- Keep most painted area near-black; accents should be sparse and intentional.
- Create depth using overlap, edge light, blur and ambient glow rather than large opaque shadows.
- Use thin violet outlines on cards and controls; use brighter outlines only for the focused/featured item.
- Center major section headings with short supporting copy.
- Leave generous vertical space between sections.
- Avoid full-card rainbow gradients. If a gradient is introduced, constrain it to a CTA, glow or active edge and build it from extracted accent colors.
- Treat halftone/dot fields, orbs, arcs and particles as background texture, not content.

## Responsive behavior

No responsive frame or exact breakpoint was supplied. Therefore:

- Use the target project's existing breakpoints when available.
- Do not claim any breakpoint as extracted from Behance.
- Preserve content order as layouts stack.
- Collapse multi-column card groups into one or two columns according to available width.
- In the hero, keep the main product view legible and remove/reposition secondary floating layers before shrinking text below readable sizes.
- Reduce ambient particle/glow density on smaller screens.

## Interaction and motion

Only FAQ open/closed state and featured-card emphasis are visibly evidenced. Hover/focus/press timing is not known.

- Add visible keyboard focus that is distinct from decorative glow.
- Use restrained transitions for button/card emphasis and accordion expansion if appropriate.
- Any duration/easing is a new implementation decision; do not describe it as extracted.
- Respect `prefers-reduced-motion` and disable nonessential background animation.

## Accessibility

- Use semantic navigation, headings, buttons, links, lists and disclosures.
- Verify color contrast in the final implementation, especially muted white and violet text/borders.
- Never rely on glow or color alone to communicate selected/recommended states.
- Give meaningful alt text to product visuals that convey information; hide decorative particles/orbs/arcs from assistive technology.
- Ensure focus styles are visible against both black surfaces and violet glows.

## Voice and content

Use the target website's real copy. Keep the reference's density pattern: short benefit-led section headings, one concise sentence of support, one idea per card, direct CTA verbs, and minimal long-form prose.

## Uncertainty handling

Do not convert these unknowns into source claims: exact font family, grid dimensions, breakpoints, box-shadow values, hover/focus states, animation timing/easing, mobile behavior, or WCAG conformance. If a value is needed and no token exists, choose it as a documented project-specific deviation.

## Acceptance criteria

- The result clearly feels like the same *concept family*—dark space, violet/magenta energy, luminous near-black panels, product-driven depth—without copying Meeting Assistant branding or proprietary assets.
- Exact extracted palette tokens are used consistently.
- Components reuse `design-tokens.json` and the anatomy in `COMPONENTS.md` before introducing new values.
- Only one visual focal point dominates each section.
- Primary text stays readable; decorative glows never interfere with copy.
- FAQ works with keyboard and assistive technology.
- Reduced-motion behavior is implemented for any decorative animation.
- Compare the desktop result against `screenshot:02-07` for hierarchy, darkness, spacing rhythm, border restraint and glow density, not for proprietary content matching.
- Any necessary deviation is documented as a target-project choice rather than presented as evidence from the source.
