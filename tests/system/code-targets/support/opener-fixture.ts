import cors from "cors";
import express from "express";
import {
	closeSync,
	existsSync,
	mkdtempSync,
	mkdirSync,
	openSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { Server } from "node:http";

import {
	createCodeOpenerPreguard,
	createCodeOpenerRouter,
	type CodeOpenerRouteDependencies,
} from "../../../../src/server/code-opener/index.ts";
import {
	CodeBindingSchema,
	type CodeBinding,
	type OpenerSelection,
} from "../../../../src/shared/code-target/index.ts";
import { TEST_OPENER_LIFECYCLE } from "../../../../src/shared/timing/timing.ts";

const FAKE_OPENER = join(import.meta.dir, "../fixtures/fake-opener.ts");

export interface JsonResult {
	status: number;
	body: unknown;
	headers: Headers;
}

export interface OpenerCapture {
	pid: number;
	target: string;
	extra: string[];
	argv: string[];
}

export interface Invocation {
	selection: OpenerSelection;
	captureDirectory: string;
	releaseFile: string;
	exitDirectory: string;
	waitForCapture(): Promise<OpenerCapture>;
	waitForCaptures(count: number): Promise<OpenerCapture[]>;
	releaseAndWait(): Promise<void>;
	releaseAndWaitForNonrunning(): Promise<void>;
}

export interface OpenerFixture {
	readonly root: string;
	readonly checkout: string;
	readonly repository: string;
	readonly configFile: string;
	readonly base: string;
	request(path: string, init?: RequestInit): Promise<JsonResult>;
	caller(): (path: string, init?: RequestInit) => Promise<JsonResult>;
	invocation(mode: "immediate" | "hold", extra?: string[]): Invocation;
	writeBinding(binding: CodeBinding | null): void;
	restart(): Promise<void>;
	dispose(): Promise<void>;
}

export interface OpenerFixtureOptions {
	defaultDependencies?: boolean;
	routeDependencies?: Partial<CodeOpenerRouteDependencies>;
}

function git(cwd: string, ...args: string[]): void {
	const result = Bun.spawnSync(["git", ...args], { cwd, stdout: "ignore", stderr: "pipe" });
	if (result.exitCode !== 0) throw new Error(result.stderr.toString());
}

function assertBefore(deadline: number, description: string): void {
	if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${description}`);
}

async function waitForFile(file: string, deadline: number): Promise<void> {
	while (!existsSync(file)) {
		assertBefore(deadline, file);
		await Bun.sleep(TEST_OPENER_LIFECYCLE.pollMs);
	}
}

async function waitForCount(directory: string, count: number, deadline: number): Promise<string[]> {
	while (true) {
		const files = readdirSync(directory)
			.filter((file) => file.endsWith(".json"))
			.toSorted();
		if (files.length >= count) return files;
		assertBefore(deadline, `${count} records in ${directory}`);
		await Bun.sleep(TEST_OPENER_LIFECYCLE.pollMs);
	}
}

function captureRecord(value: unknown): OpenerCapture {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new Error("capture must be an object.");
	}
	const record = value as Record<string, unknown>;
	if (!Number.isSafeInteger(record.pid) || (record.pid as number) <= 0) {
		throw new Error("capture.pid must be a positive safe integer.");
	}
	if (typeof record.target !== "string") throw new Error("capture.target must be a string.");
	if (!Array.isArray(record.extra) || !record.extra.every((item) => typeof item === "string")) {
		throw new Error("capture.extra must be an array of strings.");
	}
	if (!Array.isArray(record.argv) || !record.argv.every((item) => typeof item === "string")) {
		throw new Error("capture.argv must be an array of strings.");
	}
	return {
		pid: record.pid as number,
		target: record.target,
		extra: record.extra,
		argv: record.argv,
	};
}

async function readCompleteCaptureBefore(file: string, deadline: number): Promise<OpenerCapture> {
	while (true) {
		const latestRaw = readFileSync(file, "utf8");
		try {
			return captureRecord(JSON.parse(latestRaw));
		} catch (error) {
			if (!(error instanceof Error)) throw error;
			if (Date.now() >= deadline) {
				throw new Error(
					`Timed out waiting for schema-valid opener capture JSON in ${file}; latest raw=${JSON.stringify(latestRaw)}; latest cause=${error.message}`,
					{ cause: error },
				);
			}
			await Bun.sleep(TEST_OPENER_LIFECYCLE.pollMs);
		}
	}
}

export async function readCompleteCapture(
	file: string,
	timeoutMs: number = TEST_OPENER_LIFECYCLE.timeoutMs,
): Promise<OpenerCapture> {
	return readCompleteCaptureBefore(file, Date.now() + timeoutMs);
}

export interface LinuxProcessStatEvidence {
	pid: number;
	state: string;
	processGroup: number;
	running: boolean;
}

export type ProcessCompletion = "absent" | "nonrunning";

export function processCompletionObserved(
	evidence: LinuxProcessStatEvidence | null,
	completion: ProcessCompletion,
): boolean {
	return evidence === null || (completion === "nonrunning" && !evidence.running);
}

function linuxProcessStatPath(pid: number): string {
	if (!Number.isSafeInteger(pid) || pid <= 0) {
		throw new Error(`Invalid Linux process PID ${pid}: expected a positive safe integer.`);
	}
	return `/proc/${pid}/stat`;
}

function invalidLinuxProcessStat(pid: number, diagnostic: string): Error {
	return new Error(
		`Invalid Linux process stat for PID ${pid} at /proc/${pid}/stat: ${diagnostic}.`,
	);
}

export function parseLinuxProcessStat(pid: number, stat: string): LinuxProcessStatEvidence {
	linuxProcessStatPath(pid);
	const delimiter = stat.lastIndexOf(") ");
	const opening = stat.indexOf(" (");
	if (opening <= 0 || delimiter <= opening + 1) {
		throw invalidLinuxProcessStat(pid, "missing the final command delimiter");
	}
	const recordPidToken = stat.slice(0, opening);
	if (!/^\d+$/.test(recordPidToken)) {
		throw invalidLinuxProcessStat(
			pid,
			`record PID ${JSON.stringify(recordPidToken)} is not numeric`,
		);
	}
	const recordPid = Number(recordPidToken);
	if (!Number.isSafeInteger(recordPid) || recordPid !== pid) {
		throw invalidLinuxProcessStat(
			pid,
			`record PID ${recordPidToken} does not match expected PID ${pid}`,
		);
	}
	const fields = stat
		.slice(delimiter + 2)
		.trim()
		.split(/\s+/);
	if (fields.length < 3) {
		throw invalidLinuxProcessStat(pid, "expected state, parent PID, and process group fields");
	}
	const state = fields[0]!;
	const processGroupToken = fields[2]!;
	if (state.length !== 1) {
		throw invalidLinuxProcessStat(pid, `process state ${JSON.stringify(state)} is not one token`);
	}
	if (!/^\d+$/.test(processGroupToken)) {
		throw invalidLinuxProcessStat(
			pid,
			`process group ${JSON.stringify(processGroupToken)} is not a positive safe integer`,
		);
	}
	const processGroup = Number(processGroupToken);
	if (!Number.isSafeInteger(processGroup) || processGroup <= 0) {
		throw invalidLinuxProcessStat(
			pid,
			`process group ${JSON.stringify(processGroupToken)} is not a positive safe integer`,
		);
	}
	if (["Z", "X", "x"].includes(state)) {
		return { pid, state, processGroup, running: false };
	}
	if (!["R", "S", "D", "T", "t", "W", "K", "P", "I"].includes(state)) {
		throw invalidLinuxProcessStat(pid, `unknown process state ${JSON.stringify(state)}`);
	}
	return { pid, state, processGroup, running: true };
}

export function readLinuxProcessStatEvidence(pid: number): LinuxProcessStatEvidence | null {
	const statPath = linuxProcessStatPath(pid);
	let stat: string;
	try {
		stat = readFileSync(statPath, "utf8");
	} catch (error) {
		const failure = error as NodeJS.ErrnoException;
		if (failure.code === "ENOENT" || failure.code === "ESRCH") return null;
		throw new Error(
			`Could not read Linux process stat for PID ${pid} at ${statPath}: ${failure.message}`,
			{ cause: error },
		);
	}
	return parseLinuxProcessStat(pid, stat);
}

export function processExistsEvidence(pid: number): boolean {
	if (process.platform === "linux") return readLinuxProcessStatEvidence(pid)?.running ?? false;
	const command =
		process.platform === "win32"
			? ["tasklist", "/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"]
			: ["ps", "-p", String(pid), "-o", "pid="];
	const result = Bun.spawnSync(command, { stdout: "pipe", stderr: "ignore" });
	if (result.exitCode !== 0) return false;
	const output = result.stdout.toString();
	return process.platform === "win32"
		? output.includes(`,"${pid}",`)
		: output.trim() === String(pid);
}

async function waitForProcessCompletion(
	pid: number,
	deadline: number,
	completion: ProcessCompletion,
): Promise<void> {
	while (true) {
		const completed =
			process.platform === "linux"
				? processCompletionObserved(readLinuxProcessStatEvidence(pid), completion)
				: !processExistsEvidence(pid);
		if (completed) return;
		assertBefore(
			deadline,
			completion === "absent"
				? `direct process ${pid} to be reaped and disappear`
				: `detached process ${pid} to stop running`,
		);
		await Bun.sleep(TEST_OPENER_LIFECYCLE.pollMs);
	}
}

export async function waitForProcessAbsence(
	pid: number,
	timeoutMs: number = TEST_OPENER_LIFECYCLE.timeoutMs,
): Promise<void> {
	await waitForProcessCompletion(pid, Date.now() + timeoutMs, "absent");
}

export async function createOpenerFixture(
	options: OpenerFixtureOptions = {},
): Promise<OpenerFixture> {
	const root = mkdtempSync(join(tmpdir(), "archboard-opener-system-"));
	const checkout = join(root, "checkout");
	const state = join(root, "state");
	const registry = join(state, "repos.json");
	const configFile = join(state, "machine", "opener.json");
	const bindingFile = join(root, "canonical-binding.json");
	const repository = "github.com/acme/payments";
	mkdirSync(join(checkout, "src", "directory"), { recursive: true });
	mkdirSync(state, { recursive: true });
	writeFileSync(join(checkout, "src", "index.ts"), "export {};\n");
	git(checkout, "init", "-q");
	git(checkout, "remote", "add", "origin", `https://${repository}.git`);
	writeFileSync(
		registry,
		JSON.stringify([
			{ repo: repository, root: checkout, source: "declared", addedAt: "2026-01-01" },
		]),
	);
	writeFileSync(bindingFile, JSON.stringify({ repo: repository, path: "src/index.ts" }));

	const previousRepos = process.env.ARCHBOARD_REPOS;
	const previousConfig = process.env.ARCHBOARD_OPENER_CONFIG;
	process.env.ARCHBOARD_REPOS = registry;
	process.env.ARCHBOARD_OPENER_CONFIG = configFile;
	let server: Server | null = null;
	let visibleBase = "";
	let disposed = false;

	const start = async (): Promise<void> => {
		const app = express();
		app.use(cors());
		app.use(createCodeOpenerPreguard());
		const bindingForElement: CodeOpenerRouteDependencies["bindingForElement"] = (
			board,
			element,
		) => {
			if (board !== "system/payments") {
				return { ok: false, code: "BOARD_NOT_FOUND", error: "Board is not open." };
			}
			if (element !== "node") {
				return { ok: false, code: "ELEMENT_NOT_FOUND", error: "Element is missing." };
			}
			const parsed = CodeBindingSchema.safeParse(JSON.parse(readFileSync(bindingFile, "utf8")));
			return parsed.success
				? { ok: true, binding: parsed.data }
				: { ok: false, code: "BINDING_UNAVAILABLE", error: "Binding is unavailable." };
		};
		const routeDependencies: Partial<CodeOpenerRouteDependencies> | undefined =
			options.defaultDependencies
				? options.routeDependencies
				: {
						bindingForElement,
						...options.routeDependencies,
					};
		app.use(createCodeOpenerRouter(routeDependencies));
		app.use((_request, response) =>
			response.status(404).json({ success: false, code: "NOT_FOUND" }),
		);
		server = await new Promise<Server>((resolve, reject) => {
			const candidate = app.listen(0, "127.0.0.1", () => resolve(candidate));
			candidate.once("error", reject);
		});
		const address = server.address();
		if (!address || typeof address === "string")
			throw new Error("Opener server has no TCP address.");
		visibleBase = `http://127.0.0.1:${address.port}`;
	};

	const stop = async (): Promise<void> => {
		if (!server) return;
		const current = server;
		server = null;
		await new Promise<void>((resolve, reject) =>
			current.close((error) => (error ? reject(error) : resolve())),
		);
	};
	await start();

	const caller =
		() =>
		async (requestPath: string, init: RequestInit = {}): Promise<JsonResult> => {
			const headers = new Headers(init.headers);
			if (!headers.has("Host")) headers.set("Host", new URL(visibleBase).host);
			if (!headers.has("Origin")) headers.set("Origin", visibleBase);
			if (!headers.has("Sec-Fetch-Site")) headers.set("Sec-Fetch-Site", "same-origin");
			if (init.body !== undefined && !headers.has("Content-Type"))
				headers.set("Content-Type", "application/json");
			const response = await fetch(new URL(requestPath, visibleBase), { ...init, headers });
			return { status: response.status, body: await response.json(), headers: response.headers };
		};

	let invocationNumber = 0;
	return {
		root,
		checkout,
		repository,
		configFile,
		get base() {
			return visibleBase;
		},
		request(requestPath, init) {
			return caller()(requestPath, init);
		},
		caller,
		invocation(mode, extra = []) {
			const id = ++invocationNumber;
			const captureDirectory = join(root, `captures-${id}`);
			const releaseFile = join(root, `release-${id}`);
			const exitDirectory = join(root, `exits-${id}`);
			mkdirSync(captureDirectory);
			mkdirSync(exitDirectory);
			const releaseAndWait = async (completion: ProcessCompletion): Promise<void> => {
				if (!existsSync(releaseFile)) {
					mkdirSync(dirname(releaseFile), { recursive: true });
					closeSync(openSync(releaseFile, "wx"));
				}
				const deadline = Date.now() + TEST_OPENER_LIFECYCLE.timeoutMs;
				const captures = readdirSync(captureDirectory).filter((file) => file.endsWith(".json"));
				for (const capture of captures) {
					await waitForFile(join(exitDirectory, capture), deadline);
					const record = JSON.parse(readFileSync(join(captureDirectory, capture), "utf8"));
					await waitForProcessCompletion(record.pid, deadline, completion);
				}
			};
			return {
				selection: {
					version: 1,
					kind: "custom",
					executable: process.execPath,
					argv: [
						FAKE_OPENER,
						mode,
						captureDirectory,
						releaseFile,
						exitDirectory,
						"{path}",
						...extra,
					],
				},
				captureDirectory,
				releaseFile,
				exitDirectory,
				async waitForCapture() {
					return (await this.waitForCaptures(1))[0]!;
				},
				async waitForCaptures(count) {
					const deadline = Date.now() + TEST_OPENER_LIFECYCLE.timeoutMs;
					const files = await waitForCount(captureDirectory, count, deadline);
					return Promise.all(
						files
							.slice(0, count)
							.map((file) => readCompleteCaptureBefore(join(captureDirectory, file), deadline)),
					);
				},
				releaseAndWait() {
					return releaseAndWait("absent");
				},
				releaseAndWaitForNonrunning() {
					return releaseAndWait("nonrunning");
				},
			};
		},
		writeBinding(binding) {
			writeFileSync(bindingFile, JSON.stringify(binding));
		},
		async restart() {
			await stop();
			await start();
		},
		async dispose() {
			if (disposed) return;
			disposed = true;
			await stop();
			if (previousRepos === undefined) delete process.env.ARCHBOARD_REPOS;
			else process.env.ARCHBOARD_REPOS = previousRepos;
			if (previousConfig === undefined) delete process.env.ARCHBOARD_OPENER_CONFIG;
			else process.env.ARCHBOARD_OPENER_CONFIG = previousConfig;
			rmSync(root, { recursive: true });
		},
	};
}

export function jsonBody(value: unknown): string {
	return JSON.stringify(value);
}
