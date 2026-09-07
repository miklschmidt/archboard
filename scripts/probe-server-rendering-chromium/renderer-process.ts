// The operating-system side of a renderer: its process tree, its loopback
// port and its setsid process group. The audit that proves these were
// released after a run lives in renderer-cleanup.ts.
import { existsSync, readFileSync } from "node:fs";

import {
	processGroupExists,
	processIdentity,
	type ProcessIdentity,
} from "@/runtime/engine/process-group";
import {
	createCodexProcessGroupOperations,
	type CodexProcessGroupIdentity,
} from "@/runtime/codex-process/process-group";
// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no alias root; @/ resolves only into src/
import { cleanupPollMs } from "./proof-environment.ts";
// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no alias root; @/ resolves only into src/
import { errorMessage } from "./proof-values.ts";

const processGroups = createCodexProcessGroupOperations();

type RendererAcquisitionFailure =
	| "before-profile"
	| "after-profile"
	| "after-port"
	| "after-spawn-before-group-capture"
	| "group-capture-failure"
	| "group-capture-timeout"
	| "after-spawn";

interface RendererProcessGroupCandidate {
	readonly leader: ProcessIdentity;
	readonly expectedGroup: number;
}

/**
 * A child's piped output stream, refusing the inherited and closed forms.
 * @param stream The child's stdout or stderr.
 * @returns The stream.
 * @throws {Error} When the stream is not a pipe.
 */
function pipe(stream: ReadableStream<Uint8Array> | number | undefined): ReadableStream<Uint8Array> {
	if (!stream || typeof stream === "number") {
		throw new Error("Child did not expose the requested output pipe.");
	}
	return stream;
}

/**
 * The child pids of a process, read from procfs.
 * @param pid The parent pid.
 * @returns The children, or none when the process is gone.
 */
function childPids(pid: number): number[] {
	try {
		return readFileSync(`/proc/${pid}/task/${pid}/children`, "utf8")
			.trim()
			.split(/\s+/)
			.map(Number)
			.filter((parsed) => Number.isInteger(parsed) && parsed > 0);
	} catch {
		// Processes can finish while their group is sampled.
		return [];
	}
}

/**
 * Every live pid in a process's tree, the root included.
 * @param pid The tree's root pid.
 * @returns The pids in ascending order.
 */
function ownedProcessIds(pid: number): number[] {
	const seen = new Set<number>();
	/**
	 * Add a process and, recursively, its children.
	 * @param candidate The pid to visit.
	 */
	const visit = (candidate: number): void => {
		if (seen.has(candidate) || !existsSync(`/proc/${candidate}`)) {
			return;
		}
		seen.add(candidate);
		for (const child of childPids(candidate)) {
			visit(child);
		}
	};
	visit(pid);
	return [...seen].toSorted((left, right) => left - right);
}

/**
 * The resident memory of a process, from procfs.
 * @param pid The pid.
 * @returns The resident bytes, or zero when the process is gone.
 */
function residentBytesOf(pid: number): number {
	try {
		const match = readFileSync(`/proc/${pid}/status`, "utf8").match(/^VmRSS:\s+(\d+)\s+kB$/m);
		return match ? Number(match[1]) * 1024 : 0;
	} catch {
		return 0;
	}
}

/**
 * The resident memory of a set of processes.
 * @param pids The pids to sum.
 * @returns The total resident bytes.
 */
function residentBytes(pids: readonly number[]): number {
	return pids.reduce((total, pid) => total + residentBytesOf(pid), 0);
}

/**
 * A loopback port that was free a moment ago.
 * @returns The port number.
 * @throws {Error} When no port could be bound.
 */
function reserveLoopbackPort(): number {
	const server = Bun.serve({
		hostname: "127.0.0.1",
		port: 0,
		/**
		 * Answer the reservation probe.
		 * @returns A placeholder response.
		 */
		fetch: () => new Response("reserved"),
	});
	const { port } = server;
	void server.stop(true);
	if (typeof port !== "number") {
		throw new Error("Could not reserve a loopback port.");
	}
	return port;
}

/**
 * Whether a loopback port can be bound again, proving its previous owner released it.
 * @param port The port, or null when none was reserved.
 * @returns Whether the port is free (always true for null).
 */
function loopbackPortIsAvailable(port: number | null): boolean {
	if (port === null) {
		return true;
	}
	let server: ReturnType<typeof Bun.serve> | null = null;
	try {
		server = Bun.serve({
			hostname: "127.0.0.1",
			port,
			/**
			 * Answer the availability probe.
			 * @returns A placeholder response.
			 */
			fetch: () => new Response("audit"),
		});
		return true;
	} catch {
		return false;
	} finally {
		void server?.stop(true);
	}
}

/**
 * Throw at an acquisition stage the proof asked to fail, to exercise cleanup.
 * @param stage The stage being entered.
 * @param injected The stage the proof asked to fail, if any.
 * @throws {Error} When the stages match.
 */
function injectAcquisitionFailure<Stage extends string>(
	stage: Stage,
	injected: Stage | undefined,
): void {
	if (stage === injected) {
		throw new Error(`Injected acquisition failure at ${stage}.`);
	}
}

/**
 * Whether a promise settles, either way, before a deadline.
 * @param promise The promise to watch.
 * @param deadline The epoch millisecond deadline.
 * @returns Whether it settled in time.
 */
async function settlesBefore(promise: Promise<unknown>, deadline: number): Promise<boolean> {
	const remainingMs = Math.max(0, deadline - Date.now());
	return await Promise.race([
		promise.then(
			() => true,
			() => true,
		),
		Bun.sleep(remainingMs).then(() => false),
	]);
}

/**
 * Poll until a process group is gone or its identity is no longer provably ours.
 * @param identity The captured group.
 * @param deadline The epoch millisecond deadline.
 * @returns Whether the group disappeared in time.
 */
async function waitForProcessGroupAbsence(
	identity: CodexProcessGroupIdentity,
	deadline: number,
): Promise<boolean> {
	while (processGroupExists(identity.pgid)) {
		const ownership = processGroups.inspect(identity);
		if (ownership === "reused" || ownership === "unproven") {
			return false;
		}
		if (Date.now() >= deadline) {
			return false;
		}
		// oxlint-disable-next-line no-await-in-loop -- polling the same group; each sleep must follow the previous check
		await Bun.sleep(Math.min(cleanupPollMs, deadline - Date.now()));
	}
	return true;
}

/**
 * The spawn-time identity of the renderer leader, before its group is proven.
 * @param leaderPid The spawned pid.
 * @returns The candidate whose group id must equal its pid.
 */
function captureRendererProcessGroupCandidate(leaderPid: number): RendererProcessGroupCandidate {
	return { leader: processIdentity(leaderPid), expectedGroup: leaderPid };
}

/**
 * Capture the candidate's group once and check it against its spawn identity.
 * @param candidate The renderer leader candidate.
 * @returns The proven group identity.
 * @throws {Error} When the group or leader start time no longer match.
 */
function captureCandidateProcessGroup(
	candidate: RendererProcessGroupCandidate,
): CodexProcessGroupIdentity {
	const captured = processGroups.capture(candidate.leader.pid);
	if (
		captured.pgid !== candidate.expectedGroup ||
		captured.leaderStartTime !== candidate.leader.startTime
	) {
		throw new Error(
			`Chromium process group candidate ${candidate.leader.pid} no longer matches its spawn identity.`,
		);
	}
	return captured;
}

/**
 * Retry group capture until the deadline, since setsid needs a moment.
 * @param candidate The renderer leader candidate.
 * @param deadline The epoch millisecond deadline.
 * @param injectedFailure The acquisition stage the proof asked to fail, if any.
 * @returns The proven group identity.
 * @throws {Error} When the group cannot be proven before the deadline.
 */
async function captureRendererProcessGroup(
	candidate: RendererProcessGroupCandidate,
	deadline: number,
	injectedFailure?: RendererAcquisitionFailure,
): Promise<CodexProcessGroupIdentity> {
	if (injectedFailure === "group-capture-failure") {
		throw new Error("Injected acquisition failure at group-capture-failure.");
	}
	let lastError: unknown;
	while (Date.now() < deadline) {
		try {
			if (injectedFailure === "group-capture-timeout") {
				throw new Error("Injected group capture timeout.");
			}
			return captureCandidateProcessGroup(candidate);
		} catch (error) {
			lastError = error;
			// oxlint-disable-next-line no-await-in-loop -- retrying one capture; each attempt waits for the last
			await Bun.sleep(Math.max(0, Math.min(cleanupPollMs, deadline - Date.now())));
		}
	}
	throw new Error(
		`Chromium process ${candidate.leader.pid} did not establish its dedicated group: ${errorMessage(lastError)}.`,
		{ cause: lastError },
	);
}

/**
 * Send SIGTERM to a renderer's group, for the child-exit proof.
 * @param group The proven group.
 */
function terminateProcessGroupForProof(group: CodexProcessGroupIdentity): void {
	if (processGroupExists(group.pgid)) {
		processGroups.signal(group, "SIGTERM");
	}
}

export {
	captureRendererProcessGroup,
	captureRendererProcessGroupCandidate,
	injectAcquisitionFailure,
	loopbackPortIsAvailable,
	ownedProcessIds,
	pipe,
	processGroups,
	reserveLoopbackPort,
	residentBytes,
	settlesBefore,
	terminateProcessGroupForProof,
	waitForProcessGroupAbsence,
	type RendererAcquisitionFailure,
	type RendererProcessGroupCandidate,
};
