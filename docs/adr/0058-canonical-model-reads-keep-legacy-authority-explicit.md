---
status: accepted
---

# Canonical model reads keep legacy authority explicit

TASK-549.01 introduces an explicit read path for authored canonical module models.
It extends the existing `@archboard/board` runtime and shared Zod contracts.
The CLI and server return that runtime result without assembling another graph.

Each vault contains one `model.json` manifest and recursively discovered `.module.json` files.
Every document declares `schemaVersion: 1`.
The manifest holds the model identity, current-state metadata, and optional retired identities.
Each module owns its definition and outgoing relationships.
Incoming relationships come from the complete returned relationship list.

A qualified identity uses `model[/original-board]#local-id`.
Each segment follows the existing short ID authority.
The optional original board identifies imported provenance, without owning architecture or navigation.
The manifest model ID supplies the default namespace for fresh subjects.
Names and filenames never establish identity.
Name lookup succeeds only when exactly one module matches its current or former name.
An exact qualified ID takes precedence over a matching name.

The reader validates the complete module forest and all local relationship targets.
Dependencies can cycle.
Modules and outgoing relationships follow authored `order`, with qualified IDs as deterministic tie breakers.
The reader preserves groups, bindings, evidence anchors, descriptions, traffic, and document references through their existing schemas.
The existing `.archboard/config.yaml` remains the policy authority inside the addressed vault.
Canonical reads require valid policy instead of the legacy reader's fallback defaults.

The revision lists normalized relative input paths and SHA-256 hashes of exact bytes.
Its digest hashes the UTF-8 JSON encoding of that ordered list.
A second discovery and capture must agree before the reader returns a coherent model.
Changes during observation produce a structured refusal with a recovery action.
This detects changing inputs without promising atomic visibility to arbitrary external file readers.
Reads write no timestamps, counters, migrations, or derived files.

Legacy `.semantic.json` files remain authoritative until explicit migration.
Their presence refuses a canonical read, even when a manifest also exists.
Later authored collections also refuse the read until their supported reader exists.
This avoids silently dropping required architecture.
The delivery adds no canonical writer, archive, proposal patches, or migration.

For authored canonical models, this decision replaces the independent board ownership described in ADR 0015 and ADR 0023.
It also replaces the fixed board-level navigation described in ADR 0029.
Canonical containment describes architecture without fixed levels or drill-down boards.
Those earlier contracts still govern legacy vaults.
Agents author meaning, browsers own presentation, and every request names its vault.

The public runtime operation is `readArchitectureModel(vault, module?)` through `@archboard/board/store-read`.
The shared result is `ArchitectureModelRead` through `@archboard/board/model`.
The server exposes `GET /api/architecture/model?vault=<directory>&module=<selector>`.
The CLI exposes `archboard model read [module] -C <directory>`.
An unsuccessful CLI read returns structured JSON and exit status 2.
