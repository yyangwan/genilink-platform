# Storyboard

## Loop Structure

Duration: 5.6s.

## Global Contracts

- Layout contracts: intent=split command-to-product proof frame; image ratio=16:10; text axis=left axis; textRect x=58 y=122 w=398 h=430; subjectRect x=486 y=114 w=742 h=512; proofRect x=58 y=580 w=1030 h=172; safeBottomY=760; title tier=main; motion bounds keep title in textRect and proof in proofRect.
- Background / main visual state: dark cinematic product stage with real screenshot as the dominant proof object.
- Sentence style: short feature-specific lines.
- Avoid: generic claims, icon piles, repeated fade-up slides.
- Keep: command, scan, route, proof assembly.
- Text role: title identifies the user-visible product outcome.
- Text-safe zone: left dark field.
- First eye target: title, then command, then screenshot.
- Center-impact decision: product screenshot owns center/right impact.
- Hero text zone: left upper-middle.
- Why this zone owns attention: the route can move from title/action into product proof without crossing text.
- Title size tier: main.
- Support assets active: screenshot, command card, scan rail, route path, cursor dot, proof cards.
- Support asset motion purpose: show user action becoming generated data.
- Support asset plan: mixed local screenshots plus code-generated product components.
- Support asset roles / source / local paths: `assets/images/*.png`, SVG route, CSS scan, generated cards.
- Support asset safe zones: no proof below y=760.
- Support asset deletion triggers: delete any mark with no state-change role.
- Kinetic relay keyword chain: 输入官网 -> 扫描 -> 生成 -> 锁定结果.
- Direction map: left-to-right route, top-to-bottom scan, bottom-up proof.
- Relay continuity rules: the cursor route and scan rail are the handoff devices.

### 0.0-1.1 Hook

Brand, module badge, and title reveal. The first eye target is the large Chinese title on the left. The module badge confirms which feature the viewer is watching.

Motion: mask reveal, brand rise, module badge slide.

Hero frame: 0.9s.

- Layout contract: intent=hook command setup; image ratio=16:10; text axis=left axis; textRect x=58 y=122 w=398 h=430; subjectRect x=486 y=114 w=742 h=512; safeBottomY=760; title tier=main; motion bounds keep title and command inside textRect.
- Readable hold: 0.82-1.1.
- Text transition: title clip reveal.
- Text transition device: maskReveal.
- Kinetic relay: first keyword is 输入官网.
- Directional transition: reveal downward, then route right.
- Transition midpoint frame: 0.62s.
- Kinetic relay score note: strong first target, no proof yet.
- What changes if this motion is removed: title becomes a static slide and loses product-operating context.
- Choreography: brand rises, title unlocks, command follows.
- Motion bounds: title stays inside textRect.
- Attention target: title.
- Transition midpoint snapshot: title partially revealed, command not yet fully locked.
- Anti-PPT risk: low because command surface enters before screenshot.
- Hold-frame verdict: title and command preview readable.
- Background stage: dark grid field.

### 1.1-2.4 Action

The command card types the domain or workflow target. Analyze presses. The real product screenshot arrives on the right.

Motion: command card scale-in, URL clip reveal, button press, screenshot perspective reveal.

Hero frame: 1.7s.

- Layout contract: intent=action handoff; image ratio=16:10; text axis=left axis; textRect x=58 y=122 w=398 h=430; subjectRect x=486 y=114 w=742 h=512; safeBottomY=760; title tier=main; motion bounds keep screenshot inside product frame and route between anchors.
- Readable hold: 1.58-2.05.
- Text transition: URL clip reveal.
- Text transition device: maskReveal.
- Kinetic relay: Analyze button becomes the handoff.
- Directional transition: left-to-right.
- Transition midpoint frame: 1.78s.
- What changes if this motion is removed: the user operation is no longer visible.
- Choreography: URL reveals, button presses, screenshot slides into perspective.
- Motion bounds: screenshot stays inside subjectRect.
- Attention target: command to screenshot.
- Anti-PPT risk: low because the product surface responds to the command.
- Hold-frame verdict: action is legible.

### 2.4-3.4 Generation

Scan rail crosses the screenshot. A route path draws from command card to product frame. Workflow steps light in sequence.

Motion: scan rail vertical pass, route path draw, cursor dot travels along the path, step dots lock.

Transition midpoint: 2.85s.

- Layout contract: intent=generation scan; image ratio=16:10; text axis=left axis; textRect x=58 y=122 w=398 h=430; subjectRect x=486 y=114 w=742 h=512; safeBottomY=760; title tier=main; motion bounds keep scan inside subjectRect and route outside readable title.
- Readable hold: 2.55-3.1.
- Text transition: workflow chips light in sequence.
- Text transition device: pathDraw and scan rail.
- Kinetic relay: 扫描.
- Directional transition: top-to-bottom scan.
- What changes if this motion is removed: data appears without cause.
- Choreography: scan passes, route draws, cursor travels.
- Motion bounds: scan remains inside product frame.
- Attention target: moving scan rail.
- Transition midpoint snapshot: route half drawn and scan visible.
- Anti-PPT risk: low because the scene has a physical product action.
- Hold-frame verdict: the generation state is understandable.

### 3.4-4.7 Proof

Metric block appears, score ring locks, bars grow from zero, and generated result cards assemble.

Motion: score ring rotation/scale settle, bar fill, card stagger with proof lock.

Hero frame: 4.0s.

- Layout contract: intent=proof lock; image ratio=16:10; text axis=left axis; textRect x=58 y=122 w=398 h=430; subjectRect x=486 y=114 w=742 h=512; proofRect x=58 y=580 w=1030 h=172; safeBottomY=760; title tier=main; motion bounds keep cards above safeBottomY.
- Readable hold: 3.7-4.72.
- Text transition: proof cards assemble.
- Text transition device: generated-card stagger and bar fill.
- Kinetic relay: 生成 -> 锁定结果.
- Directional transition: bottom-up proof assembly.
- What changes if this motion is removed: the data feels pasted on rather than generated.
- Choreography: score locks, bars fill, cards rise.
- Motion bounds: cards stay within proofRect.
- Attention target: metric and generated cards.
- Transition midpoint snapshot: bars mid-fill and first cards visible.
- Anti-PPT risk: medium if cards are too static; mitigated by bar fills and score pulse.
- Hold-frame verdict: proof frame works as a paused product card.

### 4.7-5.6 Loop Close

Cursor dot pulses once and the black cover returns for a clean autoplay loop.

Motion: cursor pulse, cover fade.

CTA lock frame: 4.9s.

- Layout contract: intent=loop close; image ratio=16:10; text axis=left axis; textRect x=58 y=122 w=398 h=430; subjectRect x=486 y=114 w=742 h=512; proofRect x=58 y=580 w=1030 h=172; safeBottomY=760; title tier=main; motion bounds keep final proof static before cover.
- Readable hold: 4.72-5.04.
- Text transition: none; proof remains still.
- Text transition device: deliberate stillness.
- Kinetic relay: final lock.
- Directional transition: black cover closes loop.
- What changes if this motion is removed: autoplay restart visibly jumps.
- Choreography: cursor pulses, cover fades in.
- Motion bounds: no element leaves safe zones.
- Attention target: completed proof surface.
- Transition midpoint snapshot: proof still visible before cover.
- Anti-PPT risk: acceptable because this is only the loop boundary.
- Hold-frame verdict: final proof state is clean.

## Module Variants

- Website Analysis: `genilink.cn` becomes website diagnosis.
- AI Visibility: AI platform queries become visibility signals.
- Audit Report: audit signals become report recommendations.
- Content Insights: gaps become content opportunity cards.
- Competitor Analysis: same prompts reveal competitive gaps.
