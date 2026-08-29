import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { join } from "node:path";

import { planOpenerCommand } from "../../../src/server/code-opener/index.ts";
import { TEST_OPENER_LIFECYCLE } from "../../../src/shared/timing/timing.ts";
import {
	createOpenerFixture,
	jsonBody,
	parseLinuxProcessStat,
	processExistsEvidence,
	readLinuxProcessStatEvidence,
} from "./support/opener-fixture.ts";

const LAUNCHER_OWNER = join(import.meta.dir, "fixtures/launcher-owner.ts");
const syntheticStat = (pid: number, comm: string, state: string, processGroup = pid): string =>
	`${pid} (${comm}) ${state} 1 ${processGroup}`;

async function beforeDeadline<T>(
	promise: Promise<T>,
	deadline: number,
	description: string,
): Promise<T> {
	const remaining = deadline - Date.now();
	if (remaining <= 0) throw new Error(`Timed out waiting for ${description}`);
	let timeout: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			promise,
			new Promise<never>((_, reject) => {
				timeout = setTimeout(
					() => reject(new Error(`Timed out waiting for ${description}`)),
					remaining,
				);
			}),
		]);
	} finally {
		if (timeout !== undefined) clearTimeout(timeout);
	}
}

function processDiagnostic(pid: number): string {
	try {
		if (process.platform === "linux") {
			const evidence = readLinuxProcessStatEvidence(pid);
			return evidence
				? `state=${evidence.state},running=${evidence.running},pgrp=${evidence.processGroup}`
				: "absent";
		}
		return `running=${processExistsEvidence(pid)}`;
	} catch (error) {
		return `observation failed: ${error instanceof Error ? error.message : String(error)}`;
	}
}

describe("Linux opener process evidence", () => {
	test("parses a live process whose comm contains spaces and closing parentheses", () => {
		expect(parseLinuxProcessStat(42_424, syntheticStat(42_424, "fake ) opener", "R"))).toEqual({
			pid: 42_424,
			state: "R",
			processGroup: 42_424,
			running: true,
		});
	});

	test.each(["R", "S", "D", "T", "t", "W", "K", "P", "I"])(
		"treats recognized live or stopped state %s as running",
		(state) => {
			expect(parseLinuxProcessStat(81, syntheticStat(81, "opener", state)).running).toBeTrue();
		},
	);

	test.each(["Z", "X", "x"])("treats exited state %s as nonrunning", (state) => {
		expect(parseLinuxProcessStat(82, syntheticStat(82, "opener", state)).running).toBeFalse();
	});

	test("rejects a mismatched leading PID with path context", () => {
		expect(() => parseLinuxProcessStat(83, syntheticStat(84, "opener", "S"))).toThrow(
			"Invalid Linux process stat for PID 83 at /proc/83/stat: record PID 84 does not match expected PID 83.",
		);
	});

	test.each([
		["truncated", "83 (opener) S 1", "expected state, parent PID, and process group fields"],
		["invalid process group", syntheticStat(83, "opener", "S", Number.NaN), 'process group "NaN"'],
		["unknown state", syntheticStat(83, "opener", "?"), 'unknown process state "?"'],
	] as const)("rejects %s stat evidence", (_label, stat, diagnostic) => {
		expect(() => parseLinuxProcessStat(83, stat)).toThrow(
			`Invalid Linux process stat for PID 83 at /proc/83/stat: ${diagnostic}`,
		);
	});

	test.each([0, -1, Number.MAX_SAFE_INTEGER + 1])("rejects invalid expected PID %p", (pid) => {
		expect(() => parseLinuxProcessStat(pid, syntheticStat(1, "opener", "S"))).toThrow(
			`Invalid Linux process PID ${pid}: expected a positive safe integer.`,
		);
	});

	test("observes a retained real child until its handle kills and reaps it", async () => {
		if (process.platform !== "linux") return;
		const child = Bun.spawn([process.execPath, "-e", "await Bun.sleep(60_000)"], {
			stdout: "ignore",
			stderr: "ignore",
		});
		try {
			expect(readLinuxProcessStatEvidence(child.pid)).toMatchObject({
				pid: child.pid,
				running: true,
			});
		} finally {
			child.kill("SIGKILL");
			await child.exited;
		}
		expect(readLinuxProcessStatEvidence(child.pid)).toBeNull();
	});

	test("treats a missing Linux stat entry as absent", () => {
		if (process.platform !== "linux") return;
		expect(readLinuxProcessStatEvidence(Number.MAX_SAFE_INTEGER)).toBeNull();
	});
});

describe("shell-free launcher lifecycle", () => {
	test("activation responds before its detached fake opener exits", async () => {
		await using resources = new AsyncDisposableStack();
		const fixture = await createOpenerFixture();
		resources.defer(() => fixture.dispose());
		const invocation = fixture.invocation("hold");
		resources.defer(() => invocation.releaseAndWait());
		expect(
			(
				await fixture.request("/api/settings/opener", {
					method: "PUT",
					body: jsonBody(invocation.selection),
				})
			).status,
		).toBe(200);

		const response = await fixture.request("/api/code-targets/open", {
			method: "POST",
			body: jsonBody({ board: "system/payments", element: "node" }),
		});
		expect(response.status).toBe(200);
		const capture = await invocation.waitForCapture();
		expect(processExistsEvidence(capture.pid)).toBeTrue();
		expect(readdirSync(invocation.exitDirectory)).toEqual([]);
		await invocation.releaseAndWait();
		expect(readdirSync(invocation.exitDirectory)).toHaveLength(1);
		expect(processExistsEvidence(capture.pid)).toBeFalse();
	});

	test("the launcher owner exits while the detached fake remains held", async () => {
		await using resources = new AsyncDisposableStack();
		const fixture = await createOpenerFixture();
		resources.defer(() => fixture.dispose());
		const invocation = fixture.invocation("hold");
		resources.defer(() => invocation.releaseAndWait());
		const plan = planOpenerCommand(invocation.selection, fixture.checkout, process.platform);
		if (!plan.ok) throw new Error(`${plan.code}: ${plan.error}`);

		const owner = Bun.spawn([process.execPath, LAUNCHER_OWNER, JSON.stringify(plan.command)], {
			stdout: "ignore",
			stderr: "pipe",
		});
		const ownerExited = owner.exited;
		const decoder = new TextDecoder();
		let ownerStderr = "";
		const stderrDrained = (async () => {
			const reader = owner.stderr.getReader();
			while (true) {
				const chunk = await reader.read();
				if (chunk.done) break;
				ownerStderr += decoder.decode(chunk.value, { stream: true });
			}
			ownerStderr += decoder.decode();
		})();
		let ownerCleanupComplete = false;
		const cleanupOwner = async (): Promise<void> => {
			if (ownerCleanupComplete) return;
			if (owner.exitCode === null && owner.signalCode === null) owner.kill("SIGKILL");
			const cleanupDeadline = Date.now() + TEST_OPENER_LIFECYCLE.timeoutMs;
			const cleanupFailures: unknown[] = [];
			try {
				await beforeDeadline(ownerExited, cleanupDeadline, `launcher owner ${owner.pid} to exit`);
			} catch (error) {
				cleanupFailures.push(error);
			}
			try {
				await beforeDeadline(stderrDrained, cleanupDeadline, `launcher owner ${owner.pid} stderr`);
			} catch (error) {
				cleanupFailures.push(error);
			}
			if (cleanupFailures.length > 0) {
				throw new AggregateError(
					cleanupFailures,
					`Launcher owner ${owner.pid} cleanup failed; stderr=${JSON.stringify(ownerStderr)}`,
				);
			}
			ownerCleanupComplete = true;
		};
		resources.defer(cleanupOwner);
		let exitCode: number;
		try {
			exitCode = await beforeDeadline(
				ownerExited,
				Date.now() + TEST_OPENER_LIFECYCLE.timeoutMs,
				`launcher owner ${owner.pid} natural exit`,
			);
		} catch (error) {
			const failure = new Error(
				`Launcher owner ${owner.pid} did not exit naturally within ${TEST_OPENER_LIFECYCLE.timeoutMs}ms; exit=${owner.exitCode}, signal=${owner.signalCode}, process=${processDiagnostic(owner.pid)}, stderr=${JSON.stringify(ownerStderr)}`,
				{ cause: error },
			);
			try {
				await cleanupOwner();
			} catch (cleanupError) {
				throw new AggregateError(
					[failure, cleanupError],
					`Launcher owner ${owner.pid} timed out and retained-handle cleanup failed`,
					{ cause: cleanupError },
				);
			}
			throw failure;
		}
		await beforeDeadline(
			stderrDrained,
			Date.now() + TEST_OPENER_LIFECYCLE.timeoutMs,
			`launcher owner ${owner.pid} stderr`,
		);
		expect(exitCode, ownerStderr).toBe(0);
		const capture = await invocation.waitForCapture();
		expect(readdirSync(invocation.exitDirectory)).toEqual([]);
		expect(processExistsEvidence(capture.pid)).toBeTrue();
		if (process.platform === "linux") {
			expect(readLinuxProcessStatEvidence(capture.pid)).toMatchObject({
				pid: capture.pid,
				processGroup: capture.pid,
				running: true,
			});
		}

		await invocation.releaseAndWait();
		expect(readdirSync(invocation.exitDirectory)).toHaveLength(1);
		expect(processExistsEvidence(capture.pid)).toBeFalse();
	});
});
