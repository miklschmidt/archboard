import fs from "fs";
import { fileURLToPath } from "url";
import { z } from "zod";

const packageManifest = z.object({ version: z.string() });

/**
 * The package version, read from package.json so the CLI's `--version` can
 * never drift from what is published.
 * @returns The version string, or "unknown" when the manifest cannot be read.
 */
export function packageVersion(): string {
	try {
		const pkgPath = fileURLToPath(new URL("../../../package.json", import.meta.url));
		return packageManifest.parse(JSON.parse(fs.readFileSync(pkgPath, "utf-8"))).version;
	} catch {
		return "unknown";
	}
}
