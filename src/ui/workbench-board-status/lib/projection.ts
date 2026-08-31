import type {
	WorkbenchBoardStatusInput,
	WorkbenchBoardStatusSnapshot,
	WorkbenchSemanticContextState,
	WorkbenchTakeBackState,
} from "./contract";

const CONNECTION_LABELS = {
	disconnected: "Disconnected",
	reconnecting: "Reconnecting",
	connected: "Connected",
} as const;

const TAKE_BACK_LABELS = {
	idle: "No take back requested",
	available: "Take back control",
	pending: "Taking back control",
	success: "Control returned",
	failure: "Take back failed",
} as const;

const TAKE_BACK_ANNOUNCEMENTS = {
	idle: null,
	available: null,
	pending: "Taking back board control.",
	success: "Board control returned.",
	failure: "Board control could not be returned. Try again.",
} as const satisfies Record<WorkbenchTakeBackState, string | null>;

function semanticPresentation(
	state: WorkbenchSemanticContextState,
): WorkbenchSemanticContextState & {
	readonly label: string;
	readonly description: string;
} {
	switch (state.state) {
		case "unavailable":
			return Object.freeze({
				...state,
				label: "Unavailable",
				description: "No semantic context delivery is available for this pane.",
			});
		case "fresh":
			return Object.freeze({ ...state, label: "Fresh", description: state.detail });
		case "stale":
			return Object.freeze({ ...state, label: "Stale", description: state.reason });
		case "ambiguous":
			return Object.freeze({
				...state,
				reasons: Object.freeze([...state.reasons]),
				label: "Ambiguous",
				description: state.reasons.join("; ") || "The semantic target is ambiguous.",
			});
		case "refused":
			return Object.freeze({ ...state, label: "Refused", description: state.reason });
		case "outcome_unknown":
			return Object.freeze({ ...state, label: "Outcome unknown", description: state.reason });
	}
}

export function projectWorkbenchBoardStatus(
	input: WorkbenchBoardStatusInput,
): WorkbenchBoardStatusSnapshot {
	const history = Object.freeze(input.doing.map((entry) => Object.freeze({ ...entry })));
	const claimed = input.claim.state === "claimed";
	return Object.freeze({
		paneLabel: input.paneLabel,
		connection: Object.freeze({
			state: input.connection,
			label: CONNECTION_LABELS[input.connection],
		}),
		claim:
			input.claim.state === "claimed"
				? Object.freeze({ ...input.claim })
				: Object.freeze({ state: "unclaimed" }),
		doing: Object.freeze({ current: history.at(-1) ?? null, history }),
		takeBack: Object.freeze({
			state: input.takeBack,
			label: TAKE_BACK_LABELS[input.takeBack],
			announcement: TAKE_BACK_ANNOUNCEMENTS[input.takeBack],
		}),
		semanticContext: semanticPresentation(input.semanticContext),
		legacyState: input.connection === "connected" ? (claimed ? "working" : "ready") : "offline",
	});
}
