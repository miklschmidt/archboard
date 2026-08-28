import { spawn, type ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";

import type { ZodType } from "zod";

import type { ChildEnvironment } from "./process-http.ts";

type Child = ChildProcessByStdio<null, Readable, Readable>;
type Exit = { code: number | null; signal: NodeJS.Signals | null };

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
	if (!child.pid) throw new Error("Owned peer has no PID.");
	let stdout = "";
	let stderr = "";
	child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
	child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
	const exit = new Promise<Exit>((resolve, reject) => {
		child.once("error", reject);
		child.once("exit", (code, signal) => resolve({ code, signal }));
	});
	const result = await Promise.race([exit, delay(options.timeoutMs ?? 5_000).then(() => null)]);
	if (!result) {
		child.kill("SIGTERM");
		if (!(await Promise.race([exit.then(() => true), delay(2_000).then(() => false)])))
			child.kill("SIGKILL");
		await exit;
		throw new Error(`Owned peer did not exit. stdout=${stdout}\nstderr=${stderr}`);
	}
	return { ...result, stdout, stderr, pid: child.pid };
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
	if (!child.pid) throw new Error("Owned peer has no PID.");
	let stderr = "";
	let stdout = "";
	let settled = false;
	let resolveExit!: (exit: Exit) => void;
	const exit = new Promise<Exit>((resolve) => (resolveExit = resolve));
	child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
	child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
	child.once("error", (error) => {
		stderr += `\nspawn error: ${error.message}`;
	});
	child.once("exit", (code, signal) => {
		settled = true;
		resolveExit({ code, signal });
	});

	let disposal: Promise<void> | undefined;
	const dispose = (): Promise<void> => {
		disposal ??= (async () => {
			if (!settled) child.kill("SIGTERM");
			if (
				!settled &&
				!(await Promise.race([exit.then(() => true), delay(2_000).then(() => false)]))
			)
				child.kill("SIGKILL");
			if (!settled) await exit;
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
			if (settled)
				throw new Error(`Peer died before readiness. stdout=${stdout}\nPeer stderr:\n${stderr}`);
			await delay(20);
		}
		throw new Error(`Peer readiness timed out. stdout=${stdout}\nPeer stderr:\n${stderr}`);
	} catch (error) {
		await dispose();
		throw error;
	}
}
