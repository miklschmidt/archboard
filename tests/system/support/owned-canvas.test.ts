import { afterAll, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
	TEST_CANVAS_CHILD_EXIT_TIMEOUT_MS,
	TEST_CANVAS_EARLY_DEATH_DELAY_MS,
	TEST_CANVAS_LISTENER_PROBE_TIMEOUT_MS,
} from "../../../src/shared/timing/timing.ts";
import { processExists, startOwnedCanvas, type OwnedCanvas } from "./owned-canvas.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const serverPath = path.join(repoRoot, "src/server.ts");
const thisFile = fileURLToPath(import.meta.url);

const portFor = (): number => 37_000 + Math.floor(Math.random() * 12_000);

async function readJson(canvas: OwnedCanvas, responsePromise: Promise<Response>): Promise<unknown> {
	await canvas.assertRunning();
	try {
		const response = await responsePromise;
		await canvas.assertRunning();
		const body = await response.json();
		await canvas.assertRunning();
		return body;
	} catch (error) {
		await canvas.assertRunning(error);
		throw error;
	}
}

if (process.env.ARCHBOARD_LIFECYCLE_SERVER === "early-death") {
	Bun.serve({
		hostname: "127.0.0.1",
		port: Number(process.env.PORT),
		fetch(request) {
			const pathname = new URL(request.url).pathname;
			if (pathname === "/health") return Response.json({ pid: process.pid });
			if (pathname === "/die-after-headers") {
				const body = new ReadableStream({
					start(controller) {
						controller.enqueue(new TextEncoder().encode('{"unfinished":'));
						// oxlint-disable-next-line no-console -- child stderr is the contract under test.
						console.error("intentional early canvas death after response headers");
						setTimeout(() => process.exit(23), TEST_CANVAS_EARLY_DEATH_DELAY_MS);
					},
				});
				return new Response(body, { headers: { "Content-Type": "application/json" } });
			}
			return new Response("not found", { status: 404 });
		},
	});
	await new Promise(() => undefined);
}

interface OwnedRecord {
	marker: "owned-canvas";
	mode: string;
	pid: number;
	vault: string;
	base: string;
}

const childMode = process.env.ARCHBOARD_LIFECYCLE_CHILD;
if (childMode) {
	const vault = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-lifecycle-child-"));
	let owned: OwnedCanvas | undefined;
	try {
		owned = await startOwnedCanvas({
			serverPath: childMode === "early-death" ? thisFile : serverPath,
			port: Number(process.env.ARCHBOARD_LIFECYCLE_PORT),
			vault,
			...(childMode === "early-death"
				? { env: { ARCHBOARD_LIFECYCLE_SERVER: "early-death" } }
				: {}),
		});
		// oxlint-disable-next-line no-console -- JSON lines are the child protocol.
		console.log(
			JSON.stringify({
				marker: "owned-canvas",
				mode: childMode,
				pid: owned.pid!,
				vault,
				base: owned.base,
			} satisfies OwnedRecord),
		);
		if (childMode === "interrupt") await new Promise(() => undefined);
		if (childMode === "normal") await Promise.all([owned.dispose(), owned.dispose()]);
		if (childMode === "failure") {
			let failed = false;
			try {
				await fetch("http://127.0.0.1:1/forced-fetch-failure");
			} catch {
				failed = true;
			} finally {
				await owned.dispose();
			}
			if (!failed) throw new Error("The lifecycle failure probe did not fail its fetch.");
		}
		if (childMode === "restart-dispose-race") {
			let releaseRestart!: () => void;
			let reachedStopped!: () => void;
			const stopped = new Promise<void>((resolve) => (reachedStopped = resolve));
			const restartGate = new Promise<void>((resolve) => (releaseRestart = resolve));
			const restart = owned.restart({
				whileStopped: () => {
					reachedStopped();
					return restartGate;
				},
			});
			await stopped;
			const disposal = owned.dispose();
			releaseRestart();
			let restartError: unknown;
			try {
				await restart;
			} catch (error) {
				restartError = error;
			}
			await disposal;
			if (
				!(restartError instanceof Error) ||
				!/disposed canvas process/.test(restartError.message)
			) {
				throw new Error(`Restart escaped concurrent disposal as pid ${owned.pid ?? "unknown"}.`);
			}
			// oxlint-disable-next-line no-console -- JSON lines are the child protocol.
			console.log(JSON.stringify({ marker: "restart-race", restartRejected: true }));
		}
		if (childMode === "early-death") {
			let reported = "";
			try {
				await readJson(owned, fetch(`${owned.base}/die-after-headers`));
			} catch (error) {
				reported = error instanceof Error ? error.message : String(error);
			}
			if (!/died/.test(reported) || !/intentional early canvas death/.test(reported)) {
				throw new Error(`Early death was not reported with stderr: ${reported}`);
			}
			// oxlint-disable-next-line no-console -- JSON lines are the child protocol.
			console.log(JSON.stringify({ marker: "early-death", reported }));
		}
		await owned.dispose();
		process.exit(0);
	} catch (error) {
		await owned?.dispose();
		if (!owned) fs.rmSync(vault, { recursive: true, force: true });
		// oxlint-disable-next-line no-console -- the parent retains child diagnostics.
		console.error(error instanceof Error ? error.stack : String(error));
		process.exit(1);
	}
}

interface ChildResult {
	code: number | null;
	stderr: string;
	records: Array<Record<string, unknown>>;
	owned?: OwnedRecord;
}

const parseRecords = (stdout: string): Array<Record<string, unknown>> =>
	stdout
		.trim()
		.split("\n")
		.filter(Boolean)
		.flatMap((line) => {
			try {
				return [JSON.parse(line) as Record<string, unknown>];
			} catch {
				return [];
			}
		});

async function runLifecycleChild(mode: string): Promise<ChildResult> {
	const child = spawn(process.execPath, [thisFile], {
		env: {
			...process.env,
			ARCHBOARD_LIFECYCLE_CHILD: mode,
			ARCHBOARD_LIFECYCLE_PORT: String(portFor()),
		},
		stdio: ["ignore", "pipe", "pipe"],
	});
	let stdout = "";
	let stderr = "";
	let interrupted = false;
	child.stdout.on("data", (chunk: Buffer) => {
		stdout += chunk.toString();
		if (mode === "interrupt" && !interrupted && stdout.includes('"marker":"owned-canvas"')) {
			interrupted = true;
			child.kill("SIGINT");
		}
	});
	child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
	let timeout: Timer | undefined;
	const code = await Promise.race([
		new Promise<number | null>((resolve) => child.once("exit", resolve)),
		new Promise<never>((_, reject) => {
			timeout = setTimeout(() => {
				child.kill("SIGKILL");
				reject(new Error(`Lifecycle child ${mode} pid ${child.pid} did not exit.`));
			}, TEST_CANVAS_CHILD_EXIT_TIMEOUT_MS);
		}),
	]).finally(() => clearTimeout(timeout));
	const records = parseRecords(stdout);
	return {
		code,
		stderr,
		records,
		owned: records.find((record) => record.marker === "owned-canvas") as OwnedRecord | undefined,
	};
}

async function listenerAnswers(base: string): Promise<boolean> {
	try {
		await fetch(`${base}/health`, {
			signal: AbortSignal.timeout(TEST_CANVAS_LISTENER_PROBE_TIMEOUT_MS),
		});
		return true;
	} catch {
		return false;
	}
}

describe("owned canvas lifecycle", () => {
	const emergencyVaults = new Set<string>();
	afterAll(() => {
		for (const vault of emergencyVaults) fs.rmSync(vault, { recursive: true, force: true });
	});

	for (const mode of ["normal", "failure", "interrupt", "early-death", "restart-dispose-race"]) {
		test(
			`cleans up after ${mode}`,
			async () => {
				const result = await runLifecycleChild(mode);
				expect(result.code).toBe(mode === "interrupt" ? 130 : 0);
				expect(result.owned).toBeDefined();
				const owned = result.owned!;
				emergencyVaults.add(owned.vault);
				expect(processExists(owned.pid)).toBeFalse();
				expect(await listenerAnswers(owned.base)).toBeFalse();
				expect(fs.existsSync(owned.vault)).toBeFalse();
				if (mode === "early-death") {
					const report = result.records.find((record) => record.marker === "early-death");
					expect(String(report?.reported)).toContain("intentional early canvas death");
				}
				if (mode === "restart-dispose-race") {
					expect(result.records).toContainEqual({ marker: "restart-race", restartRejected: true });
				}
			},
			TEST_CANVAS_CHILD_EXIT_TIMEOUT_MS + 2_000,
		);
	}

	test("refuses a foreign pid answering on the requested port", async () => {
		const port = portFor();
		const vault = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-foreign-pid-"));
		emergencyVaults.add(vault);
		const foreign = Bun.serve({
			hostname: "127.0.0.1",
			port,
			fetch: () => Response.json({ pid: process.pid }),
		});
		try {
			let failure: unknown;
			try {
				await startOwnedCanvas({ serverPath, port, vault });
			} catch (error) {
				failure = error;
			}
			expect(failure).toBeInstanceOf(Error);
			expect((failure as Error).message).toMatch(/answered for pid .* not owned pid/);
		} finally {
			void foreign.stop(true);
		}
		expect(fs.existsSync(vault)).toBeFalse();
	});
});
