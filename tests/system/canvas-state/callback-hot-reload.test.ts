import { describe, expect, test } from "bun:test";
import { spawn, type ChildProcessByStdio } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { Readable } from "node:stream";

import {
	TEST_CANVAS_HEALTH_POLL_MS,
	TEST_CANVAS_SHUTDOWN_TIMEOUT_MS,
	TEST_CANVAS_STARTUP_TIMEOUT_MS,
} from "../../../src/shared/timing/timing.ts";

const repoRoot = resolve(import.meta.dir, "../../..");
const entry = join(repoRoot, "tests/system/fixtures/callback-hot-entry.ts");
type HotChild = ChildProcessByStdio<null, Readable, Readable>;

interface ProtocolRecord {
	readonly phase: "installed" | "verified";
	readonly pid: number;
	readonly generation: number;
	readonly moduleEvaluations: number;
	readonly installerId: number;
	readonly installerChanged: boolean;
	readonly instanceId: number;
	readonly activeSubscriptions: number;
	readonly activeBeforeDispose: number | null;
	readonly cleanupCount: number;
	readonly deliveryCount: number;
	readonly narrationCount: number;
	readonly settledCount: number;
}

const sleep = (ms: number): Promise<void> =>
	new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

function records(output: string): ProtocolRecord[] {
	return output
		.split("\n")
		.filter((line) => line.startsWith("CALLBACK_HOT "))
		.map((line) => JSON.parse(line.slice("CALLBACK_HOT ".length)) as ProtocolRecord);
}

async function waitForRecord(
	child: HotChild,
	output: () => string,
	phase: ProtocolRecord["phase"],
): Promise<ProtocolRecord> {
	const deadline = Date.now() + TEST_CANVAS_STARTUP_TIMEOUT_MS;
	while (Date.now() < deadline) {
		const record = records(output()).find((candidate) => candidate.phase === phase);
		if (record) return record;
		if (child.exitCode !== null || child.signalCode !== null)
			throw new Error(`Callback hot process exited before ${phase}.\n${output().slice(-4000)}`);
		await sleep(TEST_CANVAS_HEALTH_POLL_MS);
	}
	throw new Error(`Callback hot process did not report ${phase}.\n${output().slice(-4000)}`);
}

async function stop(child: HotChild): Promise<void> {
	if (child.exitCode !== null || child.signalCode !== null) return;
	const exit = new Promise<void>((resolveExit) => child.once("exit", () => resolveExit()));
	if (child.pid === undefined) throw new Error("Callback hot process has no pid.");
	try {
		process.kill(-child.pid, "SIGTERM");
	} catch {
		child.kill("SIGTERM");
	}
	if (
		!(await Promise.race([
			exit.then(() => true),
			sleep(TEST_CANVAS_SHUTDOWN_TIMEOUT_MS).then(() => false),
		]))
	) {
		try {
			process.kill(-child.pid, "SIGKILL");
		} catch {
			child.kill("SIGKILL");
		}
		await Promise.race([exit, sleep(TEST_CANVAS_SHUTDOWN_TIMEOUT_MS)]);
	}
	if (child.exitCode === null && child.signalCode === null)
		throw new Error(`Callback hot process ${child.pid} did not exit.`);
}

describe.serial("coordinator callback hot reload", () => {
	test(
		"re-evaluates the production installer graph and retains one callback cohort",
		async () => {
			const root = mkdtempSync(join(tmpdir(), "archboard-callback-hot-"));
			const token = join(root, "generation.ts");
			writeFileSync(token, "export const generation = 1;\n");
			const child = spawn(process.execPath, ["--hot", entry], {
				cwd: repoRoot,
				detached: true,
				env: {
					...process.env,
					CALLBACK_HOT_TOKEN: token,
					CALLBACK_HOT_KEY: `callback-hot-${crypto.randomUUID()}`,
				},
				stdio: ["ignore", "pipe", "pipe"],
			});
			let output = "";
			child.stdout.on("data", (chunk: Buffer) => (output += chunk.toString()));
			child.stderr.on("data", (chunk: Buffer) => (output += chunk.toString()));
			try {
				const first = await waitForRecord(child, () => output, "installed");
				expect(first).toMatchObject({
					generation: 1,
					moduleEvaluations: 1,
					installerId: 1,
					instanceId: 1,
					activeSubscriptions: 4,
					cleanupCount: 0,
					deliveryCount: 0,
					narrationCount: 0,
					settledCount: 0,
				});
				writeFileSync(token, "export const generation = 2;\n");
				const second = await waitForRecord(child, () => output, "verified");
				expect(second).toMatchObject({
					pid: first.pid,
					generation: 2,
					moduleEvaluations: 2,
					installerId: 2,
					installerChanged: true,
					instanceId: 1,
					activeBeforeDispose: 4,
					activeSubscriptions: 0,
					cleanupCount: 4,
					deliveryCount: 1,
					narrationCount: 1,
					settledCount: 1,
				});
				expect(records(output)).toHaveLength(2);
			} finally {
				try {
					await stop(child);
				} finally {
					rmSync(root, { recursive: true, force: true });
				}
			}
		},
		TEST_CANVAS_STARTUP_TIMEOUT_MS + TEST_CANVAS_SHUTDOWN_TIMEOUT_MS,
	);
});
