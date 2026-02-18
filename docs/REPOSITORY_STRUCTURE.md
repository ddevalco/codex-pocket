# Repository Structure Reference

**Purpose:** Definitive guide to what belongs in this repository.

## Root Directory - Legitimate Files

### Configuration Files (KEEP)

- `.env.example` - Environment variable template for developers
- `.gitignore` - Git ignore patterns
- `.prettierrc`, `.prettierignore` - Code formatting (Prettier)
- `.markdownlint.json`, `.markdownlint-cli2.jsonc`, `.markdownlintignore` - Markdown linting
- `eslint.config.ts` - ESLint configuration
- `package.json`, `package-lock.json`, `bun.lock` - Dependency metadata
- `svelte.config.js` - Svelte configuration
- `tsconfig.json` - TypeScript configuration
- `vite.config.ts` - Vite build configuration

### Documentation and Metadata (KEEP)

- `README.md` - Project documentation
- `CHANGELOG.md` - Release history
- `BACKLOG.md` - Project planning
- `CONTRIBUTING.md` - Contributor guidelines
- `LICENSE` - License terms
- `AGENT_PROMPT.md` - Agent usage instructions

### Source/Entry Files (KEEP)

- `index.html` - Vite entry HTML
- `analyze_report.py` - Reporting utility

### Directories (KEEP)

- `.github/` - GitHub Actions, issue templates, workflows
- `.husky/` - Git hooks for pre-commit linting
- `.git/` - Git metadata (internal)
- `src/` - Application source code
- `services/` - Backend services
- `docs/` - Documentation
- `public/` - Static assets
- `scripts/` - Project scripts
- `migrations/` - Database/data migrations
- `bin/` - CLI scripts

### Generated Directories (KEEP, NOT IN GIT)

- `node_modules/` - Dependencies (generated)
- `dist/` - Build output (generated)

## Root Directory - NEVER Allowed

### Agent Artifacts (AUTO-REMOVE)

- `val_*.txt`, `val_*.log` - Validation output
- `temp_*.sh`, `ls_*.sh` - Temporary scripts
- `packet_*.yaml`, `packet_*.yml` - Agent tracking
- `analysis.txt` - Agent analysis output
- `.bundlesize.report.json` - Generated reports
- `.agent-local/` - Agent workspace
- `.vscode-agent-orchestration/` - Agent coordination
- Any `.agent-*` or `.orchestrator-*` directories

### Development Cruft (AUTO-REMOVE)

- `.DS_Store` - macOS metadata
- `Thumbs.db` - Windows metadata
- `*.swp`, `*.swo` - Vim swap files
- `*~` - Editor backup files

## Verification Command

Agents and developers can verify repo cleanliness:

```bash
# Should return nothing (exit 0)
find . -maxdepth 2 -type f \( \
  -name "val_*" -o -name "temp_*" -o -name "ls_*" -o \
  -name "packet_*" -o -name "analysis.txt" \
) 2>/dev/null

# Should return nothing
find . -maxdepth 1 -type d \( \
  -name ".agent-*" -o -name ".vscode-agent-*" \
) 2>/dev/null
```

## Agent Responsibilities

- Before committing: Run verification command
- Never create workspace directories in repo
- Use `/tmp/` for temporary files
- Clean up validation outputs immediately after use

---
*Last updated: 2026-02-18*
*This is the source of truth for repository structure.*
