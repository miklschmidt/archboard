import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { z } from "zod";
import { TEST_BROWSER_COMMAND_TIMEOUT_MS } from "../../support/timing.ts";
import { CouldNotRunError } from "./browser-executable.ts";

const repository = resolve(import.meta.dir, "../../../..");
const manifestSchema = z.object({
	version: z.string(),
	bin: z.object({ "agent-browser": z.string() }),
});
const rootSchema = z.object({ devDependencies: z.object({ "agent-browser": z.string() }) });

/** Resolve the installed package's declared CLI, independent of PATH and working directory. */
function agentBrowserCommand(): [string, string] {
	try {
		const expected = rootSchema.parse(
			JSON.parse(readFileSync(resolve(repository, "package.json"), "utf8")),
		);
		const directory = resolve(repository, "node_modules/agent-browser");
		const installed = manifestSchema.parse(
			JSON.parse(readFileSync(resolve(directory, "package.json"), "utf8")),
		);
		if (installed.version !== expected.devDependencies["agent-browser"]) {
			throw new CouldNotRunError(
				"The installed browser CLI differs from the repository pin. Run bun install.",
			);
		}
		return [process.execPath, resolve(directory, installed.bin["agent-browser"])];
	} catch (error) {
		if (error instanceof CouldNotRunError) throw error;
		throw new CouldNotRunError("The browser CLI package is unavailable. Run bun install.", {
			cause: error,
		});
	}
}

/** Run a bounded prerequisite and retain its real failure output. */
function probeBrowserTool(command: readonly string[], environment: NodeJS.ProcessEnv): string {
	const executable = command[0];
	if (!executable) throw new CouldNotRunError("The browser prerequisite has no executable.");
	const result = spawnSync(executable, command.slice(1), {
		env: environment,
		encoding: "utf8",
		stdio: "pipe",
		timeout: TEST_BROWSER_COMMAND_TIMEOUT_MS,
	});
	if (result.error || result.signal || result.status !== 0) {
		const exit =
			result.error?.message ??
			(result.signal ? `signal ${result.signal}` : `exit ${result.status ?? "unknown"}`);
		throw new CouldNotRunError(
			`Browser prerequisite ${JSON.stringify(command)} ended with ${exit}: ${[result.stdout.trim(), result.stderr.trim()].filter(Boolean).join("\n") || "No output."}`,
		);
	}
	return result.stdout.trim();
}

export { agentBrowserCommand, probeBrowserTool };
