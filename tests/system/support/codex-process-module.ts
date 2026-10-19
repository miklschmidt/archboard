import { fileURLToPath } from "node:url";

/**
 * The file that `@archboard/codex-app-server/process` resolves to, which is the api file of the
 * package. Bun's `mock.module` replaces a module by its resolved file, so a fixture that mocks
 * this path replaces what every importer of that public name sees. A server script written to a
 * temporary file embeds this absolute path, because the name would not resolve from there.
 */
export const CODEX_PROCESS_MODULE_PATH = fileURLToPath(
	import.meta.resolve("@archboard/codex-app-server/process"),
);
