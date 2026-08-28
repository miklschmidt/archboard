import { spawn, type ChildProcess, type ChildProcessWithoutNullStreams } from "node:child_process";
import {
	closeSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	openSync,
	readFileSync,
	rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const packageSchema = z.object({
	version: z.string(),
	bin: z.object({ archboard: z.string() }),
});

export const checkoutRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
export const packageRecord = packageSchema.parse(
	JSON.parse(readFileSync(join(checkoutRoot, "package.json"), "utf8")),
);
export const packageBin = resolve(checkoutRoot, packageRecord.bin.archboard);

export interface PackageRunOptions {
	url?: string;
	input?: string;
	cwd?: string;
}

export interface PackageRunResult {
	command: readonly string[];
	cwd: string;
	status: number | null;
	signal: NodeJS.Signals | null;
	stdout: string;
	stderr: string;
	events: readonly string[];
}

const resultSchema = z.object({
	command: z.array(z.string()),
	cwd: z.string(),
	status: z.number().nullable(),
	signal: z.custom<NodeJS.Signals>().nullable(),
	stdout: z.string(),
	stderr: z.string(),
	events: z.array(z.string()),
});

export function packageFailure(result: PackageRunResult): string {
	return [
		`command: ${result.command.join(" ")}`,
		`cwd: ${result.cwd}`,
		`status: ${result.status ?? "null"}`,
		`signal: ${result.signal ?? "null"}`,
		`stdout:\n${result.stdout}`,
		`stderr:\n${result.stderr}`,
	].join("\n");
}

export interface PackageCliOwner {
	readonly outside: string;
	readonly home: string;
	readonly state: string;
	readonly log: string;
	readonly registry: string;
	readonly vault: string;
	run(args: readonly string[], options?: PackageRunOptions): Promise<PackageRunResult>;
	runMerged(
		args: readonly string[],
		options?: PackageRunOptions,
		observed?: string[],
	): Promise<PackageRunResult & { merged: string }>;
	dispose(): Promise<void>;
	[Symbol.asyncDispose](): Promise<void>;
}

const clearedEnvironment = {
	CODEX_HOME: undefined,
	LOCALAPPDATA: undefined,
	EXPRESS_SERVER_URL: undefined,
	ENABLE_CANVAS_SYNC: undefined,
	ARCHBOARD_INJECT: undefined,
	ARCHBOARD_INJECT_LOUD: undefined,
	ARCHBOARD_INJECT_THREAD: undefined,
	ARCHBOARD_INJECT_DEBOUNCE_MS: undefined,
	ARCHBOARD_INJECT_MIN_INTERVAL_MS: undefined,
	ARCHBOARD_SETTLE_MS: undefined,
	ARCHBOARD_SETTLE_MAX_MS: undefined,
} as const;

export function createPackageCliOwner(): PackageCliOwner {
	const outside = mkdtempSync(join(tmpdir(), "archboard-package-cli-"));
	const home = join(outside, "home");
	const state = join(outside, "state");
	const log = join(outside, "logs", "archboard.log");
	const registry = join(outside, "repos.json");
	const vault = join(outside, "vault");
	for (const directory of [home, state, dirname(log), vault])
		mkdirSync(directory, { recursive: true });
	const children = new Set<ChildProcess>();
	let disposed = false;
	const environment = (url?: string): NodeJS.ProcessEnv => ({
		...process.env,
		...clearedEnvironment,
		HOME: home,
		XDG_STATE_HOME: state,
		LOG_FILE_PATH: log,
		ARCHBOARD_REPOS: registry,
		ARCHBOARD_VAULT: vault,
		EXCALIDRAW_NO_AUTOSTART: "1",
		...(url ? { EXPRESS_SERVER_URL: url } : {}),
	});

	const baseSpawn = (
		args: readonly string[],
		options: PackageRunOptions,
		stdio: ["pipe", "pipe", "pipe"] | ["ignore", number, number],
	) => {
		if (disposed) throw new Error("Package CLI owner is disposed.");
		const cwd = options.cwd ?? outside;
		const child = spawn(packageBin, [...args], {
			cwd,
			env: environment(options.url),
			stdio,
		});
		return { child, cwd, command: [packageBin, ...args] };
	};

	const run = (args: readonly string[], options: PackageRunOptions = {}) =>
		new Promise<PackageRunResult>((resolveRun) => {
			const launched = baseSpawn(args, options, ["pipe", "pipe", "pipe"]);
			const child = launched.child as ChildProcessWithoutNullStreams;
			children.add(child);
			const events: string[] = [];
			let stdout = "";
			let stderr = "";
			child.stdout.setEncoding("utf8");
			child.stderr.setEncoding("utf8");
			child.stdout.on("data", (chunk: string) => {
				stdout += chunk;
				events.push(`stdout:${chunk}`);
			});
			child.stderr.on("data", (chunk: string) => {
				stderr += chunk;
				events.push(`stderr:${chunk}`);
			});
			const timeout = setTimeout(() => child.kill("SIGKILL"), 20_000);
			const finish = (status: number | null, signal: NodeJS.Signals | null) => {
				clearTimeout(timeout);
				children.delete(child);
				events.push(`exit:${status}`);
				resolveRun(resultSchema.parse({ ...launched, status, signal, stdout, stderr, events }));
			};
			child.once("error", (error) => {
				stderr += error.message;
			});
			child.once("close", finish);
			child.stdin.end(options.input);
		});

	const runMerged = (
		args: readonly string[],
		options: PackageRunOptions = {},
		observed: string[] = [],
	) =>
		new Promise<PackageRunResult & { merged: string }>((resolveRun) => {
			const mergedPath = join(outside, `merged-${Date.now()}-${Math.random()}.log`);
			const descriptor = openSync(mergedPath, "w+");
			const launched = baseSpawn(args, options, ["ignore", descriptor, descriptor]);
			const child = launched.child;
			children.add(child);
			const timeout = setTimeout(() => child.kill("SIGKILL"), 20_000);
			child.once("close", (status, signal) => {
				clearTimeout(timeout);
				children.delete(child);
				closeSync(descriptor);
				observed.push(`exit:${status}`);
				const result = resultSchema.parse({
					...launched,
					status,
					signal,
					stdout: "",
					stderr: "",
					events: observed,
				});
				resolveRun({ ...result, merged: readFileSync(mergedPath, "utf8") });
			});
		});

	const dispose = async () => {
		if (disposed) return;
		disposed = true;
		const exits = [...children].map(
			(child) =>
				new Promise<void>((resolveExit) => {
					if (child.exitCode !== null || child.signalCode !== null) return resolveExit();
					child.once("close", () => resolveExit());
					child.kill("SIGKILL");
				}),
		);
		await Promise.allSettled(exits);
		if (existsSync(outside)) rmSync(outside, { recursive: true, force: true });
	};
	return {
		outside,
		home,
		state,
		log,
		registry,
		vault,
		run,
		runMerged,
		dispose,
		[Symbol.asyncDispose]: dispose,
	};
}
