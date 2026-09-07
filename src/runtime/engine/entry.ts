import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { logger } from "@/runtime/engine/logger";
import { errorCode, errorMessage } from "@/runtime/engine/lib/thrown-error";

/**
 * The real path of a script, so symlinked bins compare equal to their target.
 * Falls back to a plain resolve when the file cannot be realpath'd, logging
 * anything other than a missing file.
 * @param filePath The script path to canonicalise; nothing when unknown.
 * @returns The canonical path, or null when no path was given.
 */
function resolveEntrypointPath(filePath: string | undefined): string | null {
	if (!filePath) {
		return null;
	}

	try {
		return fs.realpathSync(filePath);
	} catch (error) {
		const code = errorCode(error);
		if (code !== "ENOENT") {
			logger.warn(`fs.realpathSync failed for "${filePath}", falling back to path.resolve.`, {
				code,
				error: errorMessage(error),
			});
		}
		return path.resolve(filePath);
	}
}

/**
 * Whether the module at a URL is the process entry point. npm and npx invoke
 * package bins through symlinks, so real paths are compared (issues #65, #67,
 * #79).
 * @param moduleUrl The calling module's `import.meta.url`.
 * @returns True when that module is what the process was started with.
 */
function isMainModule(moduleUrl: string): boolean {
	return resolveEntrypointPath(fileURLToPath(moduleUrl)) === resolveEntrypointPath(process.argv[1]);
}

export { resolveEntrypointPath, isMainModule };
