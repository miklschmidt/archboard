import { createServer } from "node:net";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { z } from "zod";

export const HealthSchema = z.object({ pid: z.number().int().positive() }).passthrough();
export const ReadySchema = z.object({ pid: z.number().int().positive() }).passthrough();

export type ChildEnvironment = Record<string, string | undefined>;

const CLEARED = new Set([
	"LOCALAPPDATA",
	"CODEX_HOME",
	"EXPRESS_SERVER_URL",
	"ENABLE_CANVAS_SYNC",
	"ARCHBOARD_REPOS",
	"ARCHBOARD_SETTLE_MS",
	"ARCHBOARD_SETTLE_MAX_MS",
	"HOST",
	"PORT",
	"EXCALIDRAW_NO_AUTOSTART",
]);

export function sanitizedEnvironment(
	root: string,
	vault: string,
	inherited: ChildEnvironment = process.env,
): ChildEnvironment {
	const env: ChildEnvironment = { ...inherited };
	for (const key of Object.keys(env)) {
		if (CLEARED.has(key) || key.startsWith("ARCHBOARD_INJECT")) delete env[key];
	}
	return {
		...env,
		HOME: join(root, "home"),
		XDG_STATE_HOME: join(root, "state"),
		LOG_FILE_PATH: join(root, "archboard.log"),
		ARCHBOARD_VAULT: vault,
		LOG_LEVEL: "error",
		NO_COLOR: "1",
	};
}

export async function availablePort(): Promise<number> {
	const server = createServer();
	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen({ host: "127.0.0.1", port: 0, exclusive: true }, resolve);
	});
	const address = server.address();
	if (!address || typeof address === "string") throw new Error("Port probe returned no TCP port.");
	await new Promise<void>((resolve, reject) =>
		server.close((error) => (error ? reject(error) : resolve())),
	);
	return address.port;
}

export async function portIsReusable(port: number): Promise<boolean> {
	const server = createServer();
	try {
		await new Promise<void>((resolve, reject) => {
			server.once("error", reject);
			server.listen({ host: "127.0.0.1", port, exclusive: true }, resolve);
		});
		return true;
	} catch {
		return false;
	} finally {
		if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
	}
}

export interface CliProcessResult {
	argv: string[];
	cwd: string;
	status: number | null;
	signal: NodeJS.Signals | null;
	error?: Error;
	stdout: string;
	stderr: string;
}

function cliDiagnostics(result: CliProcessResult): string {
	return JSON.stringify(
		{
			argv: result.argv,
			cwd: result.cwd,
			status: result.status,
			signal: result.signal,
			error: result.error?.message,
			stdout: result.stdout,
			stderr: result.stderr,
		},
		null,
		2,
	);
}

export function parseCliJson<T>(result: CliProcessResult, schema: z.ZodType<T>): T {
	let payload: unknown;
	try {
		payload = JSON.parse(result.stdout);
	} catch (error) {
		throw new Error(`CLI stdout was not JSON.\n${cliDiagnostics(result)}`, { cause: error });
	}
	const parsed = schema.safeParse(payload);
	if (!parsed.success)
		throw new Error(`CLI JSON failed schema validation.\n${cliDiagnostics(result)}`, {
			cause: parsed.error,
		});
	return parsed.data;
}

export function runCli(options: {
	repoRoot: string;
	root: string;
	vault: string;
	base: string;
	args: string[];
	stdin?: string;
}): CliProcessResult {
	const env = sanitizedEnvironment(options.root, options.vault);
	env.EXPRESS_SERVER_URL = options.base;
	env.EXCALIDRAW_NO_AUTOSTART = "1";
	const argv = [process.execPath, join(options.repoRoot, "src/bin.ts"), ...options.args];
	const result = spawnSync(argv[0]!, argv.slice(1), {
		cwd: options.repoRoot,
		env,
		input: options.stdin ?? "",
		encoding: "utf8",
	});
	return {
		argv,
		cwd: options.repoRoot,
		status: result.status,
		signal: result.signal,
		error: result.error,
		stdout: result.stdout,
		stderr: result.stderr,
	};
}
