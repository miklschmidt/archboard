// The cleanup audit: after a renderer run, prove that its process group, every
// process in its tree, its output pipes, its profile directory and its
// loopback port were all released, and record how that was established.
import { existsSync, rmSync } from "node:fs";

import type { CodexProcessGroupIdentity } from "@/runtime/codex-process/process-group";
import { processGroupExists } from "@/runtime/engine/process-group";
// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no alias root; @/ resolves only into src/
import { cleanupPollMs, cleanupTimeoutMs } from "./proof-environment.ts";
// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no alias root; @/ resolves only into src/
import { errorMessage, snippet } from "./proof-values.ts";
import {
	captureRendererProcessGroup,
	loopbackPortIsAvailable,
	processGroups,
	settlesBefore,
	waitForProcessGroupAbsence,
	type RendererProcessGroupCandidate,
	// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no alias root; @/ resolves only into src/
} from "./renderer-process.ts";

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
	return groupReleased(audit, resources) && processesReleased(audit) && filesAndPortReleased(audit);
}

/**
 * Whether the process group is gone and, when one was spawned, was proven ours.
 * @param audit The audit so far.
 * @param resources The renderer's resources.
 * @returns Whether the group is released.
 */
function groupReleased(audit: Omit<CleanupAudit, "clean">, resources: RendererResources): boolean {
	const provenIfSpawned = resources.child === null || audit.processGroupProven;
	return audit.groupAbsent && audit.groupError === null && provenIfSpawned;
}

/**
 * Whether every observed process is gone and its output pipes settled.
 * @param audit The audit so far.
 * @returns Whether the processes are released.
 */
function processesReleased(audit: Omit<CleanupAudit, "clean">): boolean {
	return audit.survivors.length === 0 && audit.leaderSettled && audit.pipesSettled;
}

/**
 * Whether the profile directory is gone and the loopback port is free.
 * @param audit The audit so far.
 * @returns Whether both are released.
 */
function filesAndPortReleased(audit: Omit<CleanupAudit, "clean">): boolean {
	return audit.profileRemoved && audit.portReleased;
}

/**
 * The group id the audit reports: the proven one, else the one the spawn
 * expected, else none because nothing was spawned.
 * @param group The group outcome of cleanup.
 * @param candidate The spawn-time candidate, when Chromium was spawned.
 * @returns The group id, or null.
 */
function reportedGroupId(
	group: GroupCleanup,
	candidate: RendererProcessGroupCandidate | null,
): number | null {
	if (group.processGroup) {
		return group.processGroup.pgid;
	}
	return candidate ? candidate.expectedGroup : null;
}

/**
 * How the audit names the renderer's process group and its spawn-time leader.
 * @param group The group outcome of cleanup.
 * @param candidate The spawn-time candidate, when Chromium was spawned.
 * @returns The group identity fields of the audit.
 */
function identifyGroup(
	group: GroupCleanup,
	candidate: RendererProcessGroupCandidate | null,
): Pick<
	CleanupAudit,
	| "processGroup"
	| "processGroupProven"
	| "candidateLeaderPid"
	| "candidateLeaderStartTime"
	| "groupAbsent"
	| "groupError"
> {
	const leader = candidate?.leader;
	return {
		processGroup: reportedGroupId(group, candidate),
		processGroupProven: group.processGroupProven,
		candidateLeaderPid: leader ? leader.pid : null,
		candidateLeaderStartTime: leader ? leader.startTime : null,
		groupAbsent: group.groupAbsent,
		groupError: group.groupError,
	};
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
		...identifyGroup(group, resources.candidate),
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

export { auditRendererCleanup, type CleanupAudit, type RendererResources };
