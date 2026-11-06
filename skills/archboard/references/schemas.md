# Canonical schemas

The installed archboard CLI prints the JSON Schema of each model file and request.
It renders them from its own validation, so they match the program that reads and writes the vault.
`archboard model schema` lists the names. `archboard model schema <name>` prints one schema.
Neither needs a server or a vault. Do not copy the schemas into the repository.

- `model-manifest` describes the model identity and current state.
- `module` describes one canonical module and its outgoing relationships.
- `flows` describes one independent flow collection.
- `model-initialize` describes the request for an empty planning model.
- `model-edit` describes one complete authoring intent.
- `model-import` describes explicit portable installation.
- `model-migrate` describes explicit legacy cutover.
- `vault-config` describes shared kinds, relationship evidence, and groups.

Read the [canonical model reference](canonical-models.md) for operation examples.
A valid JSON shape does not establish valid architecture.
The runtime also resolves names, protects stable identities, enforces claims, and compares the complete input revision.
It installs one durable intent through the existing signed journal.
An incomplete transaction refuses ordinary reads until explicit recovery completes.

Legacy levels remain decodable for explicit migration and exact retained history.
Canonical modules use containment without fixed levels.
New authoring never writes a legacy board family or a level.
