// An Archboard server the harness owns for one run: started on a free port with
// no vault, as every server starts, and named the run's vault by each call it
// gets (ADR 0049). It is known by its own pid through /health, and stopped by
// the run that started it. Every accepted write is on disk before it is answered, so
// stopping is never a loss.

import fs from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { z } from "zod";
import { SKILL_EVAL_MS } from "@archboard/timing";
import type { RunPaths } from "#runtime/processes/isolation.ts";
import { ownProcess, pause, settlesWithin } from "#runtime/processes/process.ts";

/** A running server. */
interface OwnedServer {
	readonly url: string;
	readonly port: number;
	readonly pid: number;
	readonly stop: () => Promise<void>;
}

const HealthSchema = z.object({ pid: z.number() }).passthrough();

/**
 * A port the OS says is free right now.
 * @returns The port.
 */
async function freePort(): Promise<number> {
	const probe = createServer();
	await new Promise<void>((resolve, reject) => {
		probe.once("error", reject);
		probe.listen({ host: "127.0.0.1", port: 0, exclusive: true }, resolve);
	});
	const address = probe.address();
	const port = address !== null && typeof address === "object" ? address.port : 0;
	await new Promise<void>((resolve) => {
		probe.close(() => resolve());
	});
	if (port === 0) throw new Error("the port probe reported no TCP port");
	return port;
}

/**
 * The pid /health reports, when the server at the URL answers.
 * @param url The server.
 * @returns The pid, or null when nothing answered.
 */
async function healthPid(url: string): Promise<number | null> {
	try {
		const response = await fetch(`${url}/health`, {
			signal: AbortSignal.timeout(SKILL_EVAL_MS.healthRequest),
		});
		const parsed = HealthSchema.safeParse(await response.json());
		return parsed.success ? parsed.data.pid : null;
	} catch {
		return null;
	}
}

/**
 * Waits until the server answers /health as itself, or gives up.
 * @param child The server process.
 * @param url Where it should answer.
 * @param log Where its stderr goes, for the failure message.
 * @param signal Cancels startup before the server is healthy.
 */
async function awaitHealthy(
	child: Bun.Subprocess,
	url: string,
	log: string,
	signal = new AbortController().signal,
): Promise<void> {
	const deadline = Date.now() + SKILL_EVAL_MS.serverStartup;
	while (Date.now() < deadline) {
		signal.throwIfAborted();
		// oxlint-disable-next-line no-await-in-loop -- readiness is polled: each probe decides whether to probe again
		if (await settlesWithin(child.exited, 0)) {
			throw new Error(
				`the evaluation server died before answering /health (exit ${child.exitCode ?? child.signalCode}); see ${log}`,
			);
		}
		// oxlint-disable-next-line no-await-in-loop -- readiness is polled: each probe decides whether to probe again
		const pid = await healthPid(url);
		signal.throwIfAborted();
		if (pid === child.pid) return;
		// oxlint-disable-next-line no-await-in-loop -- readiness is polled: each probe decides whether to probe again
		await pause(SKILL_EVAL_MS.healthPoll);
	}
	throw new Error(
		`the evaluation server did not answer /health within ${SKILL_EVAL_MS.serverStartup}ms; see ${log}`,
	);
}

/**
 * Starts one server for one run.
 * @param checkout The archboard checkout whose server runs.
 * @param paths The run.
 * @param env The run's environment.
 * @param signal Cancels startup before the server is healthy.
 * @returns The running server.
 */
async function startServer(
	checkout: string,
	paths: Pick<RunPaths, "serverLog">,
	env: Readonly<Record<string, string>>,
	signal?: AbortSignal,
): Promise<OwnedServer> {
	signal?.throwIfAborted();
	const port = await freePort();
	signal?.throwIfAborted();
	const url = `http://127.0.0.1:${port}`;
	const log = fs.openSync(paths.serverLog, "a");
	let child: Bun.Subprocess;
	try {
		child = Bun.spawn(
			[process.execPath, path.join(checkout, "apps", "server", "src", "server.ts")],
			{
				cwd: checkout,
				env: { ...env, PORT: String(port), HOST: "127.0.0.1" },
				detached: true,
				stdin: "ignore",
				stdout: "ignore",
				stderr: log,
			},
		);
	} finally {
		// Spawn duplicates the descriptor; the parent never owns the child's copy.
		fs.closeSync(log);
	}
	const owner = await ownProcess(child, SKILL_EVAL_MS.serverShutdown);
	try {
		await awaitHealthy(child, url, paths.serverLog, signal);
		return { url, port, pid: child.pid, stop: owner.stop };
	} catch (error) {
		await owner.stop();
		throw error;
	}
}

export { startServer, type OwnedServer };
