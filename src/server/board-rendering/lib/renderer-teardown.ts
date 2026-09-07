import { existsSync, rmSync } from "node:fs";

import type { ProcessIdentity } from "@/runtime/engine/process-group";
import type { CodexProcessGroupIdentity } from "@/runtime/codex-process/process-group";
import {
	captureGroup,
	loopbackPortIsAvailable,
	processGroups,
	rawProcessGroupAbsent,
	settlesBefore,
	waitForGroupAbsence,
	type CapturedPipe,
} from "@/server/board-rendering/lib/renderer-process";

/** How long each poll waits before looking again. */
const TEARDOWN_POLL_MS = 25;

/** What a stopped renderer session proved about its own teardown. */
interface RendererSessionCleanup {
	readonly clean: boolean;
	readonly pids: readonly number[];
	readonly processesGone: boolean;
	readonly survivors: readonly number[];
	readonly groupAbsent: boolean;
	readonly leaderSettled: boolean;
	readonly stdoutSettled: boolean;
	readonly stderrSettled: boolean;
	readonly profileRemoved: boolean;
	readonly tempRootRemoved: boolean;
	readonly portReleased: boolean;
	readonly errors: readonly string[];
}

/** Everything one renderer session acquired, as its teardown finds it. */
interface RendererSessionResources {
	readonly child: Bun.Subprocess | null;
	readonly candidate: ProcessIdentity | null;
	readonly group: CodexProcessGroupIdentity | null;
	readonly stdout: CapturedPipe | null;
	readonly stderr: CapturedPipe | null;
	readonly observed: readonly number[];
	readonly profile: string | null;
	readonly tempRoot: string | null;
	readonly port: number | null;
	readonly cleanupTimeoutMs: number;
}

/**
 * What a failure says, for a cleanup record that must stay serializable.
 * @param error Whatever was thrown.
 * @returns Its message.
 */
function messageOf(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/**
 * The process group the session led, captured now if it was not captured at
 * startup.
 * @param resources What the session acquired.
 * @param deadline When to give up.
 * @param errors Where to record a capture that failed.
 * @returns The group, or null when it could not be proved.
 */
async function provenGroup(
	resources: RendererSessionResources,
	deadline: number,
	errors: string[],
): Promise<CodexProcessGroupIdentity | null> {
	if (resources.group || !resources.candidate) {
		return resources.group;
	}
	try {
		return await captureGroup(resources.candidate, deadline);
	} catch (error) {
		errors.push(messageOf(error));
		return null;
	}
}

/**
 * Signal the process group and wait for it to go, escalating to SIGKILL.
 * @param group The group.
 * @param cleanupTimeoutMs How long the whole teardown may take.
 * @param deadline When to give up.
 * @param errors Where to record a failure.
 * @returns Whether the group is gone.
 */
async function endGroup(
	group: CodexProcessGroupIdentity,
	cleanupTimeoutMs: number,
	deadline: number,
	errors: string[],
): Promise<boolean> {
	try {
		if (processGroups.inspect(group) === "owned") {
			processGroups.signal(group, "SIGTERM");
		}
		const termDeadline = Date.now() + Math.max(0, cleanupTimeoutMs - 1_000);
		const wentOnTerm = await waitForGroupAbsence(group, termDeadline);
		if (wentOnTerm || processGroups.inspect(group) !== "owned") {
			return wentOnTerm;
		}
		processGroups.signal(group, "SIGKILL");
		return await waitForGroupAbsence(group, deadline);
	} catch (error) {
		errors.push(messageOf(error));
		return false;
	}
}

/**
 * End a session whose process group was never proved: kill the leader if it is
 * still running, and otherwise read the raw group it left behind.
 * @param child The leader.
 * @param errors Where to record a failure.
 * @returns Whether the group is gone.
 */
function endUnprovenGroup(child: Bun.Subprocess, errors: string[]): boolean {
	if (child.exitCode === null) {
		errors.push("Renderer process group could not be proved during cleanup.");
		child.kill("SIGKILL");
		return false;
	}
	try {
		const absent = rawProcessGroupAbsent(child.pid);
		if (!absent) {
			errors.push(
				`Renderer process group ${child.pid} survived after its leader exited before capture.`,
			);
		}
		return absent;
	} catch (error) {
		errors.push(messageOf(error));
		return false;
	}
}

/**
 * End the session's process group, however far its capture got.
 * @param resources What the session acquired.
 * @param deadline When to give up.
 * @param errors Where to record a failure.
 * @returns Whether the group is gone.
 */
async function endProcessGroup(
	resources: RendererSessionResources,
	deadline: number,
	errors: string[],
): Promise<boolean> {
	const group = await provenGroup(resources, deadline, errors);
	if (group) {
		return endGroup(group, resources.cleanupTimeoutMs, deadline, errors);
	}
	return resources.child === null ? true : endUnprovenGroup(resources.child, errors);
}

/**
 * Wait for every process the session observed to leave the process table.
 * @param pids The processes it observed.
 * @param deadline When to give up.
 * @returns Whatever is still there.
 */
async function waitForSurvivors(pids: readonly number[], deadline: number): Promise<number[]> {
	let survivors = pids.filter((pid) => existsSync(`/proc/${pid}`));
	while (survivors.length > 0 && Date.now() < deadline) {
		// oxlint-disable-next-line no-await-in-loop -- survivors are re-read after each pause, one round at a time
		await Bun.sleep(Math.min(TEARDOWN_POLL_MS, Math.max(0, deadline - Date.now())));
		survivors = pids.filter((pid) => existsSync(`/proc/${pid}`));
	}
	return survivors;
}

/**
 * Record whichever output pipe failed while it was being read.
 * @param resources What the session acquired.
 * @param errors Where to record it.
 */
function recordPipeFailures(resources: RendererSessionResources, errors: string[]): void {
	for (const [name, pipe] of [
		["stdout", resources.stdout],
		["stderr", resources.stderr],
	] as const) {
		const failure = pipe?.error();
		if (failure) {
			errors.push(`Renderer ${name} pipe failed: ${failure}`);
		}
	}
}

/**
 * Wait for the leader and both output pipes to settle, recording a pipe that
 * failed.
 * @param resources What the session acquired.
 * @param deadline When to give up.
 * @param errors Where to record a pipe failure.
 * @returns Whether each settled.
 */
async function settleOutputs(
	resources: RendererSessionResources,
	deadline: number,
	errors: string[],
): Promise<{ leaderSettled: boolean; stdoutSettled: boolean; stderrSettled: boolean }> {
	const [leaderSettled, stdoutSettled, stderrSettled] = await Promise.all([
		resources.child ? settlesBefore(resources.child.exited, deadline) : Promise.resolve(true),
		resources.stdout ? settlesBefore(resources.stdout.settled, deadline) : Promise.resolve(true),
		resources.stderr ? settlesBefore(resources.stderr.settled, deadline) : Promise.resolve(true),
	]);
	recordPipeFailures(resources, errors);
	return { leaderSettled, stdoutSettled, stderrSettled };
}

/**
 * Remove the temporary root, once nothing the session started can still be
 * writing into it.
 * @param tempRoot The root.
 * @param errors Where to record a removal that failed.
 */
function removeTempRoot(tempRoot: string | null, errors: string[]): void {
	if (tempRoot === null) {
		return;
	}
	try {
		rmSync(tempRoot, { recursive: true, force: true });
	} catch (error) {
		errors.push(messageOf(error));
	}
}

/**
 * Whether a teardown proved everything it had to: the process group gone,
 * every observed process gone, both pipes settled, the profile and temporary
 * root removed, the port free, and nothing recorded against it.
 * @param proof What the teardown proved.
 * @param proof.groupAbsent Whether the process group is gone.
 * @param proof.processesGone Whether every observed process is gone.
 * @param proof.outputsSettled Whether the leader and both pipes settled.
 * @param proof.removed Whether the profile, root and port were released.
 * @param proof.errors What was recorded against the teardown.
 * @returns True for a clean teardown.
 */
function isCleanTeardown(proof: {
	groupAbsent: boolean;
	processesGone: boolean;
	outputsSettled: boolean;
	removed: boolean;
	errors: readonly string[];
}): boolean {
	return (
		proof.groupAbsent &&
		proof.processesGone &&
		proof.outputsSettled &&
		proof.removed &&
		proof.errors.length === 0
	);
}

/**
 * Whether the leader and both output pipes all settled in time.
 * @param settled What each of them did.
 * @param settled.leaderSettled Whether the Chromium leader exited in time.
 * @param settled.stdoutSettled Whether its stdout pipe finished in time.
 * @param settled.stderrSettled Whether its stderr pipe finished in time.
 * @returns True when all three did.
 */
function allSettled(settled: {
	leaderSettled: boolean;
	stdoutSettled: boolean;
	stderrSettled: boolean;
}): boolean {
	return settled.leaderSettled && settled.stdoutSettled && settled.stderrSettled;
}

/**
 * What of the session's own storage and port is now free.
 * @param resources What the session acquired.
 * @returns Whether the profile, temporary root and control port were released.
 */
async function releasedResources(resources: RendererSessionResources): Promise<{
	profileRemoved: boolean;
	tempRootRemoved: boolean;
	portReleased: boolean;
}> {
	return {
		profileRemoved: !resources.profile || !existsSync(resources.profile),
		tempRootRemoved: !resources.tempRoot || !existsSync(resources.tempRoot),
		portReleased: await loopbackPortIsAvailable(resources.port),
	};
}

/**
 * Stop everything one renderer session owns and prove it: the process group,
 * the processes it observed, its output pipes, its temporary root and its
 * private control port.
 * @param resources What the session acquired.
 * @returns What the teardown proved.
 */
async function tearDownRendererSession(
	resources: RendererSessionResources,
): Promise<RendererSessionCleanup> {
	const errors: string[] = [];
	const pids = [...resources.observed].toSorted((left, right) => left - right);
	const deadline = Date.now() + resources.cleanupTimeoutMs;
	const groupAbsent = await endProcessGroup(resources, deadline, errors);
	const settled = await settleOutputs(resources, deadline, errors);
	const survivors = await waitForSurvivors(pids, deadline);
	const processesGone = survivors.length === 0;
	const outputsSettled = allSettled(settled);
	if (groupAbsent && processesGone && outputsSettled) {
		removeTempRoot(resources.tempRoot, errors);
	}
	const released = await releasedResources(resources);
	return {
		clean: isCleanTeardown({
			groupAbsent,
			processesGone,
			outputsSettled,
			removed: released.profileRemoved && released.tempRootRemoved && released.portReleased,
			errors,
		}),
		pids,
		processesGone,
		survivors,
		groupAbsent,
		...settled,
		...released,
		errors,
	};
}

export { tearDownRendererSession };
export type { RendererSessionCleanup, RendererSessionResources };
