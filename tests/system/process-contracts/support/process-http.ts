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
	"HOST",
	"PORT",
	"EXCALIDRAW_NO_AUTOSTART",
]);

export function sanitizedEnvironment(root: string, vault: string): ChildEnvironment {
	const env: ChildEnvironment = { ...process.env };
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

export function runCli(options: {
	repoRoot: string;
	root: string;
	vault: string;
	base: string;
	args: string[];
	stdin?: string;
}): { status: number | null; stdout: string; stderr: string } {
	const env = sanitizedEnvironment(options.root, options.vault);
	env.EXPRESS_SERVER_URL = options.base;
	env.EXCALIDRAW_NO_AUTOSTART = "1";
	return spawnSync(process.execPath, [join(options.repoRoot, "src/bin.ts"), ...options.args], {
		cwd: options.repoRoot,
		env,
		input: options.stdin ?? "",
		encoding: "utf8",
	});
}
