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

import { createCodeOpenerRouter } from "../../../../src/server/code-opener/index.ts";
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

export interface Invocation {
	selection: OpenerSelection;
	captureDirectory: string;
	releaseFile: string;
	exitDirectory: string;
	waitForCapture(): Promise<{ pid: number; target: string; extra: string[]; argv: string[] }>;
	waitForCaptures(
		count: number,
	): Promise<Array<{ pid: number; target: string; extra: string[]; argv: string[] }>>;
	releaseAndWait(): Promise<void>;
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

function git(cwd: string, ...args: string[]): void {
	const result = Bun.spawnSync(["git", ...args], { cwd, stdout: "ignore", stderr: "pipe" });
	if (result.exitCode !== 0) throw new Error(result.stderr.toString());
}

async function waitForFile(file: string): Promise<void> {
	const started = Date.now();
	while (!existsSync(file)) {
		if (Date.now() - started >= TEST_OPENER_LIFECYCLE.timeoutMs) {
			throw new Error(`Timed out waiting for ${file}`);
		}
		await Bun.sleep(TEST_OPENER_LIFECYCLE.pollMs);
	}
}

async function waitForCount(directory: string, count: number): Promise<string[]> {
	const started = Date.now();
	while (true) {
		const files = readdirSync(directory)
			.filter((file) => file.endsWith(".json"))
			.toSorted();
		if (files.length >= count) return files;
		if (Date.now() - started >= TEST_OPENER_LIFECYCLE.timeoutMs) {
			throw new Error(`Timed out waiting for ${count} records in ${directory}`);
		}
		await Bun.sleep(TEST_OPENER_LIFECYCLE.pollMs);
	}
}

export async function createOpenerFixture(): Promise<OpenerFixture> {
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
		app.use(
			createCodeOpenerRouter({
				bindingForElement(board, element) {
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
				},
			}),
		);
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
					const files = await waitForCount(captureDirectory, count);
					return files
						.slice(0, count)
						.map((file) => JSON.parse(readFileSync(join(captureDirectory, file), "utf8")));
				},
				async releaseAndWait() {
					if (!existsSync(releaseFile)) {
						mkdirSync(dirname(releaseFile), { recursive: true });
						closeSync(openSync(releaseFile, "wx"));
					}
					const captures = readdirSync(captureDirectory).filter((file) => file.endsWith(".json"));
					for (const capture of captures) await waitForFile(join(exitDirectory, capture));
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
