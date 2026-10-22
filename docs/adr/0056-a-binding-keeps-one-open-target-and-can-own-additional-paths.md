---
status: proposed
---

# A binding keeps one open target and can own additional paths

TASK-501 addresses a behavior whose implementation spans several role folders.
The current code check reports 82 anchor mismatches, including 40 on Browser application.
A directory binding reaches only one of those folders.
Binding their common ancestor also claims unrelated behavior.

Keep `binding.path` as the one target that opens in the code editor.
Add optional `binding.additionalPaths` for the other files and directories that implement the same behavior.
All paths use the binding's repository, branch, and commit.
Each path remains literal and passes the existing checkout containment and symbolic link rules.

For example, a viewer can open its client folder and own its implementation across the other roles:

```json
{
	"repo": "github.com/miklschmidt/archboard",
	"path": "apps/web/src/ui/clients/semantic-board-canvas",
	"additionalPaths": [
		"apps/web/src/ui/components/semantic-board-canvas",
		"apps/web/src/ui/hooks/semantic-board-canvas",
		"apps/web/src/ui/rules/semantic-board-canvas",
		"apps/web/src/ui/state/semantic-board-canvas"
	]
}
```

A binding with `symbol` keeps its existing meaning: one definition.
It cannot also carry `additionalPaths`.
A binding without `symbol` owns the union of its primary and additional paths.
Ownership uses the narrowest matching location, so an explicitly bound child still owns its own code.
The code check and all history readings use the same complete scope.
The plain check reports a missing additional path, and code opening continues to use the primary path.

The alternative is to draw a child node for each role folder under every behavior.
That uses the existing model, but adds source organization to diagrams whose question is which behaviors collaborate.
Globs add matching rules and make the set of owned files less explicit.
Explicit additional paths keep the behavior as one part and preserve the single code-opening action.
