# Canonical schemas

Before preparing a request, read its schema under `generated/`.
Installation regenerates these files. Do not edit them.
Use [canonical models](canonical-models.md) for operations and semantic rules beyond JSON structure.

| File                           | Use                                             |
| ------------------------------ | ----------------------------------------------- |
| `model-manifest.schema.json`   | Model identity and current state                |
| `module.schema.json`           | A module and its outgoing relationships         |
| `flows.schema.json`            | An independent flow collection                  |
| `model-initialize.schema.json` | Empty planning model request                    |
| `model-edit.schema.json`       | Complete authoring intent                       |
| `model-import.schema.json`     | Portable installation request                   |
| `model-migrate.schema.json`    | Legacy migration request                        |
| `vault-config.schema.json`     | Shared kinds, relationship evidence, and groups |
| `INSTALL.md`                   | Installation from the active source checkout    |

Canonical modules use containment without fixed levels.
Legacy levels exist only for explicit migration and exact retained history.
New authoring writes neither legacy board families nor levels.
