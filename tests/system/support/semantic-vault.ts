import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const TEST_SEMANTIC_LEVELS = ["system", "service", "module"] as const;

/**
 * Give a temporary test vault the semantic-level vocabulary production reads.
 * A fixture that already supplied a configuration keeps ownership of it.
 * @param vault The temporary vault a test owns.
 */
function ensureSemanticVaultConfiguration(vault: string): void {
	const directory = join(vault, ".archboard");
	const configuration = join(directory, "config.json");
	if (existsSync(configuration)) {
		return;
	}
	mkdirSync(directory, { recursive: true });
	writeFileSync(configuration, `${JSON.stringify({ levels: TEST_SEMANTIC_LEVELS }, null, 2)}\n`);
}

export { TEST_SEMANTIC_LEVELS, ensureSemanticVaultConfiguration };
