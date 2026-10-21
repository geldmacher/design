# Deploy local plugin

Operate only on the current plugin repository. Select the exact requested path:

- status: `npm run deploy:status`
- dry run: `npm run deploy:local -- --dry-run`
- standard deploy: `npm run deploy:local`
- full deploy: `npm run deploy:local -- --full`

Run Cursor, Codex, and OpenCode by default. Append `--cursor-only`, `--codex-only`, or `--opencode-only` for one host; the host flags work with status, dry-run, standard, and full paths.

Do not add an `--all` mode, manually copy bundles, edit the personal Marketplace, delete Codex caches, trust hooks, or restart a host. OpenCode config (opencode.json, commands/) is shared with Workflow and Efficiency: merge only, always write a persistent backup before changing anything, touch only your own entries, rollback/uninstall removes only your own entries. Report the selected hosts, installed local versions, receipts, applicable Codex cache verification, dirty provenance, and changed hooks. After a real deployment, require a Cursor reload, a new Codex task, and/or a new OpenCode session for the hosts that changed before claiming live activation.
