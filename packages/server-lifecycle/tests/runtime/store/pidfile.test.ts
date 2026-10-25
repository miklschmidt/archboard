import { afterAll, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative } from "node:path";

import {
	createCodexProcessGroupOperations,
	type CodexProcessGroupIdentity,
} from "@archboard/process/codex-group";

import {
	pidFilePath,
	readPidFile,
	sweepDeadPidFiles,
	writePidFile,
} from "#runtime/store/pidfile.ts";
import { stateDir } from "@archboard/workspace/state-dir";

const HOME_VARIABLES = ["HOME", "USERPROFILE", "LOCALAPPDATA", "XDG_STATE_HOME"] as const;
const CHILD_BOUND_MS = 5_000;
const TEST_PROCESS_GROUP_POLL_MS = 10;

const isolatedRoot = process.env["ARCHBOARD_PIDFILE_TEST_ROOT"];

/**
 * Reap the isolated child's group, including a sleep left by a killed test runner.
 * @param root The isolated child's fixture directory.
 */
async function reapIsolatedGroup(root: string): Promise<void> {
	const receipt = join(root, "process-group.json");
	if (!existsSync(receipt)) return;
	const identity = JSON.parse(readFileSync(receipt, "utf8")) as CodexProcessGroupIdentity;
	const groups = createCodexProcessGroupOperations();
	groups.signal(identity, "SIGKILL");
	const deadline = Date.now() + CHILD_BOUND_MS;
	while (groups.inspect(identity) !== "quiescent") {
		if (Date.now() >= deadline)
			throw new Error("The isolated pidfile process group did not close.");
		await Bun.sleep(TEST_PROCESS_GROUP_POLL_MS);
	}
}

/**
 * Start Bun with an isolated home before its runtime caches that location.
 * @param name - The original behavior under test.
 * @param body - The assertions run in the isolated process.
 */
function pidfileTest(name: string, body: () => void | Promise<void>): void {
	test(name, async () => {
		if (isolatedRoot !== undefined) {
			await body();
			writeFileSync(join(isolatedRoot, "completed-case.json"), JSON.stringify({ name }));
			return;
		}
		const root = mkdtempSync(join(tmpdir(), "archboard-pidfile-"));
		try {
			const child = Bun.spawnSync(
				[process.execPath, "test", import.meta.path, "--test-name-pattern", `^${name}$`],
				{
					env: {
						...process.env,
						...Object.fromEntries(HOME_VARIABLES.map((variable) => [variable, root])),
						ARCHBOARD_PIDFILE_TEST_ROOT: root,
					},
					stdout: "pipe",
					stderr: "pipe",
					detached: true,
					timeout: CHILD_BOUND_MS,
				},
			);
			if (child.exitCode !== 0) {
				throw new Error(`${child.stdout.toString()}\n${child.stderr.toString()}`);
			}
			expect(child.exitCode).toBe(0);
			// Exit zero alone also permits a runner that selected no case.
			expect(JSON.parse(readFileSync(join(root, "completed-case.json"), "utf8"))).toEqual({ name });
		} finally {
			try {
				await reapIsolatedGroup(root);
			} finally {
				rmSync(root, { recursive: true, force: true });
			}
		}
	});
}

/**
 * Point the state directory at a temporary root, so the sweep never reaches
 * the operator's own pidfiles.
 * @returns The isolated state directory.
 */
function isolatedState(): string {
	const directory = stateDir();
	if (isolatedRoot === undefined) throw new Error("The pidfile owner needs an isolated child.");
	const within = relative(isolatedRoot, directory);
	if (
		isAbsolute(within) ||
		within === ".." ||
		within.startsWith("../") ||
		within.startsWith("..\\")
	) {
		throw new Error("The pidfile state directory escapes the temporary root.");
	}
	mkdirSync(directory, { recursive: true });
	// Capture before any body can spawn a descendant, while the leader is live.
	writeFileSync(
		join(isolatedRoot, "process-group.json"),
		JSON.stringify(createCodexProcessGroupOperations().capture(process.pid)),
	);
	return directory;
}

pidfileTest("a sweep removes the pidfiles of gone servers and keeps live ones", () => {
	const directory = isolatedState();
	writePidFile(4101, process.pid);
	const live = readFileSync(pidFilePath(4101), "utf-8");
	expect(readPidFile(4101)).toBe(process.pid);

	const exitedPid = Bun.spawnSync(["true"]).pid;
	const reusedStartTime = `${live.trim().split(" ")[1]}0`;
	writeFileSync(join(directory, "server-4102.pid"), String(exitedPid));
	writeFileSync(join(directory, "server-4103.pid"), `${process.pid} ${reusedStartTime}\n`);
	// A pid-only file from an older build is judged by its pid alone.
	writeFileSync(join(directory, "server-4104.pid"), String(process.pid));
	writeFileSync(join(directory, "unrelated.pid"), String(exitedPid));

	expect(sweepDeadPidFiles()).toBe(2);
	expect(existsSync(join(directory, "server-4102.pid"))).toBeFalse();
	expect(existsSync(join(directory, "server-4103.pid"))).toBeFalse();
	expect(readFileSync(pidFilePath(4101), "utf-8")).toBe(live);
	expect(readPidFile(4104)).toBe(process.pid);
	expect(existsSync(join(directory, "unrelated.pid"))).toBeTrue();
});

let originalUrl: string | undefined;
let silentPort: Promise<{ port: number; stopServer: () => Promise<unknown> }> | undefined;

/**
 * Run `stopServer` with the server URL on a port nothing listens on, so the
 * health probe finds nothing, whatever pidfile the state directory holds. The
 * module reads its URL once, so every test shares the one port.
 * @returns The port, and the `stopServer` that talks to it.
 */
function stopAgainstSilentPort(): Promise<{ port: number; stopServer: () => Promise<unknown> }> {
	silentPort ??= (async () => {
		const probe = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } });
		const { port } = probe;
		probe.stop(true);
		originalUrl = process.env["ARCHBOARD_URL"];
		process.env["ARCHBOARD_URL"] = `http://127.0.0.1:${port}`;
		const { stopServer } = await import("#runtime/operations/stop.ts");
		return { port, stopServer };
	})();
	return silentPort;
}

afterAll(() => {
	if (silentPort === undefined) return;
	if (originalUrl === undefined) {
		delete process.env["ARCHBOARD_URL"];
	} else {
		process.env["ARCHBOARD_URL"] = originalUrl;
	}
});

pidfileTest(
	"stop keeps the pidfile of a live process that does not answer, and removes a dead one's",
	async () => {
		isolatedState();
		const { port, stopServer } = await stopAgainstSilentPort();

		const live = Bun.spawn(["sleep", "30"]);
		try {
			writePidFile(port, live.pid);
			await expect(stopServer()).rejects.toThrow(String(live.pid));
			expect(readPidFile(port)).toBe(live.pid);
		} finally {
			live.kill();
			await live.exited;
		}

		// The same pidfile, once its process has exited, is stale.
		expect(await stopServer()).toMatchObject({ stopped: false, pid: live.pid });
		expect(existsSync(pidFilePath(port))).toBeFalse();
	},
);

pidfileTest("stop keeps a pid-only pidfile of a live process, naming the pid", async () => {
	isolatedState();
	const { port, stopServer } = await stopAgainstSilentPort();

	const live = Bun.spawn(["sleep", "30"]);
	try {
		writeFileSync(pidFilePath(port), String(live.pid));
		await expect(stopServer()).rejects.toThrow(String(live.pid));
		expect(readPidFile(port)).toBe(live.pid);
	} finally {
		live.kill();
		await live.exited;
	}
});

pidfileTest(
	"stop reports not running when the recorded server exits while it shuts down",
	async () => {
		isolatedState();
		const { port, stopServer } = await stopAgainstSilentPort();

		// A server stops answering before its process exits and its pidfile goes.
		const closing = Bun.spawn(["sleep", "0.15"]);
		writePidFile(port, closing.pid);
		expect(await stopServer()).toMatchObject({ stopped: false, pid: closing.pid });
		expect(existsSync(pidFilePath(port))).toBeFalse();
		await closing.exited;
	},
);
