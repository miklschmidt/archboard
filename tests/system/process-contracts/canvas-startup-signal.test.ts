import { expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve as resolvePath } from "node:path";

import {
	openApplicationSocket,
	prepareProductionFixture,
} from "../canvas-state/support/codex-production.ts";
import { waitFor } from "../canvas-state/support/http.ts";
import { records, startCanvas } from "./support/codex-workbench-lifecycle.ts";
import {
	buildOwnedCanvasEnvironment,
	processExists,
	waitForProcessExit,
} from "../support/owned-canvas.ts";

const repoRoot = resolvePath(import.meta.dir, "../../..");
const fixtureSource = join(repoRoot, "tests/system/canvas-state/fixtures/fake-codex-production.ts");
const serverEntry = join(repoRoot, "src/server.ts");

async function freePort(): Promise<number> {
	const server = createServer();
	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen({ host: "127.0.0.1", port: 0, exclusive: true }, resolve);
	});
	const address = server.address();
	if (address === null || typeof address === "string") throw new Error("No loopback port.");
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
				`mock.module(${JSON.stringify(executableModule)}, () => ({ resolveProjectCodexExecutable: () => process.env.ARCHBOARD_TEST_CODEX_EXECUTABLE }));\n` +
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
		for (const directory of Object.values(paths))
			mkdirSync(directory, { recursive: true, mode: 0o700 });
		const canvas = spawn(process.execPath, [wrapper], {
			cwd: repoRoot,
			detached: true,
			env: buildOwnedCanvasEnvironment({
				paths,
				port,
				vault: fixture.vault,
				env: {
					ARCHBOARD_TEST_CODEX_EXECUTABLE: fixture.executablePath,
					ARCHBOARD_TEST_CODEX_LOG: fixture.logPath,
					ARCHBOARD_TEST_CODEX_CONTROL: fixture.controlPath,
					ARCHBOARD_SETTLE_MS: "20",
				},
			}),
			stdio: ["ignore", "pipe", "pipe"],
		});
		if (canvas.pid === undefined) throw new Error("The startup-signal canvas has no pid.");
		const canvasPid = canvas.pid;
		let output = "";
		canvas.stdout.on("data", (chunk: Buffer) => (output += chunk.toString()));
		canvas.stderr.on("data", (chunk: Buffer) => (output += chunk.toString()));
		const canvasExit = new Promise<void>((resolve) => canvas.once("exit", () => resolve()));
		resources.defer(async () => {
			if (!processExists(canvasPid)) return;
			try {
				process.kill(-canvasPid, "SIGKILL");
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
			}
			await canvasExit;
		});

		const childPid = await waitFor(() => {
			const entries = records(fixture.logPath);
			const held = entries.some((entry) => entry.kind === "initialize_held");
			const pid = entries.find((entry) => entry.kind === "app_server_spawn")?.pid;
			return held && pid !== undefined ? pid : undefined;
		}, "pre-readiness Codex child");
		if (childPid === undefined) throw new Error("The pre-readiness Codex child was not observed.");

		canvas.kill("SIGTERM");
		await Promise.race([
			canvasExit,
			new Promise<never>((_resolve, reject) =>
				setTimeout(
					() => reject(new Error(`Canvas did not stop after pre-readiness signal.\n${output}`)),
					5_000,
				),
			),
		]);
		await waitForProcessExit(canvasPid);
		await waitForProcessExit(childPid);
		expect(processExists(canvasPid)).toBeFalse();
		expect(processExists(childPid)).toBeFalse();

		writeFileSync(fixture.controlPath, JSON.stringify({ exit: false }));
		const replacement = await startCanvas(fixture);
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
