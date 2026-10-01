---
status: accepted
---

# Vault diagnostics drive CLI and agent repair

TASK-373 amended this ADR on 2026-09-29. Fix with Codex sends its request as a
message of the browser tab, so the request runs on the workhorse of that tab. If
the tab has no workhorse yet, the message creates one, as every first message
does. No step links an existing thread any more. Everything else stands.

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
- A bell beside theme and settings in the top-right shell shows a dot whenever
  the vault currently has warnings or errors. It opens the shared diagnostics
  and offers Fix with Codex.
- Fix with Codex uses the existing linked workhorse. When none is available, it
  uses the existing link/create flow. It prompts the workhorse to run the
  checker and to repair obvious issues. If a repair is ambiguous, the prompt
  tells the workhorse to ask the person. Requests use the existing busy queue.
  After the workhorse finishes, the shell runs the check again and clears only
  diagnostics that are actually resolved.
- The browser remains a viewer. Repair happens through ordinary agent board
  writes, including claims and version checks. Diagnostics grant no write
  bypass.

[ADR 0024](0024-vault-configuration-owns-vocabulary-and-presentation.md) records
the configuration ownership and vocabulary contract. The viewer boundary and the
absence of browser-owned board state follow
[ADR 0023](0023-semantic-boards-own-meaning-renderers-own-presentation.md).
