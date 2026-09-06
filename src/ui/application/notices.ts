// The persistent notices the application raises, each with a stable id so a
// repeat replaces its predecessor rather than stacking. Pure.

import type { CodeTargetNotice } from "@/shared/code-target";
import type { PaneList } from "@/ui/application/pane-list";
import { recordFor, type PaneRecords } from "@/ui/application/pane-records";
import type { ShellNotice } from "@/ui/shell";

/** The ids of the notices that carry a shell action, reported back by id. */
const NOTICE_ACTIONS = Object.freeze({
	settings: "settings",
	reloadFrontend: "reload-frontend",
	resolveHold: "resolve-hold",
	resolveElsewhere: "resolve-elsewhere",
	dismissPresentation: "dismiss-presentation",
});

/**
 * A board note could not be rendered in one pane.
 * @param paneId The pane.
 * @param error The server's refusal.
 * @returns The notice.
 */
function boardErrorNotice(paneId: string, error: string): ShellNotice {
	return {
		id: `board-error:${paneId}`,
		title: `Pane ${paneId} could not render its board`,
		description: error,
		tone: "destructive",
		actions: [],
	};
}

/**
 * This tab runs a bundle the canvas no longer serves (TASK-056).
 * @param message What the server said.
 * @returns The notice, offering a reload.
 */
function staleFrontendNotice(message: string): ShellNotice {
	return {
		id: "stale-frontend",
		title: "This tab is running an old build",
		description: message,
		tone: "default",
		actions: [{ kind: "select", id: NOTICE_ACTIONS.reloadFrontend, label: "Reload" }],
	};
}

/**
 * A code target could not be opened, or an opener setting failed.
 * @param notice The typed failure with its actions.
 * @returns The notice.
 */
function codeTargetShellNotice(notice: CodeTargetNotice): ShellNotice {
	return {
		id: "code-target",
		title: "Code target",
		description: notice.message,
		tone: "destructive",
		actions: notice.actions,
	};
}

/**
 * Something succeeded that the person asked for, said once.
 * @param id The notice id.
 * @param title The title.
 * @param description The words.
 * @returns The notice.
 */
function infoNotice(id: string, title: string, description: string): ShellNotice {
	return { id, title, description, tone: "default", actions: [] };
}

/**
 * Something the person asked for failed.
 * @param id The notice id.
 * @param title The title.
 * @param description The words.
 * @returns The notice.
 */
function failureNotice(id: string, title: string, description: string): ShellNotice {
	return { id, title, description, tone: "destructive", actions: [] };
}

/**
 * A board has stopped saving (ADR 0006); the dialog can be reopened from here.
 * @param paneId The pane holding it.
 * @param board The board key.
 * @param writes How many changes are held.
 * @returns The notice.
 */
function holdNotice(paneId: string, board: string, writes: number): ShellNotice {
	return {
		id: `hold:${paneId}`,
		title: `${board} has stopped saving`,
		description: `${writes} change(s) exist only on pane ${paneId}'s canvas until you choose: reload the note, overwrite it, or save elsewhere.`,
		tone: "destructive",
		actions: [{ kind: "select", id: NOTICE_ACTIONS.resolveHold, label: "Choose" }],
	};
}

/**
 * A note was written elsewhere (TASK-062); the dialog can be reopened from here.
 * @param paneId The pane holding it.
 * @param board The board key.
 * @returns The notice.
 */
function elsewhereNotice(paneId: string, board: string): ShellNotice {
	return {
		id: `elsewhere:${paneId}`,
		title: `${board} was written elsewhere`,
		description: `The note behind pane ${paneId} changed outside archboard. Reload it, keep editing, or save elsewhere.`,
		tone: "default",
		actions: [{ kind: "select", id: NOTICE_ACTIONS.resolveElsewhere, label: "Choose" }],
	};
}

/**
 * The note notices every pane's state asks for right now: a hold and a write
 * elsewhere each stay visible while they last (ADR 0006, TASK-062). Derived
 * from the records on every render rather than kept as state of their own.
 * @param list The panes, in order.
 * @param records What each pane reported.
 * @returns The notices in pane order, a pane's hold before its write elsewhere.
 */
function noteNotices(list: PaneList, records: PaneRecords): readonly ShellNotice[] {
	return list.panes.flatMap((entry) => {
		const { hold, writtenElsewhere, boardKey } = recordFor(records, entry.paneId).status;
		const notices: ShellNotice[] = [];
		if (hold !== null) {
			notices.push(holdNotice(entry.paneId, boardKey ?? hold.board, hold.writes));
		}
		if (writtenElsewhere !== null) {
			notices.push(elsewhereNotice(entry.paneId, boardKey ?? writtenElsewhere.board));
		}
		return notices;
	});
}

/**
 * The browser refused or lost a fullscreen presentation.
 * @param error The presentation's plain words.
 * @returns The notice.
 */
function presentationNotice(error: string): ShellNotice {
	return {
		id: "presentation",
		title: "Presentation",
		description: error,
		tone: "default",
		actions: [],
	};
}

/**
 * The notices with one added or replaced by id.
 * @param notices The notices.
 * @param notice The notice to add.
 * @returns The notices, with the notice last when it is new.
 */
function withNotice(notices: readonly ShellNotice[], notice: ShellNotice): readonly ShellNotice[] {
	const existing = notices.find((candidate) => candidate.id === notice.id);
	if (existing === undefined) {
		return [...notices, notice];
	}
	// Notices are plain data; a re-raise of the same words is not a change.
	// Returning the same array keeps React state stable, so an effect that
	// keeps a notice current cannot re-render the application forever.
	if (JSON.stringify(existing) === JSON.stringify(notice)) {
		return notices;
	}
	return notices.map((candidate) => (candidate.id === notice.id ? notice : candidate));
}

/**
 * The notices without one id.
 * @param notices The notices.
 * @param id The id to drop.
 * @returns The notices without it.
 */
function withoutNotice(notices: readonly ShellNotice[], id: string): readonly ShellNotice[] {
	// Same reference when there was nothing to drop, for the reason above.
	return notices.some((candidate) => candidate.id === id)
		? notices.filter((candidate) => candidate.id !== id)
		: notices;
}

export {
	NOTICE_ACTIONS,
	boardErrorNotice,
	codeTargetShellNotice,
	elsewhereNotice,
	failureNotice,
	holdNotice,
	infoNotice,
	noteNotices,
	presentationNotice,
	staleFrontendNotice,
	withNotice,
	withoutNotice,
};
