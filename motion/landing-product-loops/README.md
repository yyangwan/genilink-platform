# HyperFrames Motion Production

This project was scaffolded by the HyperFrames Motion Director skill.

Default production assumption: Simplified Chinese promotional film, vertical 9:16, 1080x1920, with platform-safe top/bottom zones. Document any override in BRIEF_DESIGN_PROPOSAL.md.

## Artifact Flow

1. BRIEF_DESIGN_PROPOSAL.md
2. DESIGN.md
3. STORYBOARD.md
4. SCENE_SCHEMA.json
5. VECTOR_TEMPLATES.json
6. MOTION_PRIMITIVES.json
7. REVIEW_REPORT.md
8. compositions/
9. snapshots/
10. renders/
11. REVIEW_PACK.md (generated after review assets exist)

Optional:

- BEAT_MAP.json via `--with-timing`
- MOTION_MAP.json via `--with-motion`

## Suggested Checks

```bash
node E:\workspace\genilink-platform\.agents\skills\hyperframes-motion-director/scripts/check_assets.mjs .
node E:\workspace\genilink-platform\.agents\skills\hyperframes-motion-director/scripts/check_assets.mjs . --strict
node E:\workspace\genilink-platform\.agents\skills\hyperframes-motion-director/scripts/validate_artifacts.mjs .
node E:\workspace\genilink-platform\.agents\skills\hyperframes-motion-director/scripts/validate_design_engineering.mjs .
npx hyperframes lint
npx hyperframes validate
npx hyperframes inspect
npx hyperframes snapshot <composition> --at <times>
```
