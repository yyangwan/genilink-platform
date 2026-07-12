# Brief Design Proposal

## Essence

智链的落地页不应该只展示静态截图，而要让访客看到“输入一个官网，平台把空白状态转成诊断、审计、洞察和竞品差距”的过程。

核心记忆点：数据不是摆出来的，是被平台生成出来的。

## Format

- Surface: landing page product cards.
- Language: Simplified Chinese plus compact English module labels.
- Aspect ratio: 16:10, `1280x800`.
- Duration: 5.6s per loop.
- FPS: 30.
- Output: WebM for browser autoplay; poster uses existing screenshot.
- Override: not 9:16 because the asset is embedded in a horizontal product screenshot frame.

## Layout Strategy

- Layout strategy: left command, right product screen, lower proof lock.
- Sentence style: short Chinese product claims, no generic pitch copy.
- Avoid: icon piles, abstract AI glow, decorative-only particles, repeated fade-up cards.
- Keep: real screenshots, command card, scan rail, route path, generated proof blocks.
- Title size tier: main.
- Visual impact line: the scan turns a real product screen into measurable proof.
- First-screen attention zone: left title first, then command card, then product screenshot.
- Hook text zone: left upper-middle textRect.
- Text spacing: fixed sizes, no viewport scaling, no negative tracking.

## Background And Asset Plan

- Background source: code-generated black field, grid texture, local screenshots.
- Focal subject position: product screenshot sits in the right subjectRect.
- Quiet text zone: left dark field protects the title and command card.
- Background motion: subtle screenshot push and scan pass.
- Text-over-image contrast treatment: all text sits on dark glass panels or dark field, not over busy screenshot content.
- Mobile safe-zone handling: not a vertical mobile asset; landing page controls the responsive video container.
- Regenerate / recrop trigger: recrop screenshot if module UI text becomes unreadable or the scan obscures proof.

## Attention Map

- First eye target: Chinese title.
- Center-impact text decision: no center title; the product surface owns the right center, title owns left focus.
- First 0-2s scroll-stop event: command card types and the real screenshot arrives.
- Biggest word or object: the product screenshot frame after 1.1s.
- Main attention target: input-to-product route.

## Support Asset Decision

- Support asset decision: mixed.
- Support asset roles: product fragment, scan rail, route path, cursor dot, score ring, generated cards.
- Support asset style lock: black cinematic base with teal, purple, and restrained gold proof accents.
- Support asset motion purpose: prove causality from user input to generated analysis.
- Support asset deletion trigger: delete if it does not guide attention or prove state change.
- Support asset choreography: route path draws only after Analyze; proof cards only appear after scan.
- Motion bounds: proof stays above y=760; title stays in x=58..456.

## Motion Craft

- Keyword chain: 输入官网 -> 扫描 -> 生成 -> 锁定结果.
- Action object chain: command card -> Analyze button -> scan rail -> route path -> proof cards.
- Direction map: left command pushes attention right; scan moves top-to-bottom; proof rises from bottom.
- Relay object / handoff logic: cursor dot travels along the route path from command to product frame.
- Kinetic typography plan: title and URL use mask/clip reveal; dense paragraphs are avoided.
- Text transition style: title and URL use mask/clip reveal; proof text locks after card assembly.
- CSS3 / SVG structure: clipPath title reveal, SVG route path, CSS scan rail, score ring.
- GSAP choreography: one paused master timeline with hook, reveal, proof, and CTA labels.
- Signature motion moment: scan rail crosses the real screenshot and triggers proof cards.
- Motion budget: one primary state-change per beat.
- Target kinetic relay score: 100.
- Anti-PPT prevention: at least one route draw, one scan pass, one proof generation sequence; no slide-only scenes.

## Product Proof

- Real screenshots from `public/landing/screens/`.
- Command/input card: domain or workflow target.
- Product frame: real module screenshot.
- Scan rail: visible analysis pass over the screenshot.
- Route path: command card routes into the product surface.
- Proof layer: metric, bars, chips, and generated cards lock into place.

## Motion Plan

- Hook: brand and module label appear; title reveals through a mask.
- User action: command card types and Analyze presses.
- Product state change: screenshot arrives, scan rail crosses the surface.
- Proof generation: score card, bars, and generated cards assemble from zero.
- Loop close: black cover returns so the video can restart cleanly.

## Asset Decision

- Supplied assets: production screenshots copied into `assets/images/`.
- Generated bitmap assets: none for this pass.
- Code-generated assets: scan rail, route path, cursor dot, score ring, bars, proof cards, texture grid.
- Deletion trigger: any decorative mark must either guide attention, prove state change, or support the loop transition.

## Risk Gates

- Text must stay inside the 16:10 composition and remain readable after compression.
- The loop must not depend on wall-clock timing or infinite CSS animation.
- The rendered asset must still communicate product proof when paused.
