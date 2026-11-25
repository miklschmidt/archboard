// The persistent notices the application raises, each with a stable id so a
// repeat replaces its predecessor rather than stacking. Pure.

import type { CodeTargetNotice } from "@archboard/code-opener/opening";
import type { ShellNotice } from "#ui/shell/rules/contracts.ts";
import type { ReadingTrouble } from "#ui/architecture-drawing/model-reader/reading/rules/reading-freshness.ts";

/** The ids of the notices that carry a shell action, reported back by id. */
const NOTICE_ACTIONS = Object.freeze({
	settings: "settings",
	reloadFrontend: "reload-frontend",
	retryReading: "retry-reading",
	retryListing: "retry-listing",
	dismissPresentation: "dismiss-presentation",
});

/**
 * A model could not be shown in one pane.
 * @param paneId The pane.
 * @param error The server's refusal.
 * @returns The notice.
 */
function modelErrorNotice(paneId: string, error: string): ShellNotice {
	return {
		id: `pane-error:${paneId}`,
		title: `Pane ${paneId} could not show its model`,
		description: error,
		tone: "destructive",
		actions: [],
	};
}

/**
 * The id of the toast that says what is wrong with a pane's reading, one for each pane.
 * @param paneId The pane.
 * @returns The id.
 */
function readingNoticeId(paneId: string): string {
	return `reading:${paneId}`;
}

/**
 * What is wrong with a pane's reading. Its Retry reads the models again.
 * @param paneId The pane.
 * @param trouble What is wrong, in the toast's words.
 * @returns The notice.
 */
function readingNotice(paneId: string, trouble: ReadingTrouble): ShellNotice {
	return {
		id: readingNoticeId(paneId),
		code: trouble.code ?? undefined,
		title: trouble.title,
		description: trouble.description,
		tone: trouble.tone,
		actions: trouble.retry
			? [{ kind: "select", id: NOTICE_ACTIONS.retryReading, label: "Retry" }]
			: [],
	};
}

/** The id of the toast that says the navigator cannot list what it should. */
const LISTING_NOTICE_ID = "listing";

/**
 * The navigator could not list the repositories. Its Retry reads the listing again.
 * @param failure What failed, in words.
 * @returns The notice.
 */
function listingNotice(failure: string): ShellNotice {
	return {
		id: LISTING_NOTICE_ID,
		title: "The navigator cannot list everything",
		description: failure,
		tone: "destructive",
		actions: [{ kind: "select", id: NOTICE_ACTIONS.retryListing, label: "Retry" }],
	};
}

/**
 * This tab runs a bundle the server no longer serves (TASK-056).
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
 * What happened when a code target was opened, or an opener setting failed.
 * @param notice The typed notice with its actions.
 * @returns The notice.
 */
function codeTargetShellNotice(notice: CodeTargetNotice): ShellNotice {
	return {
		id: "code-target",
		title: "Code target",
		description: notice.message,
		tone: notice.kind === "error" ? "destructive" : "default",
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
 * Fix with Codex could not reach the conversation of the checkout that misses a language server.
 * @param repo The checkout's repository.
 * @returns The notice.
 */
function unreachableCheckoutNotice(repo: string): ShellNotice {
	return failureNotice(
		"language-server-fix",
		"Fix with Codex",
		`This tab has no conversation in the checkout of ${repo}. Open one of its models, then press Fix with Codex again.`,
	);
}

/**
 * The address named models that could not be opened (TASK-166). What is on
 * screen is what the panes could reach, and the address bar now says so.
 * @param paneKeys The models that could not be opened.
 * @returns The notice.
 */
function unreachableModelsNotice(paneKeys: readonly string[]): ShellNotice {
	const named = paneKeys.join(", ");
	return {
		id: "unreachable-models",
		title:
			paneKeys.length === 1 ? `${named} could not be opened` : "Some models could not be opened",
		description: `The address asked for ${named}. Check the key in Model navigation; the panes are showing what they could reach, and the address now says so.`,
		tone: "destructive",
		actions: [],
	};
}

/**
 * The address named a repository this page cannot read models of: it lists
 * no such repository, or the repository's chosen checkout has no vault.
 * @param repository The repository's name.
 * @returns The notice.
 */
function unreachableRepositoryNotice(repository: string): ShellNotice {
	return {
		id: `unreachable-repository:${repository}`,
		title: `${repository} cannot be read`,
		description: `The address asked for models of ${repository}, and this machine has no checkout of it with a vault. If it is in Model navigation, choose a checkout with a vault in its menu. If it is not, add a checkout with archboard repo add <directory>.`,
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
 * The notices without the one its owner cleared or the person dismissed.
 * @param notices The notices.
 * @param target The id to clear or the exact notice shown by the toast.
 * @returns The notices without it.
 */
function withoutNotice(
	notices: readonly ShellNotice[],
	target: string | ShellNotice,
): readonly ShellNotice[] {
	const current = notices.find((candidate) =>
		typeof target === "string" ? candidate.id === target : candidate === target,
	);
	if (current === undefined) return notices;
	return notices.filter((candidate) => candidate !== current);
}

export {
	NOTICE_ACTIONS,
	modelErrorNotice,
	codeTargetShellNotice,
	failureNotice,
	infoNotice,
	presentationNotice,
	staleFrontendNotice,
	unreachableCheckoutNotice,
	LISTING_NOTICE_ID,
	listingNotice,
	readingNotice,
	readingNoticeId,
	unreachableModelsNotice,
	unreachableRepositoryNotice,
	withNotice,
	withoutNotice,
};
