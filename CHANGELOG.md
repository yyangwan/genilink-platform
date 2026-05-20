# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
