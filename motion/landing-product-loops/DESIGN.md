# Design System

## Style Lock

- Background: `#050505`.
- Brand accent: `#00d4aa`.
- Secondary accent: `#7c6aef`.
- Proof accent: `#d7b66f`.
- Foreground: `#f5f7fb`.
- Muted text: `#9ba4b8`.
- Density: product proof first, restrained cinematic surface second.

## Typography

- Chinese UI/display: Microsoft YaHei UI / Microsoft YaHei / PingFang SC fallback stack.
- Data and command text: system monospace.
- Title size: 52px, 1-3 lines maximum.
- Body copy is avoided inside video; proof is carried by module title, command, metric, chips, and cards.

## Layout

- Canvas: `1280x800`.
- Left zone: command and title, x=58 y=122 w=398.
- Right zone: real product screenshot, x=486 y=114 w=742 h=512.
- Bottom proof zone: generated cards and metric panels, y>=580.
- Safe bottom: 760px.
- Text does not use viewport scaling.

## Layout Rules

- Default layout strategy: fixed 16:10 split frame where textRect x=58 y=122 w=398 h=430 owns command/title, subjectRect x=486 y=114 w=742 h=512 owns the screenshot, and proofRect x=58 y=580 w=1030 h=172 owns generated evidence.
- Allowed layout contract variants: same geometry with different screenshot and module copy only.
- First eye target: title, then typed command, then product frame.
- Center-impact policy: center/right area belongs to the screenshot, not text.
- Lower-safe policy: generated proof cards may sit low but must stay above `safeBottomY=760`.
- Title size tier: main.
- Text rectangle / subject rectangle: `textRect x=58 y=122 w=398 h=430`; `subjectRect x=486 y=114 w=742 h=512`.
- Title / support / CTA spacing: title margin 22px to command; no CTA in the video loop.
- Mobile safe-zone handling: handled by the landing page video container, not within this 1280x800 asset.
- Motion bounds: route and scan must not push readable text outside its zones.

## Writing Rules

- Sentence style: concrete feature/result language.
- Avoid: “智能增长”“全新体验”“提升效率” unless tied to a visible product artifact.
- Keep: module names, metrics, workflow states, generated cards, real screenshots.

## Product Component Library

- Brand lockup: 智链 / GeniLink.
- Module badge: module identity and live status dot.
- Command card: typed domain/workflow target plus Analyze action.
- Step chips: three sequential workflow states.
- Product frame: real screenshot with browser chrome.
- Scan rail: analysis pass across the product frame.
- Anchored route path: command card to product frame.
- Score block: generated metric and proof label.
- Bar group: three module-specific chips with generated bars.
- Result cards: three generated proof cards.

## Background System

- Background role: low-brightness stage and depth field.
- Background source: CSS radial light, grid texture, local screenshot.
- Local asset path: `assets/images/*.png`.
- Quiet text zone: left dark field.
- Title placement: left upper-middle.
- Minimum contrast rule: title and command text must sit on dark field or dark glass above 4.5:1.

## Support Asset System

- Support asset decision: mixed.
- Asset roles: product fragment, route path, scan rail, cursor dot, score ring, proof cards.
- Shared style lock: teal route/scan, purple secondary bars, gold proof accent, glass panels.
- Safe-zone rules: proof y<=760, product frame x=486..1228, text x=58..456.
- Motion purpose per asset: scan reveals analysis; route proves causality; cards prove generated output.
- Deletion trigger: remove marks that only decorate empty space.

## Kinetic Relay System

- Keyword chain: 输入官网 -> 扫描 -> 生成 -> 锁定结果.
- Action object chain: command card -> Analyze -> scan rail -> route path -> proof cards.
- Direction vocabulary: left-to-right route, top-to-bottom scan, bottom-up proof cards.
- Relay / handoff rules: cursor dot links command and product; scan triggers proof layer.
- Kinetic relay score target: 100.

## Motion Personality

- The first movement is a reveal, not a fade.
- The command card performs the user action.
- The scan rail and route path show causality.
- Proof cards assemble after the scan, so the viewer sees data being produced.
- The final black cover makes the clip loop without a jump.

## Motion Craft System

- Signature motion moment: real screenshot scan plus proof assembly.
- Repeated animation pattern to avoid: identical fade/y entrances for all important elements.
- Anti-PPT diagnosis: the video would lose meaning without scan, route, and generated proof sequence.
- Camera / spatial movement: product screenshot receives a slow push while the scan happens.
- Kinetic typography language: mask reveal for title and URL only.
- Text transition vocabulary: clip reveal, type-like URL reveal, proof lock.
- CSS3 layers: glass panels, scan rail, grid texture, proof cards.
- SVG layers: anchored route path.
- GSAP master timeline structure: labels `hook`, `reveal`, `proof`, `cta`.
- Scene transition bridges: one continuous loop, black cover only at the loop boundary.
- Readable lock moments: title by 1.1s, proof by 4.05s.
- Motion devices to avoid: timers, random motion, infinite repeats, layout-property animation.

## Implementation Rules

- Use one paused GSAP master timeline registered to `window.__timelines.root`.
- No `Date.now`, `Math.random`, timers, requestAnimationFrame, or infinite repeats.
- Use fixed local assets.
- Use transform, opacity/autoAlpha, clipPath, filter, strokeDashoffset, and color only for motion.
