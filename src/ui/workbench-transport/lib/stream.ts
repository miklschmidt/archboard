// The one stream reducer: a snapshot replaces, a delta advances by exactly one
// sequence, anything else is stale, a gap, or a contradiction. The reducer
// never asks for recovery itself; it names what happened and the transport
// decides.

import {
	browserSnapshotRelationshipIssues,
	type BrowserSnapshot,
} from "@/shared/codex-browser-model";
import type {
	BrowserWorkbenchDeltaMessage,
	BrowserWorkbenchGatewayMessage,
	BrowserWorkbenchSnapshotMessage,
} from "@/ui/workbench-transport/contract";
import type { SocketRun } from "@/ui/workbench-transport/lib/socket-run";
import { BrowserWorkbenchWireError } from "@/ui/workbench-transport/lib/wire-identity";

/** What one message did to the run. */
type StreamStatus = "applied" | "duplicate" | "stale" | "gap";

/** What the reducer needs from its transport. */
interface StreamHost {
	readonly isCurrent: (run: SocketRun) => boolean;
	readonly markStale: (run: SocketRun, receivedSequence: number, reason: string) => void;
	readonly publishReadiness: (run: SocketRun) => void;
	readonly incompatible: (run: SocketRun, error: unknown) => void;
}

/**
 * Whether two wire values serialise identically.
 * @param left One value.
 * @param right The other.
 * @returns True when equal on the wire.
 */
function sameWireValue(left: unknown, right: unknown): boolean {
	return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * Adopt a snapshot at a sequence.
 * @param run The run.
 * @param snapshot The snapshot.
 * @param sequence Its sequence.
 * @param host The transport.
 * @returns Applied.
 */
function adopt(
	run: SocketRun,
	snapshot: BrowserSnapshot,
	sequence: number,
	host: StreamHost,
): StreamStatus {
	run.snapshot = snapshot;
	run.sequence = sequence;
	host.publishReadiness(run);
	return "applied";
}

/**
 * A message at the current sequence: a duplicate when identical, stale otherwise.
 * @param run The run.
 * @param candidate The snapshot the message would produce.
 * @param sequence The message sequence.
 * @param clearDuplicate Whether a duplicate republishes readiness.
 * @param host The transport.
 * @param reason The stale reason when the values differ.
 * @returns Duplicate or stale.
 */
function sameSequence(
	run: SocketRun,
	candidate: BrowserSnapshot,
	sequence: number,
	clearDuplicate: boolean,
	host: StreamHost,
	reason: string,
): StreamStatus {
	if (sameWireValue(candidate, run.snapshot)) {
		if (clearDuplicate) {
			host.publishReadiness(run);
		}
		return "duplicate";
	}
	host.markStale(run, sequence, reason);
	return "stale";
}

/**
 * Reduce a full snapshot.
 * @param run The run.
 * @param message The snapshot message.
 * @param clearDuplicate Whether a duplicate republishes readiness.
 * @param host The transport.
 * @returns What it did.
 */
function applySnapshot(
	run: SocketRun,
	message: BrowserWorkbenchSnapshotMessage,
	clearDuplicate: boolean,
	host: StreamHost,
): StreamStatus {
	if (run.snapshot === null || run.sequence === null || message.sequence > run.sequence) {
		return adopt(run, message.snapshot, message.sequence, host);
	}
	if (message.sequence < run.sequence) {
		host.markStale(run, message.sequence, "A stale workbench snapshot arrived.");
		return "stale";
	}
	return sameSequence(
		run,
		message.snapshot,
		message.sequence,
		clearDuplicate,
		host,
		"The workbench snapshot changed without advancing its sequence.",
	);
}

/**
 * The reason a delta cannot be applied by sequence alone, or null when it
 * advances by exactly one. Sequence first, contradiction second: a
 * redelivered older delta names an earlier state of a field the snapshot has
 * moved past, so merging it would produce a contradiction that says nothing
 * about the contract.
 * @param run The run.
 * @param sequence The delta sequence.
 * @returns The status and reason, or null.
 */
function deltaSequenceIssue(
	run: SocketRun,
	sequence: number,
): { readonly status: StreamStatus; readonly reason: string } | null {
	if (run.sequence === null) {
		return { status: "gap", reason: "A workbench delta arrived before a full snapshot." };
	}
	if (sequence > run.sequence + 1) {
		return { status: "gap", reason: "A workbench delta skipped a sequence." };
	}
	if (sequence < run.sequence) {
		return { status: "stale", reason: "A stale workbench delta arrived." };
	}
	return null;
}

/**
 * Adopt a merged delta at the next sequence unless it contradicts itself.
 * @param run The run.
 * @param candidate The merged snapshot.
 * @param sequence The delta sequence.
 * @param host The transport.
 * @returns Applied, or stale after an incompatibility.
 */
function adoptDelta(
	run: SocketRun,
	candidate: BrowserSnapshot,
	sequence: number,
	host: StreamHost,
): StreamStatus {
	const contradiction = browserSnapshotRelationshipIssues(candidate)[0];
	if (contradiction === undefined) {
		return adopt(run, candidate, sequence, host);
	}
	host.incompatible(
		run,
		new BrowserWorkbenchWireError(
			`The Codex workbench delta contradicts its snapshot at ${contradiction.path.join(".")}: ${contradiction.message}`,
		),
	);
	return "stale";
}

/**
 * Reduce a delta.
 * @param run The run.
 * @param message The delta message.
 * @param clearDuplicate Whether a duplicate republishes readiness.
 * @param host The transport.
 * @returns What it did.
 */
function applyDelta(
	run: SocketRun,
	message: BrowserWorkbenchDeltaMessage,
	clearDuplicate: boolean,
	host: StreamHost,
): StreamStatus {
	const issue = deltaSequenceIssue(run, message.sequence);
	if (issue !== null) {
		host.markStale(run, message.sequence, issue.reason);
		return issue.status;
	}
	if (run.snapshot === null) {
		host.markStale(run, message.sequence, "A workbench delta arrived before a full snapshot.");
		return "gap";
	}
	const candidate: BrowserSnapshot = Object.freeze({ ...run.snapshot, ...message.delta });
	if (message.sequence === run.sequence) {
		return sameSequence(
			run,
			candidate,
			message.sequence,
			clearDuplicate,
			host,
			"The workbench delta changed the current sequence.",
		);
	}
	return adoptDelta(run, candidate, message.sequence, host);
}

/**
 * Reduce one gateway message into the run.
 * @param run The run.
 * @param message The message.
 * @param clearDuplicate Whether a duplicate republishes readiness, clearing a stale state.
 * @param host The transport.
 * @returns What it did.
 */
function applyMessage(
	run: SocketRun,
	message: BrowserWorkbenchGatewayMessage,
	clearDuplicate: boolean,
	host: StreamHost,
): StreamStatus {
	if (!host.isCurrent(run)) {
		return "stale";
	}
	return message.kind === "snapshot"
		? applySnapshot(run, message, clearDuplicate, host)
		: applyDelta(run, message, clearDuplicate, host);
}

export { applyMessage, type StreamHost, type StreamStatus };
