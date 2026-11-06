# Canonical schemas

Read the request schema before preparing an operation.
Installation regenerates the schemas under `generated/`.
Do not edit those files.

- `model-manifest.schema.json` describes the model identity and current state.
- `module.schema.json` describes one canonical module and its outgoing relationships.
- `flows.schema.json` describes one independent flow collection.
- `model-initialize.schema.json` describes the request for an empty planning model.
- `model-edit.schema.json` describes one complete authoring intent.
- `model-import.schema.json` describes explicit portable installation.
- `model-migrate.schema.json` describes explicit legacy cutover.
- `vault-config.schema.json` describes shared kinds, relationship evidence, and groups.
- `INSTALL.md` records installation from the active source checkout.

Read the [canonical model reference](canonical-models.md) for operation examples.
A valid JSON shape does not establish valid architecture.
A write resolves names, protects identities, enforces claims, and compares the complete input revision.
A successful write durably installs the complete intent.
An incomplete transaction refuses ordinary reads until explicit recovery completes.

Legacy levels remain decodable for explicit migration and exact retained history.
Canonical modules use containment without fixed levels.
New authoring never writes a legacy board family or a level.
