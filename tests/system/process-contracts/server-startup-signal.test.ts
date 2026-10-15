import { CODEX_PROTOCOL_BINARY_VERSION } from "@/runtime/codex-protocol";
import { expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve as resolvePath } from "node:path";

import {
	openApplicationSocket,
	prepareProductionFixture,
} from "../server-state/support/codex-production.ts";
import { waitFor } from "../server-state/support/http.ts";
import { listOnlyVault } from "../support/test-vault.ts";
import { records, startServer } from "./support/codex-workbench-lifecycle.ts";
import {
	buildOwnedServerEnvironment,
	processExists,
	waitForProcessExit,
} from "../support/owned-server.ts";
import {
	publicStartEnvironment,
	writePublicCodexExecutable,
} from "../server-state/support/public-codex-startup.ts";
import {
	exactProcessExists,
	killExactGroup,
	processGroupMembers,
	processIdentity,
	type ProcessIdentity,
} from "../support/process-census.ts";

const repoRoot = resolvePath(import.meta.dir, "../../..");
const fixtureSource = join(repoRoot, "tests/system/server-state/fixtures/fake-codex-production.ts");
const serverEntry = join(repoRoot, "src/server.ts");

async function freePort(): Promise<number> {
	const server = createServer();
	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen({ host: "127.0.0.1", port: 0, exclusive: true }, resolve);
	});
	const address = server.address();
	if (address === null || typeof address === "string") {
		throw new Error("No loopback port.");
	}
	await new Promise<void>((resolve, reject) =>
		server.close((error) => (error ? reject(error) : resolve())),
	);
	return address.port;
}

test("SIGTERM before readiness reaps Codex and permits a fresh application start", async () => {
	const resources = new AsyncDisposableStack();
	try {
		const fixture = prepareProductionFixture(resources, fixtureSource);
		writeFileSync(fixture.controlPath, JSON.stringify({ exit: false, holdInitialize: true }));
		const wrapper = join(fixture.root, "startup-signal-server.ts");
		const executableModule = join(repoRoot, "src/runtime/codex-process/executable.ts");
		writeFileSync(
			wrapper,
			`import { mock } from "bun:test";\n` +
				`const actualExecutable = await import(${JSON.stringify(executableModule)});\n` +
				`mock.module(${JSON.stringify(executableModule)}, () => ({ ...actualExecutable, resolveProjectCodexExecutable: () => process.env.ARCHBOARD_TEST_CODEX_EXECUTABLE }));\n` +
				`const { startServer } = await import(${JSON.stringify(serverEntry)});\n` +
				`await startServer();\n`,
		);
		const port = await freePort();
		const paths = {
			home: join(fixture.root, "first-home"),
			xdgConfig: join(fixture.root, "first-xdg-config"),
			xdgState: join(fixture.root, "first-state"),
			temporary: join(fixture.root, "first-tmp"),
		};
		for (const directory of Object.values(paths)) {
			mkdirSync(directory, { recursive: true, mode: 0o700 });
		}
		const server = spawn(process.execPath, [wrapper], {
			cwd: repoRoot,
			detached: true,
			env: buildOwnedServerEnvironment({
				paths,
				port,
				registry: listOnlyVault(join(fixture.root, "first-repos.json"), fixture.vault),
				env: {
					ARCHBOARD_TEST_CODEX_EXECUTABLE: fixture.executablePath,
					ARCHBOARD_TEST_CODEX_LOG: fixture.logPath,
					ARCHBOARD_TEST_CODEX_CONTROL: fixture.controlPath,
					ARCHBOARD_SETTLE_MS: "20",
				},
			}),
			stdio: ["ignore", "pipe", "pipe"],
		});
		if (server.pid === undefined) {
			throw new Error("The startup-signal server has no pid.");
		}
		const serverPid = server.pid;
		let output = "";
		server.stdout.on("data", (chunk: Buffer) => (output += chunk.toString()));
		server.stderr.on("data", (chunk: Buffer) => (output += chunk.toString()));
		const serverExit = new Promise<void>((resolve) => server.once("exit", () => resolve()));
		resources.defer(async () => {
			if (!processExists(serverPid)) {
				return;
			}
			try {
				process.kill(-serverPid, "SIGKILL");
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "ESRCH") {
					throw error;
				}
			}
			await serverExit;
		});

		const childPid = await waitFor(() => {
			const entries = records(fixture.logPath);
			const held = entries.some((entry) => entry.kind === "initialize_held");
			const pid = entries.find((entry) => entry.kind === "app_server_spawn")?.pid;
			return held && pid !== undefined ? pid : undefined;
		}, "pre-readiness Codex child");
		if (childPid === undefined) {
			throw new Error("The pre-readiness Codex child was not observed.");
		}

		server.kill("SIGTERM");
		await Promise.race([
			serverExit,
			new Promise<never>((_resolve, reject) =>
				setTimeout(
					() => reject(new Error(`Server did not stop after pre-readiness signal.\n${output}`)),
					5_000,
				),
			),
		]);
		await waitForProcessExit(serverPid);
		await waitForProcessExit(childPid);
		expect(processExists(serverPid)).toBeFalse();
		expect(processExists(childPid)).toBeFalse();

		writeFileSync(fixture.controlPath, JSON.stringify({ exit: false }));
		const replacement = await startServer(fixture);
		resources.defer(() => replacement.dispose());
		expect(processExists(replacement.pid)).toBeTrue();
		const replacementSocket = await openApplicationSocket(replacement.base, "replacement-socket");
		await replacementSocket.close();
		await replacement.normalClose();
		expect(processExists(replacement.pid)).toBeFalse();
	} finally {
		await resources.disposeAsync();
	}
}, 20_000);

test("public cleanup-error takeover reaps the exact terminal group and outer server", async () => {
	const root = mkdtempSync(join(tmpdir(), "archboard-public-terminal-"));
	const marker = join(root, "processes.json");
	const executable = join(root, "codex");
	const port = await freePort();
	const base = `http://127.0.0.1:${port}`;
	const environment = publicStartEnvironment(root, base, executable);
	environment["ARCHBOARD_TEST_PUBLIC_SHUTDOWN_FAILURE"] = "always";
	environment["ARCHBOARD_TEST_PUBLIC_READINESS_TIMEOUT_MS"] = "2000";
	environment["ARCHBOARD_TEST_PUBLIC_CLEANUP_DEADLINE_MS"] = "900";
	environment["ARCHBOARD_TEST_PUBLIC_CLEANUP_GRACE_MS"] = "150";
	writePublicCodexExecutable(
		executable,
		`if (process.argv.includes("--version")) { console.log("${CODEX_PROTOCOL_BINARY_VERSION}"); process.exit(0); }
const { spawn } = require("node:child_process");
const descendant = spawn(process.execPath, ["-e", "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"], { stdio: "ignore" });
process.on("SIGTERM", () => {});
require("node:fs").writeFileSync(${JSON.stringify(marker)}, JSON.stringify({ leader: process.pid, descendant: descendant.pid }));
process.stdin.resume(); setInterval(() => {}, 1000);`,
	);
	const startedAt = performance.now();
	const launcher = spawn(join(repoRoot, "bin/archboard"), ["start"], {
		cwd: repoRoot,
		env: environment,
		stdio: ["ignore", "ignore", "pipe"],
	});
	let stderr = "";
	launcher.stderr.on("data", (chunk: Buffer) => void (stderr += chunk));
	const result = new Promise<number | null>((resolve) => launcher.once("close", resolve));
	let leader: ProcessIdentity | null = null;
	let server: ProcessIdentity | null = null;
	try {
		await waitFor(() => {
			if (existsSync(marker)) {
				return true;
			}
			if (launcher.exitCode !== null || launcher.signalCode !== null) {
				throw new Error(`Public start exited before the Codex group spawned.\n${stderr}`);
			}
			return undefined;
		}, "TERM-resistant Codex group");
		const pids = JSON.parse(readFileSync(marker, "utf8")) as {
			readonly leader: number;
			readonly descendant: number;
		};
		leader = processIdentity(pids.leader);
		const descendant = processIdentity(pids.descendant);
		if (leader === null || descendant === null) {
			throw new Error("The exact TERM-resistant Codex identities were not live.");
		}
		server = processIdentity(leader.parentPid);
		if (server === null) {
			throw new Error("The owning server identity was not live.");
		}
		expect(leader.group).toBe(leader.pid);
		expect(descendant.group).toBe(leader.group);
		expect(await result).not.toBe(0);
		expect(performance.now() - startedAt).toBeLessThan(5_000);
		await Promise.all([
			waitForProcessExit(server.pid),
			waitForProcessExit(leader.pid),
			waitForProcessExit(descendant.pid),
		]);
		expect(exactProcessExists(server)).toBeFalse();
		expect(exactProcessExists(leader)).toBeFalse();
		expect(exactProcessExists(descendant)).toBeFalse();
		expect(processGroupMembers(leader.group)).toEqual([]);
		expect(stderr.split(/\r?\n/u).filter(Boolean)).toHaveLength(1);
	} finally {
		if (leader !== null) {
			killExactGroup(leader);
		}
		if (server !== null) {
			killExactGroup(server);
		}
		if (launcher.exitCode === null && launcher.signalCode === null) {
			launcher.kill("SIGKILL");
		}
		await Promise.race([result, Bun.sleep(5_000)]);
		rmSync(root, { recursive: true, force: true });
	}
}, 20_000);
