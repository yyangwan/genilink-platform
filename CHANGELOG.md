# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.2.0.1] - 2026-08-28

### Changed
- First-time users now see guided project setup states on the dashboard, brand voice, and content template pages instead of blank or indefinitely loading content.
- Empty brand management now explains how the first brand powers audits, competitor comparisons, and content creation.

### Fixed
- Project-scoped dashboard requests no longer run before a project is selected.
- Users with existing projects but no active selection are prompted to choose a project instead of being shown misleading empty data.

## [0.2.0.0] - 2026-08-21

### Added
- Customers can configure WeChat, Xiaohongshu, Douyin, Weibo, Toutiao, and Zhihu independently for the current login account and project.
- Every platform now includes step-by-step credential guidance, official console links, and locally served official product icons.
- Added regression coverage for platform route validation, credential redaction, account/project scope, and the redesigned settings experience.

### Changed
- Rebuilt the publishing settings page with per-platform status cards, a focused configuration drawer, connection maintenance actions, and clear account/project scope messaging.
- Platform responses expose credential-presence flags while keeping secrets and access tokens out of browser responses.

### Fixed
- Unsupported publishing platform identifiers are rejected before reaching the content service.
- Platform configuration payloads are validated and stripped of spoofed user or workspace fields before proxying.

## [0.1.0.1] - 2026-05-20

### Fixed
- Prevented parameter injection in prompts/generate route — user body can no longer override server-resolved `project_id` (adversarial review finding)
- Audits page no longer fires spurious fetch before `projectId` is resolved — passes `null` URL instead of fallback
- `useSectionFetch` hook now accepts `string | null` URL with null guard to skip fetch

### Added
- Test coverage for `useSectionFetch` null-URL guard (4 tests)
- Test coverage for `prompts/generate` route: auth, billing, mapping, upstream errors, auto-create, project_id body assertion (14 tests)
- TODOS.md tracking design system, accessibility, security, and test infrastructure work

### Changed
- CLAUDE.md status updated to reflect design review completion and next steps
- `prompts/generate` route now explicitly includes `project_id` in upstream request body
