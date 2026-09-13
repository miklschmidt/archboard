// Shapes shared between the shell and the panes it hosts.
//
// Everything here describes a *session*: which board a pane is showing, who is
// writing it, and what they said they were doing. None of it is board content.
// A semantic board's content reaches a pane as a drawn picture and never as a
// copy the browser could edit (ADR 0023), so there is nothing in this file that
// a pane could write back.

import type { SemanticBoardEntry } from "@/ui/semantic-board-canvas";

/** A board's address: what it is called, and which of its variants is shown. */
export interface BoardIdentity {
	board: string;
	/** The variant's name, or `current` when the pane follows the designation. */
	variant: string;
}

/** One board as the vault lists it. */
export interface BoardEntry {
	/** The board key a pane is addressed with: `pipeline`, or `pipeline@variant`. */
	key: string;
	identity: BoardIdentity;
	/** Architecture level shared by every variant of this board. */
	level?: SemanticBoardEntry["level"];
	/** The persisted variant, absent for an unreadable board. */
	variant?: SemanticBoardEntry["variants"][number];
	error?: string;
}

/** Persisted board inventory returned by `/api/semantic-boards`. */
export interface PersistedBoardListing {
	boards: BoardEntry[];
}

/** Browser-session inventory returned by `/api/panes`. */
export interface BrowserPaneListing {
	panes: Array<{
		paneId: string;
		place: string;
		board: string;
		identity: BoardIdentity;
	}>;
}

/** UI-local projection of persisted boards and the live pane inventory. */
export interface BoardListing extends PersistedBoardListing {
	/** What each pane is holding right now, in reading order. */
	onScreen: Array<{ paneId: string; place: string; board: string }>;
}

/** What the server sends a pane over its socket. */
export interface WebSocketMessage {
	type: string;
	/** On `board_error`: the actionable refusal the shell must keep visible. */
	error?: string;
	/** The board a message is about, as a pane board key. */
	board?: string;
	identity?: BoardIdentity;
	/**
	 * On `board_note`: a semantic board changed. The panes showing that board
	 * ask the server for a new picture; nothing about a pane's own state follows
	 * from it, because the pane holds no copy of the content (ADR 0023).
	 */
	semantic?: boolean;
	/** On `board_note`: the version the board is at now. */
	version?: number | null;
	/** On `board_lock`: is anybody writing this board (ADR 0016). */
	held?: boolean;
	/** On `board_lock`: who, or null. `id` is their client id, so a pane can recognise itself. */
	holder?: LockHolder | null;
	/** On `board_doing`: the last few, oldest first, so a pane that has just arrived is not blank. */
	recent?: DoingEntry[];
	/**
	 * On `agent_activity`: every board this server serves that an agent holds
	 * or has just written, as one snapshot. Boardless: every client hears it.
	 */
	activity?: AgentActivityEntry[];
}

/**
 * What an agent is doing to one board, as every pane is shown it (ADR 0022).
 * Sent whole on connect and whenever an agent's lock or `doing` line changes;
 * an entry lingers a few seconds after an unclaimed write.
 */
export interface AgentActivityEntry {
	/** The board key. */
	board: string;
	/** The agent's claim, or null when it holds no claim. */
	claim: LockHolder | null;
	/** The latest thing the agent said it was doing, or null. */
	doing: DoingEntry | null;
}

/**
 * One thing an agent said it was doing to this board (TASK-095).
 *
 * Mirrors `DoingEntry` in `src/runtime/engine/board-doing.ts`. It is never board
 * content and it is nowhere in the board file: it is what somebody said while
 * changing something, and it dies with the canvas.
 */
export interface DoingEntry {
	doing: string;
	at: string;
	/** The writer's lock-holder id, so two agents on one board do not read as one. */
	by: string;
	kind: "human" | "agent";
	/** Part of a claim — a step of a campaign, rather than a lone act. */
	claimed?: boolean;
}

/**
 * Who holds a board's mutex. Mirrors `LockHolder` in `src/runtime/engine/board-lock.ts`,
 * which the pane cannot import: that module reads the vault off a filesystem a
 * browser has not got.
 */
export interface LockHolder {
	id: string;
	kind: "human" | "agent";
	since: string;
	until: string;
	process: string;
	reason?: string;
	/**
	 * A claim rather than one write: an agent has this board across everything it
	 * is doing, not for the twenty milliseconds of a single write.
	 *
	 * What a claim buys the person watching is disclosure: the banner naming the
	 * holder and their reason, and the one control that releases it (ADR 0022).
	 */
	claimed?: boolean;
}

/**
 * Whether a holder is an agent's claim rather than one passing write.
 * @param holder The lock holder, or null while the board is free.
 * @returns The claim, or null when there is nothing to announce.
 */
export function agentClaim(holder: LockHolder | null): LockHolder | null {
	return holder?.kind === "agent" && holder.claimed === true ? holder : null;
}

/** What one pane tells the shell about itself. */
export interface PaneStatus {
	paneId: string;
	/** The pane's identity to the server — how a board is addressed to it. */
	clientId: string;
	connected: boolean;
	/**
	 * Whether the server has this pane: it accepted the pane's own report.
	 *
	 * Not the same as connected, and the difference is a real moment rather than
	 * a formality. A socket opens before the pane it carries has been registered,
	 * and in that window the canvas has nothing to address — so anything told to
	 * point this pane at a board is told there is no such pane.
	 */
	registered: boolean;
	board: BoardIdentity | null;
	/**
	 * The board this pane is showing, or null before it is on one.
	 *
	 * What is on screen, which after a drill-down is the board somebody followed
	 * into rather than the one the pane was pointed at. Everything about this
	 * pane is about this board: its lock, what an agent is told it is looking
	 * at, the code a subject opens, the address, and what `browser panes` says.
	 */
	boardKey: string | null;
	/**
	 * The board the server pointed this pane at, or null before it pointed it
	 * anywhere.
	 *
	 * Not a second answer to "which board is this": it is where a drill starts
	 * from, which the viewer needs to keep its trail back out. Nothing else
	 * reads it.
	 */
	opened: string | null;
	/**
	 * The named view the board on screen is being read through, or null for the
	 * whole variant.
	 *
	 * What is DRAWN, like `boardKey` beside it, and for the same reason: a view
	 * id is a subject of one variant's content, so the view somebody chose on the
	 * board a pane was opened on names nothing on the board they followed a link
	 * into. An address written from the shell's remembered preference instead
	 * would carry the level above's view id down with the level below's board,
	 * and reopening it would ask for a view that board has not got.
	 */
	view: string | null;
	/** When this pane last heard its board change. */
	lastChangeAt: string | null;
	/**
	 * The last few things an agent said it was doing to this pane's board, oldest
	 * first (TASK-095). Short on purpose: a list of one-liners is glanceable from
	 * two metres away, and a transcript is a log nobody reads.
	 */
	doing: DoingEntry[];
	/** The board version this pane last heard about, or null before any news. */
	version: number | null;
}
