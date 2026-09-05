// The shell's chrome: what is on the canvas, and what can be done to it.
//
// Everything here is about the *board*, not about drawing — Excalidraw's own
// toolbar is the tool for that and we do not duplicate it. What replaced the
// old header is the difference between a POC's controls (a Sync button, a
// spinner, a last-sync clock) and an architecture surface's: which board, which
// variant, which level, whether it is written down.

import React, { useCallback } from "react";
import type { BoardHold, BoardIdentity, LockHolder, NoteWrittenElsewhere } from "../types";
import { Button } from "../button";
import { Icon } from "./Icons";

interface BoardBarProps {
	identity: BoardIdentity | null;
	boardKey: string | null;
	connected: boolean;
	/** A real cross-write claim, never the transient lock for one write. */
	claimedBy: LockHolder | null;
	/** Set while this board has stopped saving (ADR 0006, TASK-079). */
	hold: BoardHold | null;
	onHoldClick: () => void;
	/**
	 * Set while somebody outside archboard has written this board's note and this
	 * pane is still showing the older one (TASK-062). Shown only when there is no
	 * hold: a hold is this, one write later, and says more about it.
	 */
	writtenElsewhere: NoteWrittenElsewhere | null;
	onNoteClick: () => void;
	paneCount: number;
	onOpen: () => void;
	onClear: () => void;
	onOpenOpenerSettings: () => void;
	onAddPane: () => void;
	onClosePane: () => void;
	theme: "light" | "dark";
	onThemeChange: (theme: "light" | "dark") => void;
	busy: boolean;
}

const clock = (iso: string): string =>
	new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/**
 * What the mark on a held board says, in the bar, where there is room for one
 * line.
 *
 * It is a button rather than a banner because the three outcomes are behind it,
 * and it never opens itself: the refusal that produced it arrived 400 ms after
 * somebody lifted their finger, and a modal at that moment is the thing
 * TASK-079 exists to stop.
 */
function holdLabel(hold: BoardHold): string {
	if (hold.writes === 0) return "not saving";
	return `not saving · ${hold.writes} change${hold.writes === 1 ? "" : "s"} held`;
}

/**
 * The one line for a board whose note somebody else has written (TASK-062).
 *
 * The slot the "saved 14:32" text used to occupy, and it is not a smaller
 * version of that. Under ADR 0015 every gesture is written to the note, so
 * there is no unsaved board to report and no last-save moment worth printing —
 * the text that stood here said "unsaved changes" for the rest of a session
 * about a board that was fully written down.
 *
 * What is worth an alarm is the reverse, which nothing said at all: the note
 * this pane's board came from is not the note in the vault any more.
 */
/*
 * And which side is newer, now that a note carries a version (TASK-091). The
 * mark could say only that the note is not this board; "which of the two is
 * ahead" is the question a person actually has, and the answer changes what
 * they would do about it. Another archboard being three writes ahead is a
 * board somebody else is working on; a rollback is somebody's undo arriving
 * from the vault. Only the first two lines below could be said before.
 */
function noteLabel(written: NoteWrittenElsewhere): { copy: string; time?: string } {
	if (written.reason !== "changed") return { copy: "A note here archboard has not read" };
	if (written.versionMove === "ahead") {
		const by = (written.version ?? 0) - (written.ourVersion ?? 0);
		return {
			copy: `Note is ${by} write${by === 1 ? "" : "s"} ahead`,
			time: clock(written.writtenAt),
		};
	}
	if (written.versionMove === "behind") {
		return { copy: "Note was rolled back", time: clock(written.writtenAt) };
	}
	return { copy: "Note changed on disk", time: clock(written.writtenAt) };
}

export function BoardBar({
	identity,
	boardKey,
	connected,
	claimedBy,
	hold,
	onHoldClick,
	writtenElsewhere,
	onNoteClick,
	paneCount,
	onOpen,
	onClear,
	onOpenOpenerSettings,
	onAddPane,
	onClosePane,
	theme,
	onThemeChange,
	busy,
}: BoardBarProps): React.JSX.Element {
	const toggleTheme = useCallback(
		() => onThemeChange(theme === "dark" ? "light" : "dark"),
		[onThemeChange, theme],
	);
	const boardTitle = identity
		? `${identity.board}${identity.variant === "current" ? "" : ` / ${identity.variant}`}`
		: (boardKey ?? "No board");
	const writtenLabel = writtenElsewhere ? noteLabel(writtenElsewhere) : null;
	return (
		<header className="bar">
			<div className="bar-brand">
				<svg className="wordmark" aria-label="archboard">
					<title>archboard</title>
				</svg>
			</div>

			<div className="bar-board">
				<div className="bar-identity">
					<div className="bar-board-title">
						<span className="board-name">{boardTitle}</span>
						{identity?.level && <span className="level-tag">{identity.level}</span>}
					</div>
				</div>

				<div className="bar-board-meta" aria-label="Board status">
					<span
						className={`status ${connected ? "status-live" : "status-offline"}`}
						title={connected ? "Canvas server connected" : "The canvas server is not answering"}
					>
						<span className={`dot ${connected ? "dot-live" : "dot-dead"}`} />
						{connected ? "Connected" : "Offline"}
					</span>
					{!hold && !writtenElsewhere && (
						<>
							<span className="bar-meta-rule" aria-hidden="true" />
							<span className="meta meta-vault">
								<Icon name="check" size={13} />
								<span>In the vault</span>
							</span>
						</>
					)}

					{/* Saving and ownership are independent; a hold must not hide a claim. */}
					{hold ? (
						<Button
							tone="quiet"
							className="chip chip-held"
							onClick={onHoldClick}
							title={`${hold.message}\n\nClick for the three ways out.`}
						>
							{holdLabel(hold)}
						</Button>
					) : writtenElsewhere && writtenLabel ? (
						<Button
							tone="quiet"
							className="chip chip-elsewhere"
							onClick={onNoteClick}
							title={`${writtenElsewhere.message}\n\nClick to see what you can do about it.`}
						>
							<span>{writtenLabel.copy}</span>
							{writtenLabel.time && <time className="chip-time">{writtenLabel.time}</time>}
						</Button>
					) : null}
				</div>
				{claimedBy ? (
					<div className="bar-board-state" aria-label="Board ownership">
						<span className="bar-claim" title={claimedBy.reason || claimedBy.id}>
							<Icon name="lock" size={16} />
							<span className="claim-label">Claimed by</span>
							<span className="claim-id">{claimedBy.id}</span>
						</span>
					</div>
				) : null}
			</div>

			<nav className="bar-actions" aria-label="Board actions">
				<Button
					tone="quiet"
					className="bar-action"
					onClick={onOpen}
					disabled={busy}
					aria-label="Open board"
				>
					<Icon name="folder" />
					<span className="optional-label">Open</span>
				</Button>
				{paneCount < 2 ? (
					<Button
						tone="quiet"
						className="bar-action"
						onClick={onAddPane}
						title="Open a second pane"
						aria-label="Split"
					>
						<Icon name="split" />
						<span className="optional-label">Split</span>
					</Button>
				) : (
					<Button
						tone="quiet"
						className="bar-action"
						onClick={onClosePane}
						title="Back to one pane"
						aria-label="Unsplit"
					>
						<Icon name="split" />
						<span className="optional-label">Unsplit</span>
					</Button>
				)}
				<Button
					tone="quiet"
					size="icon"
					className="text-muted-foreground hover:text-destructive"
					onClick={onClear}
					disabled={busy}
					title="Clear board"
					aria-label="Clear board"
				>
					<Icon name="trash" />
				</Button>
				<Button
					tone="quiet"
					size="icon"
					className="text-muted-foreground"
					onClick={onOpenOpenerSettings}
					title="Opener settings"
					aria-label="Opener settings"
				>
					<Icon name="settings" />
				</Button>
				<Button
					tone="quiet"
					size="icon"
					className="text-muted-foreground"
					onClick={toggleTheme}
					title={theme === "dark" ? "Use light theme" : "Use dark theme"}
					aria-label={theme === "dark" ? "Use light theme" : "Use dark theme"}
				>
					<Icon name={theme === "dark" ? "sun" : "moon"} />
				</Button>
			</nav>
		</header>
	);
}
