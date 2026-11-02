// What the Archboard server sends a pane over its socket, and what a caller gets back
// from an HTTP route.
//
// Every model message carries the model it is about. A tab can have two panes
// on two models, so a pane showing model A has to be able to tell that news
// about model B is not its business.

import type { ArchitectureClaim, ArchitectureModuleEditResult } from "@archboard/model/contract";

type DurableRequest = Extract<
	ArchitectureModuleEditResult,
	{ success: true }
>["checkpoint"]["request"];

/** What the server says to a pane. */
interface WebSocketMessage {
	type: WebSocketMessageType;
	/** The model it is about; null when the news is that there is no model. */
	paneKey?: string | null;
	[key: string]: unknown;
}

type WebSocketMessageType =
	// Temporary explanations changed in this tab, independently of the shown vault.
	| "architecture_explanations_changed"
	// Which board this pane is showing, and in which repository's vault: on
	// connect, whenever a show moves it, and when the repository's chosen checkout
	// changes. It carries no picture — the board is a file the server draws, and
	// the pane asks for the drawing itself (ADR 0023).
	| "pane_place"
	| "pane_model"
	// The repositories of this machine changed: a checkout was chosen. Keyless
	// and sent to every tab, because the navigator of each lists every one.
	| "repositories_changed"
	// Canonical model activity across every explicit vault (ADR 0022 and ADR 0068).
	// Every pane receives the snapshot, independently of its displayed reading.
	| "agent_activity"
	// Layout, addressed to one pane rather than to a model: the shell is asked
	// for another pane, or for this one to go.
	| "pane_open"
	| "pane_close"
	// A pane presenting a walkthrough is asked to go to a step, or to leave
	// (TASK-251). The position stays the pane's: this asks, and the pane's own
	// report says where it got to. Board-scoped, so a pane that has moved to
	// another board does not step through a walkthrough it is not showing.
	| "pane_present";

/** Canonical model activity, shared by every pane (ADR 0022 and ADR 0068). */
interface AgentActivity {
	/** The existing presentation key, `model:<id>`. */
	paneKey: string;
	model: ArchitectureClaim["target"]["model"];
	claims: ArchitectureClaim[];
	doing: (Pick<DurableRequest, "writer" | "doing"> & { at: string }) | null;
}

/** One vault's whole activity snapshot, sent to every pane. */
interface AgentActivityMessage extends WebSocketMessage {
	type: "agent_activity";
	/** The explicit vault that owns this model. */
	vault: string;
	activity: AgentActivity[];
}

export { type AgentActivityMessage, type WebSocketMessage };
