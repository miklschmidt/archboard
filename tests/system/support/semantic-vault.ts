import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_SEMANTIC_POLICY } from "@/shared/semantic-policy/index";

const TEST_SEMANTIC_LEVELS = DEFAULT_SEMANTIC_POLICY.levels;

/**
 * Give a temporary test vault the semantic-level vocabulary production reads.
 * A fixture that already supplied a configuration keeps ownership of it.
 * @param vault The temporary vault a test owns.
 */
function ensureSemanticVaultConfiguration(vault: string): void {
	const directory = join(vault, ".archboard");
	const configuration = join(directory, "config.yaml");
	if (existsSync(configuration)) {
		return;
	}
	mkdirSync(directory, { recursive: true });
	writeFileSync(configuration, Bun.YAML.stringify(DEFAULT_SEMANTIC_POLICY));
}

export { TEST_SEMANTIC_LEVELS, ensureSemanticVaultConfiguration };
