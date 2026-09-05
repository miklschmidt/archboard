import { createServer } from "node:net";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { z } from "zod";

const HealthSchema = z.looseObject({ pid: z.number().int().positive() });
const ReadySchema = z.looseObject({ pid: z.number().int().positive() });

type ChildEnvironment = Record<string, string | undefined>;

function sanitizedEnvironment(
	root: string,
	vault: string,
	inherited: Readonly<ChildEnvironment> = process.env,
): ChildEnvironment {
	const env: ChildEnvironment = inherited["PATH"] === undefined ? {} : { PATH: inherited["PATH"] };
	return {
		...env,
		HOME: path.join(root, "home"),
		XDG_STATE_HOME: path.join(root, "state"),
		LOG_FILE_PATH: path.join(root, "archboard.log"),
		ARCHBOARD_VAULT: vault,
		LOG_LEVEL: "error",
		NO_COLOR: "1",
	};
}

async function availablePort(): Promise<number> {
	const server = createServer();
	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen({ host: "127.0.0.1", port: 0, exclusive: true }, resolve);
	});
	const address = server.address();
	if (address === null || typeof address === "string") {
		throw new Error("Port probe returned no TCP port.");
	}
	await new Promise<void>((resolve, reject) => {
		server.close((...errors: readonly [Readonly<Error>?]) => {
			const [error] = errors;
			if (error === undefined) {
				resolve();
			} else {
				reject(error);
			}
		});
	});
	return address.port;
}

async function portIsReusable(port: number): Promise<boolean> {
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
		if (server.listening) {
			await new Promise<void>((resolve) => {
				server.close(() => {
					resolve();
				});
			});
		}
	}
}

interface CliProcessResult {
	readonly argv: readonly string[];
	readonly cwd: string;
	readonly status: number | null;
	readonly signal: NodeJS.Signals | null;
	readonly error?: Error;
	readonly stdout: string;
	readonly stderr: string;
}

type CliDiagnosticResult = Readonly<Omit<CliProcessResult, "error">> & {
	readonly error?: Readonly<Pick<Error, "message">>;
};

function cliDiagnostics(result: CliDiagnosticResult): string {
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

function parseCliJson<T>(
	result: CliDiagnosticResult,
	schema: Readonly<Pick<z.ZodType<T>, "safeParse">>,
): T {
	let payload: unknown;
	try {
		payload = JSON.parse(result.stdout);
	} catch (error) {
		throw new Error(`CLI stdout was not JSON.\n${cliDiagnostics(result)}`, { cause: error });
	}
	const parsed = schema.safeParse(payload);
	if (!parsed.success) {
		throw new Error(`CLI JSON failed schema validation.\n${cliDiagnostics(result)}`, {
			cause: parsed.error,
		});
	}
	return parsed.data;
}

function runCli(
	options: Readonly<{
		repoRoot: string;
		root: string;
		vault: string;
		base: string;
		args: readonly string[];
		stdin?: string;
	}>,
): CliProcessResult {
	const env: ChildEnvironment = {
		...sanitizedEnvironment(options.root, options.vault),
		EXPRESS_SERVER_URL: options.base,
		EXCALIDRAW_NO_AUTOSTART: "1",
	};
	const executable = process.execPath;
	const argv = [executable, path.join(options.repoRoot, "src/bin.ts"), ...options.args] as const;
	const result = spawnSync(executable, argv.slice(1), {
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
		...(result.error === undefined ? {} : { error: result.error }),
		stdout: result.stdout,
		stderr: result.stderr,
	};
}

export {
	HealthSchema,
	ReadySchema,
	availablePort,
	parseCliJson,
	portIsReusable,
	runCli,
	sanitizedEnvironment,
};
export type { ChildEnvironment, CliProcessResult };
