import type { BrowserSnapshot } from "../../../shared/codex-browser-model/index.js";
import type { BrowserWorkbenchState } from "../../workbench-transport/index.js";
import type { WorkbenchComposerLink, WorkbenchComposerTurn } from "../contract.js";

const INSPECT_ONLY = "This Codex history is inspect-only.";
const UNBOUND = "This pane has no Codex workhorse yet.";

/**
 * The authoritative in-progress turn.
 *
 * The host's own steer owner reads its thread and refuses unless exactly one
 * turn is `inProgress` and its id is the one the command named
 * (`src/server/canvas/lib/codex-workbench-text-actions.ts`). The composer reads
 * the same fact from the published snapshot rather than remembering a turn it
 * once saw, so a turn that finished, was interrupted, or was replaced is never
 * steered by a stale id.
 */
export function readComposerTurn(snapshot: BrowserSnapshot): WorkbenchComposerTurn {
	const timeline = snapshot.timeline;
	if (timeline === null) return Object.freeze({ kind: "idle" });
	const active = timeline.turns.filter((turn) => turn.status === "inProgress");
	const only = active[0];
	if (only === undefined) return Object.freeze({ kind: "idle" });
	if (active.length > 1) return Object.freeze({ kind: "ambiguous", count: active.length });
	return Object.freeze({ kind: "active", turnId: only.turnId });
}

function unavailableReason(state: BrowserWorkbenchState): string {
	if ("reason" in state) return state.reason;
	return `Codex is ${state.state.replaceAll("_", " ")}; the workhorse cannot accept direct input.`;
}

/**
 * What the composer may target right now. Only a connected, thread-capable
 * workbench whose pane link is `executable` can take a turn command; every
 * other reachable state is disabled with the host's own reason, because the
 * pane's link state is published by the snapshot rather than decided here
 * (TASK-143.03.03 owns choosing the link).
 */
export function readComposerLink(state: BrowserWorkbenchState): WorkbenchComposerLink {
	if (state.kind !== "readiness" || state.state !== "thread_capable")
		return Object.freeze({ kind: "unavailable", reason: unavailableReason(state) });
	const link = state.snapshot.threadLink;
	// An unbound pane has nothing to inspect and nothing to send to, which is a
	// different sentence and a different next action from a workhorse this
	// browser may read but never write.
	if (link.state === "unbound")
		return Object.freeze({ kind: "unbound", reason: link.reason ?? UNBOUND });
	if (link.state !== "executable")
		return Object.freeze({ kind: "inspect_only", reason: link.reason ?? INSPECT_ONLY });
	return Object.freeze({
		kind: "executable",
		threadId: link.threadId,
		turn: readComposerTurn(state.snapshot),
	});
}
