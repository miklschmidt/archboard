# Canonical schemas

Before preparing a request, print its schema with the installed archboard CLI.
`archboard model schema` lists the names. `archboard model schema <name>` prints one schema.
The CLI renders them from its own validation, so they match the program that reads and writes the vault.
Neither command needs a server or a vault. Do not copy the schemas into the repository.
Use [canonical models](canonical-models.md) for operations and semantic rules beyond JSON structure.

| Name               | Use                                             |
| ------------------ | ----------------------------------------------- |
| `model-manifest`   | Model identity and current state                |
| `module`           | A module and its outgoing relationships         |
| `flows`            | An independent flow collection                  |
| `model-initialize` | Empty planning model request                    |
| `model-edit`       | Complete authoring intent                       |
| `model-import`     | Portable installation request                   |
| `model-migrate`    | Legacy migration request                        |
| `vault-config`     | Shared kinds, relationship evidence, and groups |

Canonical modules use containment without fixed levels.
Legacy levels exist only for explicit migration and exact retained history.
New authoring writes neither legacy board families nor levels.
