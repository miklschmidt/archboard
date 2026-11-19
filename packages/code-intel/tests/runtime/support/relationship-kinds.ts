// The relationship kinds a fixture vault configures, read the way the code check's callers hand
// them over: the vault's own policy, else the bundled one.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { defaultSemanticPolicy, parseDocument } from "@archboard/model-contract";

/**
 * The relationship kinds of a vault.
 * @param vault The vault root.
 * @returns The kinds its configuration states, else the bundled ones.
 * @throws When the vault's configuration is not a policy; the message says why.
 */
function relationshipKindsOf(vault: string) {
	const file = join(vault, ".archboard", "config.yaml");
	if (!existsSync(file)) return defaultSemanticPolicy().relationshipKinds;
	const parsed = parseDocument("vaultConfiguration", Bun.YAML.parse(readFileSync(file, "utf8")));
	if (!parsed.success) throw parsed.error;
	return parsed.data.relationshipKinds ?? defaultSemanticPolicy().relationshipKinds;
}

export { relationshipKindsOf };
