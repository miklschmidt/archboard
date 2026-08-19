# dev-skills/

Skills for working **on** this repository. Tracked in git, **never published**.

## Why this is separate from `skills/`

| | `skills/` | `dev-skills/` |
|---|---|---|
| Audience | consumers of the npm package | people working on this fork |
| Published | **yes** — `skills/**/*` is in package.json `files` | no |
| Installed by | `mcp-excalidraw-server install-skill` | `node scripts/sync-skills.mjs` |
| Portability | must be portable — no machine-specific paths | may reference `bin/canvas`, repo paths |

Anything placed in `skills/` ships to every npm consumer. Repo-local
procedures do not belong there.

## How they reach an agent

Both directories sync into the derived, gitignored agent dirs:

```
skills/<name>/       ─┐
                      ├─> .agents/skills/<name>  <──symlink──  .claude/skills/<name>
dev-skills/<name>/   ─┘
```

```bash
node scripts/sync-skills.mjs
```

The sync replaces rather than overlays, so deleted files don't linger, and it
errors if a name collides between the two sources. Third-party skills also live
in `.agents/skills/` (installed by `skills experimental_install` from
`skills-lock.json`); the sync leaves those untouched.

## Adding one

Create `dev-skills/<name>/SKILL.md` with `name` and `description` frontmatter,
then run the sync. The description is what an agent matches against, so make it
say when to reach for the skill, not just what it contains.
