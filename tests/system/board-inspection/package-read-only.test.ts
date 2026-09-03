import { expect, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import {
	TEST_BOARD_INSPECTION_PACKAGE_FAILURE_TIMEOUT_MS,
	TEST_BOARD_INSPECTION_PACKAGE_LIFECYCLE_CASE_TIMEOUT_MS,
	TEST_BOARD_INSPECTION_PACKAGE_PROCESS_GROUP_CLEANUP_MS,
	TEST_BOARD_INSPECTION_PACKAGE_PROCESS_GROUP_POLL_MS,
} from "../../../src/shared/timing/timing.js";
import {
	createPackageInspectionOwner,
	processIdentityExists,
	type PackageProcessGroupIdentity,
	type ProcessIdentity,
} from "./support/package-inspection.js";
import {
	forcePackageProcessGroupGone,
	runReadOnlyPackageProcess,
	waitForPackageProcessFixtureIdentity,
} from "./support/package-process.js";

const signalOwnerEntry = fileURLToPath(
	new URL("./fixtures/package-signal-owner.ts", import.meta.url),
);
const processGroupEntry = fileURLToPath(
	new URL("./fixtures/package-process-group.ts", import.meta.url),
);
const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const ownedVaultPrefix = `${tmpdir()}/archboard-task-130-05-package-`;
const ownedHttpPrefix = `${tmpdir()}/archboard-task-130-05-http-`;

function processGroupExists(group: number): boolean {
	try {
		process.kill(-group, 0);
		return true;
	} catch (cause) {
		if ((cause as NodeJS.ErrnoException).code === "ESRCH") return false;
		throw cause;
	}
}

async function forceGroupGone(group: number): Promise<void> {
	try {
		process.kill(-group, "SIGKILL");
	} catch (cause) {
		if ((cause as NodeJS.ErrnoException).code !== "ESRCH") throw cause;
	}
	const deadline = Date.now() + TEST_BOARD_INSPECTION_PACKAGE_PROCESS_GROUP_CLEANUP_MS;
	while (processGroupExists(group)) {
		if (Date.now() >= deadline) throw new Error(`Fixture process group ${group} survived cleanup.`);
		await Bun.sleep(TEST_BOARD_INSPECTION_PACKAGE_PROCESS_GROUP_POLL_MS);
	}
}

function expectGroupGone(identity: PackageProcessGroupIdentity): void {
	expect(processIdentityExists(identity.leader)).toBe(false);
	expect(processIdentityExists(identity.descendant)).toBe(false);
	expect(processGroupExists(identity.group)).toBe(false);
}

async function readLine(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<string> {
	const decoder = new TextDecoder();
	let text = "";
	for (;;) {
		const next = await reader.read();
		text += decoder.decode(next.value, { stream: !next.done });
		const newline = text.indexOf("\n");
		if (newline >= 0) return text.slice(0, newline);
		if (next.done) throw new Error("Signal owner exited before publishing a readiness line.");
	}
}

test("package inspection timeout reaps its exact process group", async () => {
	const owner = createPackageInspectionOwner();
	const vault = owner.startVault();
	let artifacts = owner.artifactPaths();
	try {
		await owner.startHttpSentinel();
		artifacts = owner.artifactPaths();
		const fixture = owner.startTimeoutFixture(TEST_BOARD_INSPECTION_PACKAGE_FAILURE_TIMEOUT_MS);
		const identity = await fixture.ready;
		expect(processIdentityExists(identity.leader)).toBe(true);
		expect(processIdentityExists(identity.descendant)).toBe(true);
		await expect(fixture.result).rejects.toThrow(
			`Package inspection exceeded ${TEST_BOARD_INSPECTION_PACKAGE_FAILURE_TIMEOUT_MS}ms.`,
		);
		expect(fixture.settled()).toEqual(["leader", "stderr", "stdout"]);
		expectGroupGone(identity);
	} finally {
		await owner.dispose();
	}
	expect(artifacts).toContain(vault);
	expect(artifacts).toHaveLength(2);
	for (const artifact of artifacts) expect(existsSync(artifact)).toBe(false);
});

test("package inspection reaps and drains a child when ownership capture fails", async () => {
	const owner = createPackageInspectionOwner();
	const vault = owner.startVault();
	const marker = `${vault}/capture-failure.json`;
	const settled = new Set<string>();
	let identity: PackageProcessGroupIdentity | undefined;
	try {
		await expect(
			runReadOnlyPackageProcess(
				repoRoot,
				vault,
				[process.execPath, processGroupEntry],
				{
					ARCHBOARD_PACKAGE_PROCESS_READY: marker,
					ARCHBOARD_PACKAGE_PROCESS_DESCENDANT_INHERITS_PIPES: "1",
				},
				() => [],
				{
					captureProcessGroup: async () => {
						identity = await waitForPackageProcessFixtureIdentity(
							marker,
							new AbortController().signal,
						);
						throw new Error("injected ownership capture failure");
					},
					onSettlement: (name) => settled.add(name),
				},
			),
		).rejects.toThrow("Could not start package inspection: injected ownership capture failure");
		expect(identity).toBeDefined();
		expect([...settled].toSorted()).toEqual(["leader", "stderr", "stdout"]);
		expectGroupGone(identity!);
	} finally {
		if (identity && processGroupExists(identity.group)) await forceGroupGone(identity.group);
		await owner.dispose();
	}
});

test("package inspection waits for every owner after an injected drain failure", async () => {
	const owner = createPackageInspectionOwner();
	try {
		owner.startVault();
		const fixture = owner.startDrainFailureFixture();
		const identity = await fixture.ready;
		await expect(fixture.result).rejects.toThrow("Injected package stdout drain failure.");
		expect(fixture.settled()).toEqual(["leader", "stderr", "stdout"]);
		expectGroupGone(identity);
	} finally {
		await owner.dispose();
	}
});

test("sentinel pipe failure still reaps the process and removes every artifact", async () => {
	const owner = createPackageInspectionOwner();
	const vault = owner.startVault();
	const sentinel = await owner.startHttpSentinel({ failStdout: true });
	const artifacts = owner.artifactPaths();
	await expect(owner.dispose()).rejects.toThrow("Injected HTTP sentinel stdout failure.");
	expect(processIdentityExists(sentinel.identity)).toBe(false);
	expect(artifacts).toHaveLength(2);
	expect(artifacts).toContain(vault);
	for (const artifact of artifacts) expect(existsSync(artifact)).toBe(false);
});

test("resistant sentinel startup failure is reaped before start rejects", async () => {
	const owner = createPackageInspectionOwner();
	const vault = owner.startVault();
	const starting = owner.startHttpSentinel({ resistTermination: true, failStartup: true });
	await Bun.sleep(0);
	const identity = owner.pendingSentinelIdentity();
	const artifacts = owner.artifactPaths();
	expect(identity).toBeDefined();
	expect(processIdentityExists(identity!)).toBe(true);
	await expect(starting).rejects.toThrow("Injected HTTP sentinel startup failure.");
	expect(processIdentityExists(identity!)).toBe(false);
	expect(artifacts).toHaveLength(2);
	expect(existsSync(artifacts[1]!)).toBe(false);
	await owner.dispose();
	expect(existsSync(vault)).toBe(false);
});

test("dispose cancels and awaits a delayed resistant sentinel startup", async () => {
	const owner = createPackageInspectionOwner();
	const vault = owner.startVault();
	const starting = owner.startHttpSentinel({
		resistTermination: true,
		startupDelayMs: TEST_BOARD_INSPECTION_PACKAGE_FAILURE_TIMEOUT_MS * 5,
	});
	await owner.pendingSentinelOwnership();
	const identity = owner.pendingSentinelIdentity();
	const artifacts = owner.artifactPaths();
	expect(identity).toBeDefined();
	expect(processIdentityExists(identity!)).toBe(true);
	expect(artifacts).toHaveLength(2);
	const disposed = owner.dispose();
	await expect(starting).rejects.toThrow("Package inspection owner disposed.");
	await disposed;
	expect(processIdentityExists(identity!)).toBe(false);
	for (const artifact of artifacts) expect(existsSync(artifact)).toBe(false);
	expect(owner.artifactPaths()).toEqual([]);
	expect(existsSync(vault)).toBe(false);
});

test("dispose aborts fixture readiness and awaits its process owner", async () => {
	const owner = createPackageInspectionOwner();
	const vault = owner.startVault();
	const fixture = owner.startDelayedReadinessFixture(
		TEST_BOARD_INSPECTION_PACKAGE_FAILURE_TIMEOUT_MS * 5,
	);
	expect(fixture.group).toBeGreaterThan(0);
	expect(processGroupExists(fixture.group)).toBe(true);
	const disposed = owner.dispose();
	await expect(fixture.ready).rejects.toThrow("Package inspection owner disposed.");
	await expect(fixture.result).rejects.toThrow("Package inspection owner disposed.");
	await disposed;
	expect(fixture.settled()).toEqual(["leader", "stderr", "stdout"]);
	expect(processGroupExists(fixture.group)).toBe(false);
	expect(existsSync(vault)).toBe(false);
});

test("stale package identities never signal a live process group", async () => {
	const owner = createPackageInspectionOwner();
	try {
		owner.startVault();
		const fixture = owner.startTimeoutFixture(TEST_BOARD_INSPECTION_PACKAGE_FAILURE_TIMEOUT_MS);
		const identity = await fixture.ready;
		const stale: PackageProcessGroupIdentity = {
			...identity,
			leader: { ...identity.leader, startTime: `${identity.leader.startTime}-stale` },
			descendant: { ...identity.descendant, startTime: `${identity.descendant.startTime}-stale` },
		};
		await expect(forcePackageProcessGroupGone(stale)).rejects.toThrow(
			`Refusing to signal package process group ${identity.group}`,
		);
		expect(processIdentityExists(identity.leader)).toBe(true);
		expect(processIdentityExists(identity.descendant)).toBe(true);
		await expect(fixture.result).rejects.toThrow(
			`Package inspection exceeded ${TEST_BOARD_INSPECTION_PACKAGE_FAILURE_TIMEOUT_MS}ms.`,
		);
		expectGroupGone(identity);
	} finally {
		await owner.dispose();
	}
});

test(
	"repeated parent SIGTERM joins cleanup and reaps every owner before replay",
	async () => {
		const child = Bun.spawn([process.execPath, signalOwnerEntry], {
			detached: true,
			stdin: "ignore",
			stdout: "pipe",
			stderr: "pipe",
		});
		const stderr = new Response(child.stderr).text();
		let ready:
			| {
					owner: number;
					vault: string;
					identities: PackageProcessGroupIdentity[];
					sentinel: ProcessIdentity;
					artifacts: string[];
			  }
			| undefined;
		let stdoutReader: ReadableStreamDefaultReader<Uint8Array> | undefined;
		try {
			stdoutReader = child.stdout.getReader();
			const readiness = await readLine(stdoutReader).catch(async (cause) => {
				throw new Error(`Signal owner exited before readiness: ${await stderr}`, { cause });
			});
			ready = JSON.parse(readiness);
			const ownedReader = stdoutReader;
			const remainingStdout = (async () => {
				const decoder = new TextDecoder();
				let output = "";
				try {
					for (;;) {
						const next = await ownedReader.read();
						output += decoder.decode(next.value, { stream: !next.done });
						if (next.done) return output;
					}
				} finally {
					if (stdoutReader === ownedReader) {
						ownedReader.releaseLock();
						stdoutReader = undefined;
					}
				}
			})();
			expect(ready?.owner).toBe(child.pid);
			expect(ready!.identities).toHaveLength(2);
			for (const identity of ready!.identities) {
				expect(processIdentityExists(identity.leader)).toBe(true);
				expect(processIdentityExists(identity.descendant)).toBe(true);
			}
			expect(processIdentityExists(ready!.sentinel)).toBe(true);
			child.kill("SIGTERM");
			const [status, shutdownOutput] = await Promise.all([child.exited, remainingStdout, stderr]);
			expect(status).toBe(143);
			expect(child.signalCode).toBe("SIGTERM");
			for (const identity of ready!.identities) expectGroupGone(identity);
			expect(processIdentityExists(ready!.sentinel)).toBe(false);
			const shutdown = JSON.parse(shutdownOutput.trim()) as {
				shutdown: boolean;
				capturedSignals: number;
				settlements: string[][];
				remainingArtifacts: string[];
			};
			expect(shutdown).toEqual({
				shutdown: true,
				capturedSignals: 2,
				settlements: [
					["leader", "stderr", "stdout"],
					["leader", "stderr", "stdout"],
				],
				remainingArtifacts: [],
			});
			expect(ready!.artifacts).toHaveLength(2);
			expect(ready!.artifacts.some((artifact) => artifact.startsWith(ownedVaultPrefix))).toBe(true);
			expect(ready!.artifacts.some((artifact) => artifact.startsWith(ownedHttpPrefix))).toBe(true);
			for (const artifact of ready!.artifacts) expect(existsSync(artifact)).toBe(false);
		} finally {
			if (stdoutReader) {
				const ownedReader = stdoutReader;
				try {
					await ownedReader.cancel();
				} finally {
					if (stdoutReader === ownedReader) {
						ownedReader.releaseLock();
						stdoutReader = undefined;
					}
				}
			}
			for (const identity of ready?.identities ?? []) {
				if (processGroupExists(identity.group)) await forceGroupGone(identity.group);
			}
			if (processGroupExists(child.pid)) await forceGroupGone(child.pid);
			await child.exited;
			for (const artifact of ready?.artifacts ?? []) {
				if (artifact.startsWith(ownedVaultPrefix) || artifact.startsWith(ownedHttpPrefix)) {
					rmSync(artifact, { recursive: true, force: true });
				}
			}
		}
	},
	TEST_BOARD_INSPECTION_PACKAGE_LIFECYCLE_CASE_TIMEOUT_MS,
);

test(
	"parent SIGTERM cancels and awaits a delayed resistant sentinel startup before replay",
	async () => {
		const child = Bun.spawn([process.execPath, signalOwnerEntry], {
			detached: true,
			env: { ...process.env, ARCHBOARD_PACKAGE_SIGNAL_DELAYED_STARTUP: "1" },
			stdin: "ignore",
			stdout: "pipe",
			stderr: "pipe",
		});
		const stderr = new Response(child.stderr).text();
		let ready:
			| {
					owner: number;
					vault: string;
					identities: PackageProcessGroupIdentity[];
					sentinel: ProcessIdentity;
					artifacts: string[];
			  }
			| undefined;
		let stdoutReader: ReadableStreamDefaultReader<Uint8Array> | undefined;
		try {
			stdoutReader = child.stdout.getReader();
			const readiness = await readLine(stdoutReader).catch(async (cause) => {
				throw new Error(`Delayed signal owner exited before readiness: ${await stderr}`, {
					cause,
				});
			});
			ready = JSON.parse(readiness);
			const ownedReader = stdoutReader;
			const remainingStdout = (async () => {
				const decoder = new TextDecoder();
				let output = "";
				try {
					for (;;) {
						const next = await ownedReader.read();
						output += decoder.decode(next.value, { stream: !next.done });
						if (next.done) return output;
					}
				} finally {
					if (stdoutReader === ownedReader) {
						ownedReader.releaseLock();
						stdoutReader = undefined;
					}
				}
			})();
			expect(ready?.owner).toBe(child.pid);
			expect(ready!.identities).toEqual([]);
			expect(processIdentityExists(ready!.sentinel)).toBe(true);
			expect(ready!.artifacts).toHaveLength(2);
			child.kill("SIGTERM");
			const [status, shutdownOutput] = await Promise.all([child.exited, remainingStdout, stderr]);
			expect(status).toBe(143);
			expect(child.signalCode).toBe("SIGTERM");
			expect(processIdentityExists(ready!.sentinel)).toBe(false);
			expect(JSON.parse(shutdownOutput.trim())).toEqual({
				shutdown: true,
				capturedSignals: 2,
				settlements: [],
				remainingArtifacts: [],
			});
			for (const artifact of ready!.artifacts) expect(existsSync(artifact)).toBe(false);
		} finally {
			if (stdoutReader) {
				const ownedReader = stdoutReader;
				try {
					await ownedReader.cancel();
				} finally {
					if (stdoutReader === ownedReader) {
						ownedReader.releaseLock();
						stdoutReader = undefined;
					}
				}
			}
			if (processGroupExists(child.pid)) await forceGroupGone(child.pid);
			await child.exited;
			for (const artifact of ready?.artifacts ?? []) {
				if (artifact.startsWith(ownedVaultPrefix) || artifact.startsWith(ownedHttpPrefix)) {
					rmSync(artifact, { recursive: true, force: true });
				}
			}
		}
	},
	TEST_BOARD_INSPECTION_PACKAGE_LIFECYCLE_CASE_TIMEOUT_MS,
);
