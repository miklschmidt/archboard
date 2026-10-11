import { accessSync, chmodSync, constants, existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
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

/**
 * agent-browser 0.31.1 ships these native names beside its declared JS entrypoint.
 * Run the native child directly: the vendor wrapper maps a signal exit to success
 * and does not forward termination. Recheck this distribution contract on upgrades.
 */
function nativeBrowserName(): string {
	const platform = process.platform;
	const architecture = process.arch;
	if (
		(platform !== "darwin" && platform !== "linux" && platform !== "win32") ||
		(architecture !== "x64" && architecture !== "arm64")
	) {
		throw new CouldNotRunError(`Unsupported browser CLI platform: ${platform}-${architecture}.`);
	}
	const musl =
		platform === "linux" &&
		(existsSync("/lib/ld-musl-x86_64.so.1") || existsSync("/lib/ld-musl-aarch64.so.1"));
	const nativePlatform = musl ? "linux-musl" : platform;
	const nativeArchitecture = platform === "win32" ? "x64" : architecture;
	return `agent-browser-${nativePlatform}-${nativeArchitecture}${platform === "win32" ? ".exe" : ""}`;
}

/** Resolve the installed package's native CLI, independent of PATH and working directory. */
function agentBrowserCommand(): [string] {
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
		const executable = resolve(
			dirname(resolve(directory, installed.bin["agent-browser"])),
			nativeBrowserName(),
		);
		const stat = statSync(executable);
		if (!stat.isFile()) throw new CouldNotRunError(`Browser CLI is not a file: ${executable}.`);
		if (process.platform !== "win32") {
			try {
				accessSync(executable, constants.X_OK);
			} catch {
				// Bun may omit the vendor postinstall that makes the packaged binary executable.
				chmodSync(executable, stat.mode | 0o111);
				accessSync(executable, constants.X_OK);
			}
		}
		return [executable];
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
			`Browser prerequisite ${JSON.stringify(command)} ended with ${exit}: ${[(result.stdout ?? "").trim(), (result.stderr ?? "").trim()].filter(Boolean).join("\n") || "No output."}`,
		);
	}
	return result.stdout.trim();
}

export { agentBrowserCommand, probeBrowserTool };
