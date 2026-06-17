<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Workflow

- Develop and test changes locally in this workspace first.
- Push source changes to git from local only.
- Treat the production host as pull-only: update it by pulling from git, not by editing code directly on the server.
- If a production-only fix is ever unavoidable, mirror it back into this repo immediately so local and production stay aligned.
