---
status: accepted
---

# Vault diagnostics drive CLI and agent repair

Vault vocabulary and presentation configuration is version-controlled YAML. It
has a schema, and the CLI makes sure that the configuration matches it. The
configuration is shared product input, not private renderer state. Missing or
invalid configuration uses the bundled renderer defaults and produces visible
diagnostics. It must not crash rendering. It must not silently preserve the last
valid configuration. TASK-203 accepted this design on 2026-09-13.

## Contract

- A real CLI command runs the check on the whole vault. The browser and the CLI
  consume the same diagnostics. The agent skill instructs agents to run the
  check after board work.
- While configuration is missing or invalid, structurally valid board edits stay
  possible and return the configuration warning. Vocabulary validation resumes
  as soon as the configuration becomes valid.
- With valid configuration, writes reject newly authored unknown node types,
  relationship types, and levels. Missing required metadata stays an error
  whether or not configuration is available. Existing subjects whose definitions
  were removed stay readable with gray/default presentation. Touching them
  produces a CLI warning, so vocabulary changes do not make existing boards
  inaccessible.
- The browser remains a viewer. Repair happens through ordinary agent board
  writes, including claims and version checks. Diagnostics grant no write
  bypass.

[ADR 0024](0024-vault-configuration-owns-vocabulary-and-presentation.md) records
the configuration ownership and vocabulary contract. The viewer boundary and the
absence of browser-owned board state follow
[ADR 0023](0023-semantic-boards-own-meaning-renderers-own-presentation.md).
