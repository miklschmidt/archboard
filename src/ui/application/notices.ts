// The persistent notices the application raises, each with a stable id so a
// repeat replaces its predecessor rather than stacking. Pure.

import type { CodeTargetNotice } from "@/shared/code-target";
import type { ShellNotice } from "@/ui/shell";

/** The ids of the notices that carry a shell action, reported back by id. */
const NOTICE_ACTIONS = Object.freeze({
	settings: "settings",
	reloadFrontend: "reload-frontend",
	dismissPresentation: "dismiss-presentation",
});

/**
 * A board could not be shown in one pane.
 * @param paneId The pane.
 * @param error The server's refusal.
 * @returns The notice.
 */
function boardErrorNotice(paneId: string, error: string): ShellNotice {
	return {
		id: `board-error:${paneId}`,
		title: `Pane ${paneId} could not show its board`,
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
 * The address named boards that could not be opened (TASK-166). What is on
 * screen is what the panes could reach, and the address bar now says so.
 * @param boardKeys The boards that could not be opened.
 * @returns The notice.
 */
function unreachableBoardsNotice(boardKeys: readonly string[]): ShellNotice {
	const named = boardKeys.join(", ");
	return {
		id: "unreachable-boards",
		title:
			boardKeys.length === 1 ? `${named} could not be opened` : "Some boards could not be opened",
		description: `The address asked for ${named}. Check the key in Board navigation; the panes are showing what they could reach, and the address now says so.`,
		tone: "destructive",
		actions: [],
	};
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
	failureNotice,
	infoNotice,
	presentationNotice,
	staleFrontendNotice,
	unreachableBoardsNotice,
	withNotice,
	withoutNotice,
};
