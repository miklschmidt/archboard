import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { closeSync, existsSync, mkdtempSync, openSync, readFileSync, rmSync } from "node:fs";
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
	env?: Readonly<Record<string, string | undefined>>;
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
	run(args: readonly string[], options?: PackageRunOptions): Promise<PackageRunResult>;
	runMerged(
		args: readonly string[],
		options?: PackageRunOptions,
	): Promise<PackageRunResult & { merged: string }>;
	dispose(): Promise<void>;
}

export function createPackageCliOwner(): PackageCliOwner {
	const outside = mkdtempSync(join(tmpdir(), "archboard-package-cli-"));
	const children = new Set<ChildProcessWithoutNullStreams>();
	let disposed = false;

	const baseSpawn = (
		args: readonly string[],
		options: PackageRunOptions,
		stdio: ["pipe", "pipe", "pipe"] | ["ignore", number, number],
	) => {
		if (disposed) throw new Error("Package CLI owner is disposed.");
		const cwd = options.cwd ?? outside;
		const child = spawn(packageBin, [...args], {
			cwd,
			env: {
				...process.env,
				EXCALIDRAW_NO_AUTOSTART: "1",
				...(options.url ? { EXPRESS_SERVER_URL: options.url } : {}),
				...options.env,
			},
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

	const runMerged = (args: readonly string[], options: PackageRunOptions = {}) =>
		new Promise<PackageRunResult & { merged: string }>((resolveRun) => {
			const mergedPath = join(outside, `merged-${Date.now()}-${Math.random()}.log`);
			const descriptor = openSync(mergedPath, "w+");
			const launched = baseSpawn(args, options, ["ignore", descriptor, descriptor]);
			const child = launched.child;
			children.add(child as ChildProcessWithoutNullStreams);
			const timeout = setTimeout(() => child.kill("SIGKILL"), 20_000);
			child.once("close", (status, signal) => {
				clearTimeout(timeout);
				children.delete(child as ChildProcessWithoutNullStreams);
				closeSync(descriptor);
				const result = resultSchema.parse({
					...launched,
					status,
					signal,
					stdout: "",
					stderr: "",
					events: [`exit:${status}`],
				});
				resolveRun({ ...result, merged: readFileSync(mergedPath, "utf8") });
			});
		});

	return {
		outside,
		run,
		runMerged,
		async dispose() {
			if (disposed) return;
			disposed = true;
			const exits = [...children].map(
				(child) =>
					new Promise<void>((resolveExit) => {
						child.once("close", () => resolveExit());
						child.kill("SIGKILL");
					}),
			);
			await Promise.allSettled(exits);
			if (existsSync(outside)) rmSync(outside, { recursive: true, force: true });
		},
	};
}
