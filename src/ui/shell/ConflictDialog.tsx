// What the shell shows when a save is refused.
//
// The server checked the note's hash before writing, found bytes it had never
// seen, and wrote nothing (ADR 0006). Excalidraw scenes do not merge, so one of
// the two copies has to lose — and archboard is not allowed to pick. This
// dialog is that refusal made choosable: the same three outcomes the CLI
// prints, as three buttons.
//
// Built on Modal like ConfirmDialog, and follows its conventions: the safe
// control is what focus lands on, Escape and a tap outside cancel. Unlike
// ConfirmDialog there is no single confirm — three of the four ways out of
// here lose somebody's work, so each one gets a line saying whose.
//
// IT NEVER OPENS ITSELF WHILE SOMEBODY IS DRAWING (TASK-079). Every gesture is
// a write now, so the refusal this reports arrives about 400 ms after a finger
// lifts, which nobody asked for. What happens then is that the board stops
// saving and says so in the bar; this opens when the mark is clicked, or when a
// save the human ran is refused. `hold` is which of the two it was, and it
// changes what each outcome costs: with a board held, there are changes on this
// canvas and in nothing else, and reload is the button that ends them.

import React, { useMemo } from "react";
import { Modal } from "./Modal";
import type { BoardHold, BoardWriteConflict } from "../types";

interface ConflictDialogProps {
	conflict: BoardWriteConflict;
	/** Set when this board has stopped saving rather than one save being refused. */
	hold?: BoardHold | null;
	busy?: boolean;
	onReload: () => void;
	onOverwrite: () => void;
	onSaveAs: () => void;
	onCancel: () => void;
}

const clock = (iso: string | undefined): string =>
	iso ? new Date(iso).toLocaleString() : "an unknown time";

const changes = (n: number): string => `${n} change${n === 1 ? "" : "s"}`;

export function ConflictDialog({
	conflict,
	hold,
	busy,
	onReload,
	onOverwrite,
	onSaveAs,
	onCancel,
}: ConflictDialogProps): React.JSX.Element {
	const held = hold?.writes ?? 0;
	const footer = useMemo(
		() => (
			<button className="btn btn-quiet btn-big" data-autofocus onClick={onCancel} disabled={busy}>
				{hold ? "Decide later" : "Do nothing"}
			</button>
		),
		[busy, hold, onCancel],
	);
	return (
		<Modal
			title={hold ? "This board is not being saved" : "Not saved — the note changed on disk"}
			wide
			onCancel={onCancel}
			footer={footer}
		>
			<p>
				{conflict.reason === "changed" ? (
					<>
						<strong>{conflict.board}</strong> changed on disk after archboard read it, so saving
						would have deleted that change. <strong>Nothing was written.</strong>
					</>
				) : (
					<>
						There is already a note at this address that archboard has never read, so it cannot tell
						what saving would delete. <strong>Nothing was written.</strong>
					</>
				)}
			</p>
			{hold && (
				<p>
					It stopped saving at {clock(hold.since)}.{" "}
					{held > 0 ? (
						<>
							The {changes(held)} drawn since then {held === 1 ? "is" : "are"} on this canvas and in
							nothing else, and {held === 1 ? "it stays" : "they stay"} there until you choose.
						</>
					) : (
						<>Nothing has been drawn on it since.</>
					)}
				</p>
			)}
			<p className="hint">
				<code>{conflict.file}</code>
				<br />
				{conflict.reason === "changed" && <>archboard read it at {clock(conflict.lastReadAt)}; </>}
				last modified {clock(conflict.fileModifiedAt)}.
			</p>
			<p>Excalidraw scenes do not merge, so one copy has to lose. Which?</p>

			{/* Ordered by what each one costs, cheapest first: the only outcome that
          loses nothing is the one nearest to hand. */}
			<div className="choices">
				<button className="btn btn-quiet btn-big" onClick={onSaveAs} disabled={busy}>
					Save as…
				</button>
				<span className="choice-why">
					{hold
						? "Keep both. This canvas goes to a note of its own and the panes follow it; this board goes back to the version on disk."
						: "Keep both, under another name. Nothing is lost."}
				</span>

				<button className="btn btn-danger-quiet btn-big" onClick={onReload} disabled={busy}>
					Reload the note
				</button>
				<span className="choice-why">
					{held > 0
						? `Take what is on disk. The ${changes(held)} drawn since it stopped saving go with the canvas.`
						: "Take what is on disk. The canvas as it stands now is lost."}
				</span>

				<button className="btn btn-danger btn-big" onClick={onOverwrite} disabled={busy}>
					Overwrite the note
				</button>
				<span className="choice-why">
					{held > 0
						? `Keep the canvas, held ${changes(held)} and all. Whatever that note holds is lost.`
						: "Keep the canvas. Whatever that note holds is lost."}
				</span>
			</div>
			<p className="hint">
				Nothing here can merge the two. Keep a board open in one editor at a time.
			</p>
		</Modal>
	);
}
