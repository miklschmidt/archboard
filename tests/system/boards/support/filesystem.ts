import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Probe whether a directory's filesystem distinguishes two spellings of a
 * filename. The probe is removed even when the filesystem reports an error.
 */
export function filesystemIsCaseSensitive(directory: string): boolean {
	const probe = join(directory, ".archboard-case-probe");
	mkdirSync(probe);
	writeFileSync(join(probe, "A"), "probe");
	try {
		return !existsSync(join(probe, "a"));
	} finally {
		rmSync(probe, { recursive: true, force: true });
	}
}
