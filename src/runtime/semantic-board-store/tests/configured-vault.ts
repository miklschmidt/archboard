import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_SEMANTIC_POLICY } from "@/shared/semantic-policy/index";

/**
 * Make the isolated vault a store owner binds before importing production code.
 * @param prefix The temporary-directory prefix identifying the owner.
 * @returns The configured vault path.
 */
function createConfiguredTestVault(prefix: string): string {
	const vault = mkdtempSync(join(tmpdir(), prefix));
	const configurationDirectory = join(vault, ".archboard");
	mkdirSync(configurationDirectory, { recursive: true });
	writeFileSync(
		join(configurationDirectory, "config.yaml"),
		Bun.YAML.stringify(DEFAULT_SEMANTIC_POLICY),
	);
	return vault;
}

export { createConfiguredTestVault };
