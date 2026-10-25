// Pane news: where the user's reading of a pane stands after they changed it by hand, as the one
// sentence the voice model is given (TASK-293).
//
// A sentence of state, never of action: "the user is now looking at …", not "the user clicked …".
// How they got there does not matter to somebody answering "what is this?"; where they are does.
// Names only. An identifier, a pane letter or a line of JSON in a speech model's context is
// something it will say out loud. Only the parts the pane marked as the user's own are said
// (ADR 0034), and the board always is, because two panes can be open.
//
// What an agent outside this session does is news too (TASK-293.06): a board it wrote, or a pane
// it pointed somewhere with `browser show`. Neither model asked for it, so the sentence says what
// changed under them and that an agent did it, never crediting the user.

import type {
	PaneFocusEvent,
	PaneSelectionEvent,
	SemanticSubject,
	SemanticUserChange,
	SettledSemanticChangeEvent,
} from "#runtime/schemas/semantic-context-types.ts";
import type { CoordinatorPaneNews } from "#runtime/protocol/coordinator-callbacks/contract.ts";

type PaneNewsSource = SettledSemanticChangeEvent | PaneFocusEvent | PaneSelectionEvent;

/** How many selected subjects are named before the rest are counted. */
const NAMED_SUBJECTS = 3;

/**
 * What a subject is called out loud: its name, or what kind of thing it is when it has none.
 * @param subject - The subject.
 * @returns The words for it.
 */
function spoken(subject: SemanticSubject): string {
	return subject.name === null ? `an unnamed ${subject.kind}` : `"${subject.name}"`;
}

/**
 * The words for what is selected.
 * @param event - The pane event.
 * @returns The clause, beginning with its own comma.
 */
function selectionClause(event: PaneNewsSource): string {
	const { count, subjects } = event.architecture.selection;
	if (count === 0) {
		return ", with nothing selected";
	}
	const named = subjects.slice(0, NAMED_SUBJECTS).map(spoken);
	const rest = count - named.length;
	const list = rest > 0 ? [...named, `${rest} more`] : named;
	const last = list.at(-1) ?? "";
	const words = list.length === 1 ? last : `${list.slice(0, -1).join(", ")} and ${last}`;
	return `, with ${words} selected`;
}

/**
 * The words for the view the board is read through.
 * @param event - The pane event.
 * @returns The clause, beginning with its own comma.
 */
function viewClause(event: PaneNewsSource): string {
	const view = event.architecture.view;
	return view === null
		? ", read whole rather than through a view"
		: `, through view "${view.name}"`;
}

/**
 * The words for the variant on screen, said when the user chose it, or when they arrived on a
 * board at a state of it that is not the current one.
 * @param event - The pane event.
 * @param changed - What the user changed.
 * @returns The clause, or nothing.
 */
function variantClause(event: PaneNewsSource, changed: readonly SemanticUserChange[]): string {
	const variant = event.architecture.variant;
	if (variant === null) {
		return "";
	}
	const chosen = changed.includes("variant") && !changed.includes("board");
	const arrivedElsewhere = changed.includes("board") && variant.lifecycle !== "current";
	return chosen || arrivedElsewhere ? `, variant "${variant.name}"` : "";
}

/**
 * What a focus event says: which pane the user is in now.
 * @param event - The focus event.
 * @returns The sentence.
 */
function focusNews(event: PaneFocusEvent): string {
	return event.focus.focused
		? `The user is now in the pane showing board "${event.board.name}" (data).`
		: `The user is now in another pane, not the one showing board "${event.board.name}" (data).`;
}

/**
 * What a reading report says: the board, and whichever parts the user changed.
 * @param event - The selection event.
 * @param changed - What the user changed.
 * @returns The sentence.
 */
function readingNews(event: PaneSelectionEvent, changed: readonly SemanticUserChange[]): string {
	const clauses = [
		variantClause(event, changed),
		changed.includes("view") ? viewClause(event) : "",
		changed.includes("selection") ? selectionClause(event) : "",
	];
	return `The user is now looking at board "${event.board.name}"${clauses.join("")} (data).`;
}

/**
 * Whether a reading the user changed is a reason to stop a narration (TASK-293.05): they picked
 * something out, or chose a view or a variant, on the board they were on. Clicking empty canvas
 * should not stop a talk, and a board of their choosing ends the walkthrough, which is told as
 * leaving it.
 * @param event - The selection event.
 * @param changed - What the user changed.
 * @returns True when it stops a narration.
 */
function stopsNarration(
	event: PaneSelectionEvent,
	changed: readonly SemanticUserChange[],
): boolean {
	if (changed.includes("board")) {
		return false;
	}
	const picked = changed.includes("selection") && event.architecture.selection.count > 0;
	return picked || changed.includes("view") || changed.includes("variant");
}

/**
 * What an agent outside this session writing a board is (TASK-293.06): the board, and what the
 * writer said it was doing, in its own words. Said by name and never as the user's doing: neither
 * model asked for it, and what they hold about that board is no longer true.
 * @param event - The settled change.
 * @returns The news.
 */
function outsideWriteNews(event: SettledSemanticChangeEvent): CoordinatorPaneNews {
	const doing = event.doing === null ? "" : `, which says: ${JSON.stringify(event.doing)}`;
	return {
		sentence: `Board "${event.board.name}" was just changed by another agent${doing} (data).`,
		stops: true,
		by: "agent",
		board: event.change.board,
	};
}

/**
 * What an agent pointing a pane at another board is: where the pane was and where it is now,
 * worded so it never credits the user.
 * @param event - The focus event the show published.
 * @param from - The board the pane showed before, by name, or null when it showed none.
 * @returns The news.
 */
function agentSwitchNews(event: PaneFocusEvent, from: string | null): CoordinatorPaneNews {
	const now = `board "${event.board.name}"`;
	let sentence = `A pane now shows ${now}; an agent put it there (data).`;
	if (from === event.board.name) {
		sentence = `The pane showing ${now} now shows another variant of it; an agent put it there (data).`;
	} else if (from !== null) {
		sentence = `The pane that showed board "${from}" now shows ${now}; an agent put it there (data).`;
	}
	return { sentence, stops: true, by: "agent", board: null };
}

/**
 * The pane news a report is of what the user changed by hand, or null when they changed nothing
 * of it.
 * @param event - The focus or selection event.
 * @returns The news, or null.
 */
function userNews(event: PaneFocusEvent | PaneSelectionEvent): CoordinatorPaneNews | null {
	const changed = event.userChanged;
	if (event.kind === "pane_focus") {
		return changed.includes("focus")
			? { sentence: focusNews(event), stops: false, by: "user", board: null }
			: null;
	}
	if (changed.length === 0) {
		return null;
	}
	const sentence = readingNews(event, changed);
	return { sentence, stops: stopsNarration(event, changed), by: "user", board: null };
}

/**
 * The pane news one event is, or null when nobody is to be told: nothing of it was the user's
 * own doing and no agent outside this session did it. Whose own a write or a show is was asked
 * before this, where the session's threads are known (callbacks.ts).
 * @param event - The semantic event.
 * @returns The news, or null.
 */
function paneNews(event: PaneNewsSource): CoordinatorPaneNews | null {
	if (event.kind === "settled_change") {
		return outsideWriteNews(event);
	}
	if (event.kind === "pane_focus" && event.agentSwitch !== null) {
		return agentSwitchNews(event, event.agentSwitch.from);
	}
	return userNews(event);
}

export { paneNews };
