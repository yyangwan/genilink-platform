@AGENTS.md

## Current Status
Recharts integration complete (2026-05-17): LineChart (trends), PieChart + stacked BarChart (report), horizontal BarChart (visibility). Build passes. Next: browser testing, backend CRUD testing, mobile responsive.

## Dev Notes
- Dev server stability: `next build && next start` preferred over `next dev` for routes proxying to external services
- 智見 backend: port 8000, proxied via `/api/integration/*` routes with billing guard
- 智創 backend: port 3001, placeholder until service is ready
