// What the composer may target right now, read from the transport's published
// state and nothing else: the pane's link and the authoritative in-progress turn.

import type { BrowserSnapshot } from "@/shared/codex-browser-model";
import type {
	BrowserWorkbenchState,
	WorkbenchComposerLink,
	WorkbenchComposerTurn,
} from "@/ui/workbench-composer/lib/contract";

const INSPECT_ONLY = "This Codex history is inspect-only.";
const UNBOUND = "This pane has no Codex workhorse yet.";

/**
 * The authoritative in-progress turn. The host's own steer owner refuses
 * unless exactly one turn is `inProgress` and its id is the one the command
 * named; the composer reads the same fact from the published snapshot rather
 * than remembering a turn it once saw.
 * @param snapshot The published snapshot.
 * @returns Idle, the one active turn, or ambiguous.
 */
function readComposerTurn(snapshot: BrowserSnapshot): WorkbenchComposerTurn {
	const active = snapshot.timeline?.turns.filter((turn) => turn.status === "inProgress") ?? [];
	const only = active[0];
	if (only === undefined) {
		return Object.freeze({ kind: "idle" });
	}
	if (active.length > 1) {
		return Object.freeze({ kind: "ambiguous", count: active.length });
	}
	return Object.freeze({ kind: "active", turnId: only.turnId });
}

/**
 * Why a workbench cannot take direct input.
 * @param state The transport state.
 * @returns The host's reason, or a sentence naming the readiness.
 */
function unavailableReason(state: BrowserWorkbenchState): string {
	if ("reason" in state) {
		return state.reason;
	}
	return `Codex is ${state.state.replaceAll("_", " ")}; the workhorse cannot accept direct input.`;
}

/**
 * What the composer may target right now. Only a connected, thread-capable
 * workbench whose pane link is `executable` can take a turn command; every
 * other reachable state is disabled with the host's own reason.
 * @param state The transport state.
 * @returns The link.
 */
function readComposerLink(state: BrowserWorkbenchState): WorkbenchComposerLink {
	if (state.kind !== "readiness" || state.state !== "thread_capable") {
		return Object.freeze({ kind: "unavailable", reason: unavailableReason(state) });
	}
	return linkOf(state.snapshot);
}

/**
 * The composer link of a thread-capable snapshot. An unbound pane has nothing
 * to inspect and nothing to send to, which is a different sentence and a
 * different next action from a workhorse this browser may read but never write.
 * @param snapshot The snapshot.
 * @returns The link.
 */
function linkOf(snapshot: BrowserSnapshot): WorkbenchComposerLink {
	const link = snapshot.threadLink;
	if (link.state === "unbound") {
		return Object.freeze({ kind: "unbound", reason: link.reason ?? UNBOUND });
	}
	if (link.state !== "executable") {
		return Object.freeze({ kind: "inspect_only", reason: link.reason ?? INSPECT_ONLY });
	}
	return Object.freeze({
		kind: "executable",
		threadId: link.threadId,
		turn: readComposerTurn(snapshot),
	});
}

export { readComposerLink, readComposerTurn };
