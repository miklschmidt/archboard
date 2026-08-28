import fs from "node:fs";
import { spawn } from "node:child_process";

import {
	TEST_CANVAS_HEALTH_POLL_MS,
	TEST_CANVAS_HEALTH_REQUEST_TIMEOUT_MS,
	TEST_CANVAS_SHUTDOWN_TIMEOUT_MS,
	TEST_CANVAS_STARTUP_TIMEOUT_MS,
} from "../../src/shared/timing/timing.ts";

const activeCanvases = new Set();
let handlersInstalled = false;
let interruptionInProgress = false;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const processExists = (pid) => {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
};

const uninstallHandlers = () => {
	if (!handlersInstalled || activeCanvases.size > 0) return;
	process.off("SIGINT", onSigint);
	process.off("SIGTERM", onSigterm);
	process.off("exit", onExit);
	handlersInstalled = false;
};

const disposeForSignal = async (signal) => {
	if (interruptionInProgress) return;
	interruptionInProgress = true;
	await Promise.allSettled([...activeCanvases].map((canvas) => canvas.dispose()));
	process.exit(signal === "SIGINT" ? 130 : 143);
};

function onSigint() {
	void disposeForSignal("SIGINT");
}

function onSigterm() {
	void disposeForSignal("SIGTERM");
}

function onExit() {
	for (const canvas of activeCanvases) canvas.disposeSync();
}

const installHandlers = () => {
	if (handlersInstalled) return;
	process.on("SIGINT", onSigint);
	process.on("SIGTERM", onSigterm);
	process.on("exit", onExit);
	handlersInstalled = true;
};

const exitDescription = ({ code, signal }) =>
	signal ? `signal ${signal}` : `exit ${code ?? "unknown"}`;

/** Start one canvas process whose child and temporary vault belong to this handle. */
export async function startCanvasTestProcess({ serverPath, port, vault, env = {} }) {
	const base = `http://127.0.0.1:${port}`;
	let child = null;
	let childExit = null;
	let exitPromise = null;
	let expectedStop = false;
	let disposed = false;
	let disposalPromise = null;
	let operation = Promise.resolve();
	let stderr = "";
	let registration;
	const enqueue = (work) => {
		const result = operation.then(work);
		operation = result.catch(() => {});
		return result;
	};
	const refuseDisposed = () => {
		if (disposed) throw new Error("Cannot restart a disposed canvas process.");
	};

	const deathError = (cause) => {
		const detail = childExit ? exitDescription(childExit) : "is no longer running";
		const tail = stderr.trim().split("\n").slice(-20).join("\n");
		const error = new Error(
			`Owned canvas pid ${child?.pid ?? "unknown"} died (${detail}).` +
				(tail ? `\nCanvas stderr:\n${tail}` : ""),
			{ cause },
		);
		error.code = "CANVAS_PROCESS_DIED";
		return error;
	};

	const assertRunningNow = (cause) => {
		if (childExit || !child || child.exitCode !== null || child.signalCode !== null) {
			throw deathError(cause);
		}
	};
	const assertRunning = async (cause) => {
		if (
			cause &&
			child &&
			!childExit &&
			child.exitCode === null &&
			child.signalCode === null &&
			exitPromise
		) {
			await Promise.race([exitPromise, sleep(TEST_CANVAS_HEALTH_POLL_MS)]);
		}
		assertRunningNow(cause);
	};

	const waitForExit = async (timeoutMs) => {
		if (!exitPromise || childExit) return true;
		return Promise.race([exitPromise.then(() => true), sleep(timeoutMs).then(() => false)]);
	};

	const stopCurrent = async (signal = "SIGTERM") => {
		if (!child || childExit) return;
		expectedStop = true;
		child.kill(signal);
		if (!(await waitForExit(TEST_CANVAS_SHUTDOWN_TIMEOUT_MS)) && processExists(child.pid)) {
			child.kill("SIGKILL");
			await waitForExit(TEST_CANVAS_SHUTDOWN_TIMEOUT_MS);
		}
		if (!childExit && processExists(child.pid)) {
			throw new Error(`Owned canvas pid ${child.pid} did not exit after SIGKILL.`);
		}
	};

	const start = async () => {
		refuseDisposed();
		childExit = null;
		expectedStop = false;
		child = spawn(process.execPath, [serverPath], {
			env: {
				...process.env,
				...env,
				PORT: String(port),
				HOST: "127.0.0.1",
				ARCHBOARD_VAULT: vault,
				LOG_LEVEL: "error",
			},
			stdio: ["ignore", "ignore", "pipe"],
		});
		stderr += stderr ? `\n--- canvas restart pid ${child.pid} ---\n` : "";
		child.stderr.on("data", (chunk) => {
			stderr += chunk.toString();
		});
		exitPromise = new Promise((resolve) => {
			child.once("exit", (code, signal) => {
				childExit = { code, signal, expected: expectedStop };
				resolve(childExit);
			});
		});

		const deadline = Date.now() + TEST_CANVAS_STARTUP_TIMEOUT_MS;
		while (Date.now() < deadline) {
			assertRunningNow();
			try {
				const response = await fetch(`${base}/health`, {
					signal: AbortSignal.timeout(TEST_CANVAS_HEALTH_REQUEST_TIMEOUT_MS),
				});
				const health = await response.json();
				if (health?.pid === child.pid) return;
				throw new Error(
					`Port ${port} answered for pid ${health?.pid ?? "unknown"}, not owned pid ${child.pid}.`,
				);
			} catch (error) {
				if (/answered for pid/.test(error?.message ?? "")) throw error;
				assertRunningNow(error);
				await sleep(TEST_CANVAS_HEALTH_POLL_MS);
			}
		}
		throw new Error(
			`Owned canvas pid ${child.pid} did not answer /health within ${TEST_CANVAS_STARTUP_TIMEOUT_MS}ms.` +
				(stderr.trim() ? `\nCanvas stderr:\n${stderr.trim()}` : ""),
		);
	};

	const disposeSync = () => {
		disposed = true;
		if (child && !childExit && processExists(child.pid)) child.kill("SIGKILL");
		fs.rmSync(vault, { recursive: true, force: true });
		activeCanvases.delete(registration);
	};

	const handle = {
		base,
		vault,
		get pid() {
			return child?.pid ?? null;
		},
		get stderr() {
			return stderr;
		},
		assertRunning,
		restart({ signal = "SIGTERM", whileStopped } = {}) {
			refuseDisposed();
			return enqueue(async () => {
				refuseDisposed();
				await stopCurrent(signal);
				await whileStopped?.();
				refuseDisposed();
				await start();
			});
		},
		dispose() {
			if (disposalPromise) return disposalPromise;
			disposed = true;
			disposalPromise = enqueue(async () => {
				try {
					await stopCurrent();
				} finally {
					fs.rmSync(vault, { recursive: true, force: true });
					activeCanvases.delete(registration);
					uninstallHandlers();
				}
			});
			return disposalPromise;
		},
	};

	registration = { dispose: () => handle.dispose(), disposeSync };
	activeCanvases.add(registration);
	installHandlers();
	try {
		await enqueue(start);
		return handle;
	} catch (error) {
		await handle.dispose();
		throw error;
	}
}
