// The pure projection: every closed state gets its words, and every value is
// frozen so a status region can hold it without copying.

import type {
	WorkbenchBoardActivity,
	WorkbenchBoardClaim,
	WorkbenchBoardConnectionState,
	WorkbenchBoardStatusInput,
	WorkbenchBoardStatusSnapshot,
	WorkbenchSemanticContextPresentation,
	WorkbenchSemanticContextState,
	WorkbenchTakeBackState,
} from "@/ui/workbench-board-status/lib/contract";

const CONNECTION_LABELS: Readonly<Record<WorkbenchBoardConnectionState, string>> = {
	disconnected: "Disconnected",
	reconnecting: "Reconnecting",
	connected: "Connected",
};

const TAKE_BACK_LABELS: Readonly<Record<WorkbenchTakeBackState, string>> = {
	idle: "No take back requested",
	available: "Take back control",
	pending: "Taking back control",
	success: "Control returned",
	failure: "Take back failed",
};

const TAKE_BACK_ANNOUNCEMENTS: Readonly<Record<WorkbenchTakeBackState, string | null>> = {
	idle: null,
	available: null,
	pending: "Taking back board control.",
	success: "Board control returned.",
	failure: "Board control could not be returned. Try again.",
};

const SEMANTIC_LABELS: Readonly<Record<WorkbenchSemanticContextState["state"], string>> = {
	unavailable: "Unavailable",
	fresh: "Fresh",
	stale: "Stale",
	ambiguous: "Ambiguous",
	refused: "Refused",
	outcome_unknown: "Outcome unknown",
};

/**
 * The words for one semantic context state.
 * @param state The state as the host settled it.
 * @returns The description a person reads.
 */
function semanticDescription(state: WorkbenchSemanticContextState): string {
	switch (state.state) {
		case "unavailable":
			return "No semantic context delivery is available for this pane.";
		case "fresh":
			return state.detail;
		case "ambiguous":
			return state.reasons.join("; ") || "The semantic target is ambiguous.";
		default:
			return state.reason;
	}
}

/**
 * The semantic context with its label and description.
 * @param state The state as the host settled it.
 * @returns The frozen presentation.
 */
function semanticPresentation(
	state: WorkbenchSemanticContextState,
): WorkbenchSemanticContextPresentation {
	const base =
		state.state === "ambiguous" ? { ...state, reasons: Object.freeze([...state.reasons]) } : state;
	return Object.freeze({
		...base,
		label: SEMANTIC_LABELS[state.state],
		description: semanticDescription(state),
	});
}

/**
 * The board activity: offline until connected, then idle or claimed.
 * @param connection The connection state.
 * @param claim The claim.
 * @returns The activity.
 */
function boardActivity(
	connection: WorkbenchBoardConnectionState,
	claim: WorkbenchBoardClaim,
): WorkbenchBoardActivity {
	if (connection !== "connected") {
		return "offline";
	}
	return claim.state === "claimed" ? "working" : "ready";
}

/**
 * Project the board status.
 * @param input The board facts.
 * @returns Every state with its words, frozen.
 */
function projectWorkbenchBoardStatus(
	input: WorkbenchBoardStatusInput,
): WorkbenchBoardStatusSnapshot {
	const history = Object.freeze(input.doing.map((entry) => Object.freeze({ ...entry })));
	return Object.freeze({
		paneLabel: input.paneLabel,
		connection: Object.freeze({
			state: input.connection,
			label: CONNECTION_LABELS[input.connection],
		}),
		claim: Object.freeze({ ...input.claim }),
		doing: Object.freeze({ current: history.at(-1) ?? null, history }),
		takeBack: Object.freeze({
			state: input.takeBack,
			label: TAKE_BACK_LABELS[input.takeBack],
			announcement: TAKE_BACK_ANNOUNCEMENTS[input.takeBack],
		}),
		semanticContext: semanticPresentation(input.semanticContext),
		activity: boardActivity(input.connection, input.claim),
	});
}

export { projectWorkbenchBoardStatus };
