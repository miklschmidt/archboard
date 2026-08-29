import { spawn, type ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";

import type { ZodType } from "zod";

import type { ChildEnvironment } from "./process-http.ts";

type Child = ChildProcessByStdio<null, Readable, Readable>;
type Exit = { code: number | null; signal: NodeJS.Signals | null };
type Terminal = Exit | { error: Error };

function observeChild(child: Child, onError: (error: Error) => void) {
	let terminated = false;
	let exited = false;
	let resolveExit!: (exit: Exit) => void;
	const exit = new Promise<Exit>((resolve) => (resolveExit = resolve));
	const terminal = new Promise<Terminal>((resolve) => {
		child.once("error", (error) => {
			terminated = true;
			onError(error);
			resolve({ error });
		});
		child.once("exit", (code, signal) => {
			const result = { code, signal };
			terminated = true;
			exited = true;
			resolveExit(result);
			resolve(result);
		});
	});
	return { terminal, exit, isTerminated: () => terminated, isExited: () => exited };
}

export interface OwnedPeer<T> {
	readonly child: Child;
	readonly pid: number;
	readonly ready: T;
	readonly stderr: string;
	readonly exit: Promise<Exit>;
	dispose(): Promise<void>;
}

export interface PeerOptions<T> {
	argv: string[];
	env: ChildEnvironment;
	readySchema: ZodType<T>;
	readyTimeoutMs?: number;
}

export async function runOwnedPeerToExit(options: {
	argv: string[];
	env: ChildEnvironment;
	timeoutMs?: number;
}): Promise<Exit & { stdout: string; stderr: string; pid: number }> {
	const child = spawn(options.argv[0]!, options.argv.slice(1), {
		env: options.env,
		stdio: ["ignore", "pipe", "pipe"],
	});
	let stdout = "";
	let stderr = "";
	child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
	child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
	const lifecycle = observeChild(child, (error) => (stderr += `\nspawn error: ${error.message}`));
	const pid = child.pid;
	if (!pid) {
		await stopChild(child, lifecycle);
		throw new Error(`Owned peer has no PID. stdout=${stdout}\nstderr=${stderr}`);
	}
	const result = await Promise.race([
		lifecycle.terminal,
		delay(options.timeoutMs ?? 5_000).then(() => null),
	]);
	if (!result) {
		await stopChild(child, lifecycle);
		throw new Error(`Owned peer did not exit. stdout=${stdout}\nstderr=${stderr}`);
	}
	if ("error" in result) {
		await stopChild(child, lifecycle);
		throw new Error(`Owned peer failed. stdout=${stdout}\nstderr=${stderr}`, {
			cause: result.error,
		});
	}
	return { ...result, stdout, stderr, pid };
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function stopChild(child: Child, lifecycle: ReturnType<typeof observeChild>): Promise<void> {
	if (!child.pid) {
		await lifecycle.terminal;
		return;
	}
	if (!lifecycle.isExited()) child.kill("SIGTERM");
	if (
		!lifecycle.isExited() &&
		!(await Promise.race([lifecycle.exit.then(() => true), delay(2_000).then(() => false)]))
	)
		child.kill("SIGKILL");
	if (!lifecycle.isExited()) await lifecycle.exit;
}

export async function startOwnedPeer<T>({
	argv,
	env,
	readySchema,
	readyTimeoutMs = 5_000,
}: PeerOptions<T>): Promise<OwnedPeer<T>> {
	const child = spawn(argv[0]!, argv.slice(1), {
		env,
		stdio: ["ignore", "pipe", "pipe"],
	});
	let stderr = "";
	let stdout = "";
	child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
	child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
	const lifecycle = observeChild(child, (error) => (stderr += `\nspawn error: ${error.message}`));
	const pid = child.pid;
	if (!pid) {
		await stopChild(child, lifecycle);
		throw new Error(`Owned peer has no PID. stdout=${stdout}\nPeer stderr:\n${stderr}`);
	}
	const exit = lifecycle.exit;

	let disposal: Promise<void> | undefined;
	const dispose = (): Promise<void> => {
		disposal ??= (async () => {
			await stopChild(child, lifecycle);
		})();
		return disposal;
	};

	try {
		const deadline = Date.now() + readyTimeoutMs;
		while (Date.now() < deadline) {
			const line = stdout.split("\n").find((candidate) => candidate.trim().startsWith("{"));
			if (line) {
				let payload: unknown;
				try {
					payload = JSON.parse(line);
				} catch (error) {
					throw new Error(`Peer readiness JSON was invalid: ${line}\nPeer stderr:\n${stderr}`, {
						cause: error,
					});
				}
				const parsed = readySchema.safeParse(payload);
				if (!parsed.success)
					throw new Error(
						`Peer readiness failed schema validation: ${JSON.stringify(payload)}\n${parsed.error.message}\nPeer stderr:\n${stderr}`,
					);
				if ((parsed.data as { pid?: number }).pid !== child.pid)
					throw new Error(
						`Peer readiness PID ${(parsed.data as { pid?: number }).pid ?? "missing"} did not equal child PID ${child.pid}.\nPeer stderr:\n${stderr}`,
					);
				return {
					child,
					pid: child.pid,
					ready: parsed.data,
					get stderr() {
						return stderr;
					},
					exit,
					dispose,
				};
			}
			if (lifecycle.isTerminated()) {
				const result = await lifecycle.terminal;
				throw new Error(`Peer died before readiness. stdout=${stdout}\nPeer stderr:\n${stderr}`, {
					cause: "error" in result ? result.error : undefined,
				});
			}
			await delay(20);
		}
		throw new Error(`Peer readiness timed out. stdout=${stdout}\nPeer stderr:\n${stderr}`);
	} catch (error) {
		await dispose();
		throw error;
	}
}
