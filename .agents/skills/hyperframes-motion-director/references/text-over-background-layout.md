# Text Over Background Layout

Use this reference whenever text sits on, beside, or near a generated background image. The goal is to make the readable hold, entrance path, transition midpoint, and mobile safe zones work as one vertical motion composition.

## Intent First

Choose the layout intent before generating or placing an image. The intent defines the relationship between message, subject, background, movement, and transition. From that relationship, derive image ratio, subject position, quiet text zone, type scale, crop behavior, motion boundaries, and transition logic.

Before choosing a lower-safe layout, map attention. In vertical video, the strongest first-read zone is center to slightly above center. Use this zone for hooks, sharp viewpoints, emotional keywords, and big typographic moments when the visual subject leaves it free. Lower-middle copy works for CTA holds, proof notes, or subject-dominant frames.

Every text-over-background beat must declare one compact layout contract:

```text
Layout contract: cinematic side-title stage / 9:16 / left axis / textRect x=8% y=24% w=44% h=28% / subjectRect x=54% y=20% w=36% h=46% / quiet zone left 46% / safeBottomY<=85% / title tier main / motion stays inside textRect
```

The contract must include:

- Layout intent: the visual relationship between background, subject, text, and transition.
- Image ratio: final intended image ratio; avoid copying the source ratio by habit.
- Text axis: left / right / center / top / bottom-safe / split.
- `textRect`: the allowed title/support/CTA region in percent or pixels.
- `subjectRect`: the required subject region after crop in percent or pixels.
- Quiet text zone: where type may sit without fighting image detail.
- Safe bottom boundary: the lowest allowed edge for CTA, subtitle, support line, or proof note.
- Title size tier: hero / large / main / reduced / compact, chosen from copy length and language.
- Motion bounds: text and key subjects must not move through unsafe zones during entrance, hold, transition, or exit.
- Regenerate / recrop trigger: what failure means the image or layout must be changed.

In Phase 1, this may be a candidate layout strategy rather than final geometry. After generated/supplied imagery is inspected, the storyboard must lock the final per-beat layout contract.

If the final contract is missing or vague, the frame is not ready for HyperFrames implementation.

The contract is not paperwork. It is the geometry of the frame. If it cannot be drawn as rectangles on a 1080x1920 canvas, it is not specific enough.

## Layout Intent Patterns

Choose the simplest intent that matches the message. These patterns are starting points. If the story needs another relationship, describe it in the same contract geometry.

Default cinematic vertical films should start from a full-bleed stage, a center-symbol hold, or pure kinetic type. Use product panels, proof cutaways, and multi-evidence structures only for product demos, proof/evidence moments, UI explanation, or before/after comparison. Keep the film from feeling like static pages.

### Cinematic Side-Title Stage

- Use for cinematic metaphor scenes with one strong background image.
- Image ratio: 9:16 generated or cropped from a larger source.
- Subject zone: opposite the text axis or centered in the middle 60%; avoid right-edge social UI controls when targeting short-video platforms.
- Text axis: left or right vertical column, usually upper-middle.
- Quiet zone: 42%-48% of canvas width on the text side.
- Avoid: centered subject plus centered title competing for the same space.

### Center Symbol Hold

- Use for one dominant symbol, product silhouette, number, or object.
- Image ratio: 9:16.
- Subject zone: center 60% width, 22%-58% height.
- Text axis: lower-middle, but above the bottom platform overlay.
- Quiet zone: dark lower third with local contrast treatment.
- Avoid: CTA below the safe bottom boundary.
- Caution: when text is the hook or emotional center, let it dominate the center and move the symbol behind/around it, or choose a side-title / kinetic-type layout.

### Center Impact Type

- Use for hooks, manifesto lines, major emotional turns, and short claims where the words are the image.
- Image ratio: 9:16 background stage, pure kinetic type, or low-detail generated plate.
- Subject zone: type owns center 70% width, 28%-58% height; image subject must stay behind, above, below, or at low contrast.
- Text axis: center axis or controlled split axis.
- Quiet zone: center field protected by darkness, blur, mask, or negative space.
- Motion: type reveal should have a clear text transition, such as mask open, scan highlight, compression release, split-line handoff, or word assembly.
- Avoid: treating center type as a static title slide. The text itself must move with intent.

### Proof Cutaway Hold

- Use when the image is evidence, product context, or atmosphere and the message needs a clean text field.
- Image ratio: 21:9 or 16:9 proof cutaway cropped into the top 34%-42% of the vertical canvas.
- Text axis: left-aligned bottom statement block.
- Quiet zone: paper/black field below image; no text over busy image.
- Avoid: putting the title inside the image cutaway unless the image was generated with a quiet zone.
- Exception pattern: use sparingly in cinematic films; this is an explainer/proof relationship.

### Split Product / Claim

- Use for product launch, SaaS/UI, hardware, or feature reveal scenes.
- Image ratio: 16:10 / 4:3 / 1:1 inside a stable frame.
- Subject zone: product or UI panel in one half; claim in the other half.
- Text axis: claim side, top-to-middle.
- Quiet zone: claim side must be mostly solid black or low-detail texture.
- Avoid: stretching screenshots or product images to fill the full 9:16 frame.
- Exception pattern for product or UI beats. Use it for abstract metaphor scenes only when the split itself expresses the idea.

### Sequential Proof Beats

- Use for multiple screenshots, proof panels, feature cards, or before/after visual evidence when the viewer can understand the images without reading dense text inside them.
- Image ratio: unified 16:10, 3:2, or 1:1 for the whole group.
- Text axis: title above the evidence group, proof note below each panel only if readable.
- Quiet zone: each panel owns its proof note; no floating text between panels.
- Avoid: mixed image ratios, mixed scale, or proof notes falling into the bottom overlay zone.
- Mobile caution: multi-panel evidence becomes unreadable quickly. Prefer sequential proof beats when the viewer must read text inside the images.
- Exception pattern. Use multi-panel proof as a last resort.

### Pure Kinetic Type

- Use only when the confirmed brief explicitly chooses pure type or code-generated visuals.
- Image ratio: none.
- `subjectRect` may be `none`; the type itself becomes the subject.
- Text axis: locked to an alignment system; title, support, and CTA still need safe zones.
- Quiet zone: code-generated texture or black field behind type.
- Avoid: using this exception to skip image planning.

## Image Ratio Rules

- Full background: generate or crop to 9:16 for `1080x1920`.
- Proof cutaway: generate 21:9 only when the image is panoramic; keep subject in the central 70%.
- Product / UI panel: use 16:10 or 4:3; preserve text and UI detail with contain behavior.
- Sequential proof group: all images in the group must share the same ratio and visual scale.
- User screenshots: if content must remain faithful, adapt to the intended frame with a background canvas before considering redraw.

Never copy source-image odd ratios into the layout. The layout owns the ratio.

## Title Size Tiers

Chinese text has more visual mass than English. Pick the title tier before implementing the frame. Use Chinese tiers by default; if the brief overrides language, document the alternate tier logic.

Approximate 1080x1920 starting points:

| Title shape | Tier | Size | Line height |
| --- | --- | --- | --- |
| 1 line, 2-6 Chinese chars | hero | 118-156px | 0.95-1.05 |
| 1 line, 7-10 Chinese chars | large | 96-118px | 1.0-1.08 |
| 2 lines, each line <= 7 chars | main | 78-96px | 1.05-1.12 |
| 2 lines, any line 8-11 chars | reduced | 62-78px | 1.08-1.18 |
| 3 lines or required legal/product text | compact | 48-62px | 1.14-1.24 |

Rules:

- Prefer rewriting copy over shrinking type.
- Set manual line breaks at semantic boundaries.
- Maximum title lines: 2 for most beats; 3 only for quote or manifesto scenes.
- Support text is 1-2 lines, usually 30-44px on 1080x1920.
- CTA / brand lockup is 1 line, usually 28-40px, and must not compete with the title.
- Mixed Chinese/English terms need a fallback width rule so product names cannot escape the text block.
- Letter spacing defaults to `0`; do not use negative tracking.

## Mobile Text Density And Spacing

Short-video viewers read in glances. Text density must let the main idea land in one look.

- One beat carries one sentence-level idea.
- Title: 4-14 Chinese characters is the normal range; beyond that, rewrite or split beats.
- Support: one clarifying line.
- Proof text: use one number or one short claim; dense evidence belongs in sequential beats, not small panels.
- Vertical spacing between title and support: 24-48px depending on title size.
- Vertical spacing between support and CTA/proof: 40-72px.
- Keep at least 72px between any text block and the edge of its local text field.
- Keep text blocks visually grouped; do not scatter title, support, proof, and CTA into unrelated corners.

## Text Axis Rules

- Left or right axis: align title, support, and CTA to the same vertical edge.
- Center axis: use when the text is the subject or the image subject sits away from center.
- Split axis: image and text occupy separate zones; do not let text float over the image edge.
- Bottom axis: valid only when the safe bottom boundary is explicit and the title clears platform UI.
- Axis consistency is the default. Break it only when semantic hierarchy requires it, and document why.
- For hooks, center axis is often the strongest choice because it owns first attention. If center axis feels weak, check type scale, motion, contrast, and background detail first.

Platform UI, subtitle, proof note, support line, and CTA are different semantic layers. Do not repeat the same text in two layers.

## Safe Bottom Rule

For 9:16 social video, the bottom overlay zone is dangerous. Default:

- Keep CTA, subtitle, proof note, support line, and brand lockup above the bottom 15% of the canvas.
- Keep primary title above the bottom 22% unless the layout is a confirmed lower-title frame.
- Keep important text away from the right-side control rail when targeting TikTok/Reels/Douyin style surfaces; avoid placing small text in the rightmost 12% unless the platform is explicitly clean.
- Keep top identity labels and title text below the top 8%-10% unless the platform/surface has no top interface overlay.
- If a beat needs bottom text, reserve a local black field and document the lowest y-boundary.
- Keep bottom-aligned CSS and motion paths above the final 15% during entrance, hold, and exit.

The storyboard must include a safe bottom boundary such as `safeBottomY<=85%` or `lowest text edge <= 1632px on 1080x1920`.

## Background Prompt Requirements

Generated background prompts must include layout information:

- Final role: stage / symbol / product context / evidence / texture.
- Layout intent.
- Aspect ratio and target crop.
- Subject location.
- `textRect` and `subjectRect` in plain language if the image tool cannot use coordinates.
- Quiet text zone.
- Crop-safe subject zone.
- Forbidden content: baked-in text, logos, platform UI, subtitles, proof labels, watermarks, decorative borders, high-frequency detail in the text zone.

If the image returns with text in the quiet zone, a subject on the wrong side, or no crop-safe region, regenerate or recrop before writing animation code.

## Static Frame Gate

Before motion, inspect the readable hold frame. This is a gate:

- Confirm the first eye target is obvious within one second.
- Confirm hook text keeps a strong attention zone.
- Snapshot the hero frame or inspect the static composition.
- Confirm one dominant visual mass and one dominant text block.
- Confirm `textRect`, `subjectRect`, and `safeBottomY` match the layout contract.
- Confirm title, support, CTA, subtitles, and proof notes are inside their declared zones.
- Confirm title size tier, line count, line height, max width, and spacing are readable at phone size.
- Confirm contrast treatment is local and does not look like a generic card unless the selected intent calls for a panel.
- Confirm no important subject, UI text, face, product edge, subtitle, or proof note is cropped.
- Confirm the frame remains readable without animation.

If the still frame fails, fix layout or image first. Motion cannot rescue a broken text-over-background composition.

## Motion And Transition Integration

Text, background, motion, and transition are one composition.

- Background motion must preserve the quiet zone during the full readable hold.
- Text entrance must land inside `textRect` before the viewer needs to read it.
- Text exit keeps readable copy away from unsafe bottom and right-side control zones.
- Transitions should use the existing subject, text axis, mask, light direction, or camera move as the bridge.
- If the next beat uses a different layout intent, define the transition midpoint: what remains stable, what moves, and when the new quiet zone becomes readable.
- The strongest transition is often a hold plus one meaningful movement.
