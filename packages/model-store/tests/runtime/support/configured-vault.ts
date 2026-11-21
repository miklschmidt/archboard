import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultSemanticPolicy } from "@archboard/model-contract";

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
		Bun.YAML.stringify(defaultSemanticPolicy()),
	);
	return vault;
}

export { createConfiguredTestVault };
