// The operating-system side of a renderer: its process tree, loopback port,
// setsid process group, and the cleanup audit that proves nothing survived.
import { existsSync, readFileSync, rmSync } from "node:fs";

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
import { cleanupPollMs, cleanupTimeoutMs } from "./proof-environment.ts";
// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no alias root; @/ resolves only into src/
import { errorMessage, snippet } from "./proof-values.ts";

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

interface CleanupAudit {
	pids: number[];
	processGroup: number | null;
	processGroupProven: boolean;
	candidateLeaderPid: number | null;
	candidateLeaderStartTime: string | null;
	groupAbsent: boolean;
	groupError: string | null;
	survivors: number[];
	leaderSettled: boolean;
	stdoutSettled: boolean;
	stderrSettled: boolean;
	pipesSettled: boolean;
	clean: boolean;
	profile: string | null;
	profileRemoved: boolean;
	port: number | null;
	portReleased: boolean;
	stdout: string;
	stderr: string;
}

/** Everything a renderer session holds that cleanup must release. */
interface RendererResources {
	child: Bun.Subprocess | null;
	candidate: RendererProcessGroupCandidate | null;
	processGroup: CodexProcessGroupIdentity | null;
	stdout: Promise<string> | null;
	stderr: Promise<string> | null;
	profile: string | null;
	port: number | null;
	/** Every pid observed in the renderer's tree, sorted. */
	pids: number[];
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
	server.stop(true);
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
		server?.stop(true);
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
 * The text of a settled output pipe, or a marker when it did not settle.
 * @param promise The pipe's text promise, if the pipe was opened.
 * @param settled Whether the promise settled before the cleanup deadline.
 * @returns The (shortened) text or a marker.
 */
async function settledPipeText(promise: Promise<string> | null, settled: boolean): Promise<string> {
	if (!settled) {
		return "[pipe did not settle before cleanup deadline]";
	}
	try {
		return snippet(await (promise ?? Promise.resolve("")));
	} catch (error) {
		return `[pipe failed: ${errorMessage(error)}]`;
	}
}

/**
 * Send SIGTERM to the renderer group; escalate to SIGKILL when it lingers.
 * @param group The proven group.
 * @param cleanupStartedAt The epoch millisecond cleanup started.
 * @param deadline The epoch millisecond deadline.
 * @returns Whether the group disappeared.
 */
async function terminateGroup(
	group: CodexProcessGroupIdentity,
	cleanupStartedAt: number,
	deadline: number,
): Promise<boolean> {
	processGroups.signal(group, "SIGTERM");
	const absent = await waitForProcessGroupAbsence(
		group,
		cleanupStartedAt + Math.max(0, cleanupTimeoutMs - 1_000),
	);
	if (absent || !processGroupExists(group.pgid)) {
		return absent;
	}
	processGroups.signal(group, "SIGKILL");
	return await waitForProcessGroupAbsence(group, deadline);
}

interface GroupCleanup {
	processGroup: CodexProcessGroupIdentity | null;
	processGroupProven: boolean;
	groupAbsent: boolean;
	groupError: string | null;
}

/**
 * Prove the renderer's group when it was not yet proven at spawn time.
 * @param resources The renderer's resources.
 * @param deadline The epoch millisecond deadline.
 * @returns The group, whether it is proven, and any error proving it.
 */
async function proveGroup(
	resources: RendererResources,
	deadline: number,
): Promise<Pick<GroupCleanup, "processGroup" | "processGroupProven" | "groupError">> {
	const { child, candidate, processGroup } = resources;
	if (!child || processGroup) {
		return { processGroup, processGroupProven: processGroup !== null, groupError: null };
	}
	if (!candidate) {
		return {
			processGroup,
			processGroupProven: false,
			groupError: "Chromium spawned without a guarded process-group candidate.",
		};
	}
	try {
		return {
			processGroup: await captureRendererProcessGroup(candidate, deadline),
			processGroupProven: true,
			groupError: null,
		};
	} catch (error) {
		return {
			processGroup,
			processGroupProven: false,
			groupError: `Could not prove Chromium's process group during cleanup: ${errorMessage(error)}`,
		};
	}
}

/**
 * Prove and terminate the renderer's process group.
 * @param resources The renderer's resources.
 * @param cleanupStartedAt The epoch millisecond cleanup started.
 * @param deadline The epoch millisecond deadline.
 * @returns The group outcome.
 */
async function cleanUpGroup(
	resources: RendererResources,
	cleanupStartedAt: number,
	deadline: number,
): Promise<GroupCleanup> {
	const proven = await proveGroup(resources, deadline);
	let groupAbsent = resources.child === null;
	let { groupError } = proven;
	const group = proven.processGroup;
	if (group && processGroupExists(group.pgid)) {
		try {
			groupAbsent = await terminateGroup(group, cleanupStartedAt, deadline);
		} catch (error) {
			groupAbsent = false;
			groupError = errorMessage(error);
		}
	}
	if (group && groupError === null) {
		groupAbsent = !processGroupExists(group.pgid);
	}
	return { ...proven, groupAbsent, groupError };
}

/**
 * Wait for every observed pid to leave procfs, until the deadline.
 * @param pids The observed pids.
 * @param deadline The epoch millisecond deadline.
 * @returns The pids still present.
 */
async function waitForSurvivors(pids: readonly number[], deadline: number): Promise<number[]> {
	let survivors = pids.filter((pid) => existsSync(`/proc/${pid}`));
	while (survivors.length > 0 && Date.now() < deadline) {
		// oxlint-disable-next-line no-await-in-loop -- polling procfs; each sleep must follow the previous check
		await Bun.sleep(cleanupPollMs);
		survivors = pids.filter((pid) => existsSync(`/proc/${pid}`));
	}
	return survivors;
}

/**
 * Whether the leader and its output pipes settled before the deadline.
 * @param resources The renderer's resources.
 * @param deadline The epoch millisecond deadline.
 * @returns The three settlement flags.
 */
async function settleStreams(
	resources: RendererResources,
	deadline: number,
): Promise<Pick<CleanupAudit, "leaderSettled" | "stdoutSettled" | "stderrSettled">> {
	const { child, stdout, stderr } = resources;
	const [leaderSettled, stdoutSettled, stderrSettled] = await Promise.all([
		child ? settlesBefore(child.exited, deadline) : Promise.resolve(true),
		stdout ? settlesBefore(stdout, deadline) : Promise.resolve(child === null),
		stderr ? settlesBefore(stderr, deadline) : Promise.resolve(child === null),
	]);
	return { leaderSettled, stdoutSettled, stderrSettled };
}

/**
 * Remove the renderer profile once its group is gone.
 * @param profile The profile directory, if one was created.
 * @param groupAbsent Whether the group is gone.
 * @returns Whether no profile remains on disk.
 */
function removeProfile(profile: string | null, groupAbsent: boolean): boolean {
	if (groupAbsent && profile) {
		rmSync(profile, { recursive: true, force: true });
	}
	return !profile || (groupAbsent && !existsSync(profile));
}

/**
 * Whether an audit proves every resource released.
 * @param audit The audit without its `clean` verdict.
 * @param resources The renderer's resources.
 * @returns The verdict.
 */
function isClean(audit: Omit<CleanupAudit, "clean">, resources: RendererResources): boolean {
	return (
		audit.groupAbsent &&
		audit.groupError === null &&
		(!resources.child || audit.processGroupProven) &&
		audit.survivors.length === 0 &&
		audit.leaderSettled &&
		audit.pipesSettled &&
		audit.profileRemoved &&
		audit.portReleased
	);
}

/**
 * Release a renderer's resources and prove that they were released: the
 * process group, every observed pid, the output pipes, the profile and the port.
 * @param resources The renderer's resources.
 * @returns The audit, `clean` when nothing survived.
 */
async function auditRendererCleanup(resources: RendererResources): Promise<CleanupAudit> {
	const cleanupStartedAt = Date.now();
	const deadline = cleanupStartedAt + cleanupTimeoutMs;
	const group = await cleanUpGroup(resources, cleanupStartedAt, deadline);
	const streams = await settleStreams(resources, deadline);
	const survivors = await waitForSurvivors(resources.pids, deadline);
	const profileRemoved = removeProfile(resources.profile, group.groupAbsent);
	const audit: Omit<CleanupAudit, "clean"> = {
		pids: resources.pids,
		processGroup: group.processGroup?.pgid ?? resources.candidate?.expectedGroup ?? null,
		processGroupProven: group.processGroupProven,
		candidateLeaderPid: resources.candidate?.leader.pid ?? null,
		candidateLeaderStartTime: resources.candidate?.leader.startTime ?? null,
		groupAbsent: group.groupAbsent,
		groupError: group.groupError,
		survivors,
		...streams,
		pipesSettled: streams.stdoutSettled && streams.stderrSettled,
		profile: resources.profile,
		profileRemoved,
		port: resources.port,
		portReleased: loopbackPortIsAvailable(resources.port),
		stdout: await settledPipeText(resources.stdout, streams.stdoutSettled),
		stderr: await settledPipeText(resources.stderr, streams.stderrSettled),
	};
	return { ...audit, clean: isClean(audit, resources) };
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
	auditRendererCleanup,
	captureRendererProcessGroup,
	captureRendererProcessGroupCandidate,
	injectAcquisitionFailure,
	loopbackPortIsAvailable,
	ownedProcessIds,
	pipe,
	reserveLoopbackPort,
	residentBytes,
	terminateProcessGroupForProof,
	type CleanupAudit,
	type RendererAcquisitionFailure,
	type RendererProcessGroupCandidate,
	type RendererResources,
};
