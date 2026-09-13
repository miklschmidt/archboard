---
status: accepted
---

# Vault diagnostics drive CLI and agent repair

Vault vocabulary and presentation configuration is version-controlled YAML with a
validated schema and CLI because it is shared product input, not private renderer
state. Missing or invalid configuration uses the bundled renderer defaults and
produces visible diagnostics; it must not crash rendering or silently preserve the
last valid configuration. This design was accepted in TASK-203 on 2026-09-13.

## Contract

- A real CLI command checks the whole vault. The browser and CLI consume the same
  diagnostics, and the agent skill instructs agents to run the check after board work.
- While configuration is missing or invalid, structurally valid board edits remain
  possible and return the configuration warning. Vocabulary validation resumes as
  soon as the configuration becomes valid.
- With valid configuration, writes reject newly authored unknown node types,
  relationship types, and levels. Missing required metadata remains an error
  regardless of configuration availability. Existing
  subjects whose definitions were removed remain readable with gray/default
  presentation; touching them produces a CLI warning so vocabulary changes do not
  make existing boards inaccessible.
- A bell beside theme and settings in the top-right shell shows a dot whenever the
  vault currently has warnings or errors. It opens the shared diagnostics and offers
  **Fix with Codex**.
- **Fix with Codex** uses the existing linked workhorse, or the existing link/create
  flow when none is available, and prompts it to run the checker, repair obvious
  issues, and ask the person when a repair is ambiguous. Requests use the existing
  busy queue. After the workhorse finishes, the shell checks again and clears only
  diagnostics that are actually resolved.
- The browser remains a viewer. Repair happens through ordinary agent board writes,
  including claims and version checks; diagnostics grant no write bypass.

The configuration ownership and vocabulary contract is recorded in
[ADR 0024](0024-vault-configuration-owns-vocabulary-and-presentation.md). The
viewer boundary and absence of browser-owned board state follow
[ADR 0023](0023-semantic-boards-own-meaning-renderers-own-presentation.md).
