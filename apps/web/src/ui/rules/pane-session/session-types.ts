import type { AgentActivityMessage } from "@archboard/server-lifecycle/pane-messages";
// Shapes shared between the shell and the panes it hosts.
//
// Everything here describes a *session*: which model a pane is showing and how
// it stands with the server. None of it is model content.
// A legacy board's content reaches a pane as a drawn picture and never as a
// copy the browser could edit (ADR 0023), so there is nothing in this file that
// a pane could write back.

/** A model's address: what it is called, and which of its variants is shown. */
export interface LegacyIdentity {
	model: string;
	/** The variant's name, or `current` when the pane follows the designation. */
	variant: string;
}

/** What the server sends a pane over its socket. */
export interface WebSocketMessage {
	type: string;
	model?: string;
	reading?: unknown;
	/** The pane key a message is about. */
	paneKey?: string;
	identity?: LegacyIdentity;
	/** On `pane_place`: the vault the pane is in now (ADR 0050). On `agent_activity`: the vault the models are in. */
	vault?: string;
	/** On `pane_place`: the repository that vault is listed under, or null. */
	repository?: string | null;
	/**
	 * On `agent_activity`: every model of the named vault that an agent holds
	 * or has just written, as one snapshot. Keyless, and told to every pane.
	 */
	activity?: AgentActivityEntry[];
}

/** Every active canonical subject claim and the latest durable operation in one model. */
export type AgentActivityEntry = AgentActivityMessage["activity"][number];

/** What one pane tells the shell about itself. */
export interface PaneStatus {
	paneId: string;
	/** The pane's identity to the server — how a model is addressed to it. */
	clientId: string;
	connected: boolean;
	/**
	 * Whether the server has this pane: it accepted the pane's own report.
	 *
	 * Not the same as connected, and the difference is a real moment rather than
	 * a formality. A socket opens before the pane it carries has been registered,
	 * and in that window the server has nothing to address — so anything told to
	 * point this pane at a model is told there is no such pane.
	 */
	registered: boolean;
	model: LegacyIdentity | null;
	/**
	 * The model this pane is showing, or null before it is on one.
	 *
	 * What is on screen, which after a drill-down is the model somebody followed
	 * into rather than the one the pane was pointed at. Everything about this
	 * pane is about this model: its lock, what an agent is told it is looking
	 * at, the code a subject opens, the address, and what `browser panes` says.
	 */
	paneKey: string | null;
	/**
	 * The model the server pointed this pane at, or null before it pointed it
	 * anywhere.
	 *
	 * Not a second answer to "which model is this": it is where a drill starts
	 * from, which the viewer needs to keep its trail back out. Nothing else
	 * reads it.
	 */
	opened: string | null;
	/**
	 * The named view the model on screen is being read through, or null for the
	 * whole variant.
	 *
	 * What is DRAWN, like `paneKey` beside it, and for the same reason: a view
	 * id is a subject of one variant's content, so the view somebody chose on the
	 * model a pane was opened on names nothing on the model they followed a link
	 * into. An address written from the shell's remembered preference instead
	 * would carry the level above's view id down with the level below's model,
	 * and reopening it would ask for a view that model has not got.
	 */
	view: string | null;
	/**
	 * The vault the pane is in, as the server last said (ADR 0050), or null
	 * before the pane is known. Opaque: what the pane names on its calls, never
	 * shown and never in an address.
	 */
	vault: string | null;
	/**
	 * The repository the pane shows, by identity or by an untracked vault's
	 * registry name, or null when no listed repository reads its vault. This is
	 * what the address and the navigator name.
	 */
	repository: string | null;
}
