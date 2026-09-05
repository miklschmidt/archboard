// The canonical board connection and persistence state a pane shows beside
// its workbench. This is board state only: the claim, the writer's doing
// lines, the take-back request and the semantic context delivery. Codex turn
// state never enters it.

import type { DoingEntry, LockHolder } from "@/ui/types";

/** Whether the pane's socket to the canvas server is live. */
type WorkbenchBoardConnectionState = "disconnected" | "reconnecting" | "connected";

/** Who holds the board across a campaign, if anybody. */
type WorkbenchBoardClaim =
	| Readonly<{ state: "unclaimed" }>
	| Readonly<{
			state: "claimed";
			holderId: string;
			holderKind: "human" | "agent";
			claimedAt: string;
			reason: string | null;
	  }>;

/** Where a take-back request stands. */
type WorkbenchTakeBackState = "idle" | "available" | "pending" | "success" | "failure";

/** The last semantic board-context delivery, as the host settled it. */
type WorkbenchSemanticContextState =
	| Readonly<{ state: "unavailable" }>
	| Readonly<{ state: "fresh"; detail: string }>
	| Readonly<{ state: "stale"; reason: string }>
	| Readonly<{ state: "ambiguous"; reasons: readonly string[] }>
	| Readonly<{ state: "refused"; reason: string }>
	| Readonly<{ state: "outcome_unknown"; reason: string }>;

/** How a take-back request ended. */
type WorkbenchTakeBackResult = Readonly<{ outcome: "success" }> | Readonly<{ outcome: "failure" }>;

/** What the projection reads. */
interface WorkbenchBoardStatusInput {
	readonly paneLabel: string;
	readonly connection: WorkbenchBoardConnectionState;
	readonly claim: WorkbenchBoardClaim;
	readonly doing: readonly DoingEntry[];
	readonly takeBack: WorkbenchTakeBackState;
	readonly semanticContext: WorkbenchSemanticContextState;
}

/** The semantic context with its words. */
type WorkbenchSemanticContextPresentation = WorkbenchSemanticContextState &
	Readonly<{ label: string; description: string }>;

/** The board activity a pane is in: offline, idle, or claimed by a writer. */
type WorkbenchBoardActivity = "offline" | "ready" | "working";

/** What the projection produces: every state with its words, frozen. */
interface WorkbenchBoardStatusSnapshot {
	readonly paneLabel: string;
	readonly connection: Readonly<{ state: WorkbenchBoardConnectionState; label: string }>;
	readonly claim: WorkbenchBoardClaim;
	readonly doing: Readonly<{ current: DoingEntry | null; history: readonly DoingEntry[] }>;
	readonly takeBack: Readonly<{
		state: WorkbenchTakeBackState;
		label: string;
		announcement: string | null;
	}>;
	readonly semanticContext: WorkbenchSemanticContextPresentation;
	readonly activity: WorkbenchBoardActivity;
}

/**
 * The claim a lock holder represents: only a durable claim counts, never a
 * single write's twenty-millisecond lock.
 * @param holder The board's lock holder, or null when nobody holds it.
 * @returns The claim.
 */
function claimFromLockHolder(holder: LockHolder | null): WorkbenchBoardClaim {
	if (holder?.claimed !== true) {
		return Object.freeze({ state: "unclaimed" });
	}
	return Object.freeze({
		state: "claimed",
		holderId: holder.id,
		holderKind: holder.kind,
		claimedAt: holder.since,
		reason: holder.reason?.trim() || null,
	});
}

export {
	claimFromLockHolder,
	type WorkbenchBoardActivity,
	type WorkbenchBoardClaim,
	type WorkbenchBoardConnectionState,
	type WorkbenchBoardStatusInput,
	type WorkbenchBoardStatusSnapshot,
	type WorkbenchSemanticContextPresentation,
	type WorkbenchSemanticContextState,
	type WorkbenchTakeBackResult,
	type WorkbenchTakeBackState,
};
