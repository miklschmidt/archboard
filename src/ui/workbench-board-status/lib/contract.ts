import type { DoingEntry, LockHolder } from "../../types";

export type WorkbenchBoardConnectionState = "disconnected" | "reconnecting" | "connected";

export type WorkbenchBoardClaim =
	| Readonly<{ state: "unclaimed" }>
	| Readonly<{
			state: "claimed";
			holderId: string;
			holderKind: "human" | "agent";
			claimedAt: string;
			reason: string | null;
	  }>;

export type WorkbenchTakeBackState = "idle" | "available" | "pending" | "success" | "failure";

export type WorkbenchSemanticContextState =
	| Readonly<{ state: "unavailable" }>
	| Readonly<{ state: "fresh"; detail: string }>
	| Readonly<{ state: "stale"; reason: string }>
	| Readonly<{ state: "ambiguous"; reasons: readonly string[] }>
	| Readonly<{ state: "refused"; reason: string }>
	| Readonly<{ state: "outcome_unknown"; reason: string }>;

export type WorkbenchTakeBackResult =
	| Readonly<{ outcome: "success" }>
	| Readonly<{ outcome: "failure" }>;

export interface WorkbenchBoardStatusInput {
	readonly paneLabel: string;
	readonly connection: WorkbenchBoardConnectionState;
	readonly claim: WorkbenchBoardClaim;
	readonly doing: readonly DoingEntry[];
	readonly takeBack: WorkbenchTakeBackState;
	readonly semanticContext: WorkbenchSemanticContextState;
}

export interface WorkbenchBoardStatusSnapshot {
	readonly paneLabel: string;
	readonly connection: Readonly<{
		readonly state: WorkbenchBoardConnectionState;
		readonly label: string;
	}>;
	readonly claim: WorkbenchBoardClaim;
	readonly doing: Readonly<{
		readonly current: DoingEntry | null;
		readonly history: readonly DoingEntry[];
	}>;
	readonly takeBack: Readonly<{
		readonly state: WorkbenchTakeBackState;
		readonly label: string;
		readonly announcement: string | null;
	}>;
	readonly semanticContext: WorkbenchSemanticContextState &
		Readonly<{
			readonly label: string;
			readonly description: string;
		}>;
	/** TASK-140 selector compatibility. This is board state, never Codex turn state. */
	readonly legacyState: "offline" | "ready" | "working";
}

export interface WorkbenchBoardStatusProps {
	readonly paneLabel: string;
	readonly connection: WorkbenchBoardConnectionState;
	readonly claim: WorkbenchBoardClaim;
	readonly doing: readonly DoingEntry[];
	readonly semanticContext?: WorkbenchSemanticContextState;
	readonly onTakeBack?: () => Promise<WorkbenchTakeBackResult>;
	/** Controlled rendering for an owning frame and exhaustive state fixtures. */
	readonly takeBackState?: WorkbenchTakeBackState;
}

export function claimFromLockHolder(holder: LockHolder | null): WorkbenchBoardClaim {
	if (holder?.claimed !== true) return Object.freeze({ state: "unclaimed" });
	return Object.freeze({
		state: "claimed",
		holderId: holder.id,
		holderKind: holder.kind,
		claimedAt: holder.since,
		reason: holder.reason?.trim() || null,
	});
}
