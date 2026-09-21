// Pane news: where the user's reading of a pane stands after they changed it by hand, as the one
// sentence the voice model is given (TASK-293).
//
// A sentence of state, never of action: "the user is now looking at …", not "the user clicked …".
// How they got there does not matter to somebody answering "what is this?"; where they are does.
// Names only. An identifier, a pane letter or a line of JSON in a speech model's context is
// something it will say out loud. Only the parts the pane marked as the user's own are said
// (ADR 0034), and the board always is, because two panes can be open.

import type {
	PaneFocusEvent,
	PaneSelectionEvent,
	SemanticSubject,
	SemanticUserChange,
	SettledSemanticChangeEvent,
} from "@/runtime/codex-semantic-context";

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
 * The pane news one event is, or null when nothing of it was the user's own doing.
 * @param event - The semantic event.
 * @returns The sentence for the voice model, or null when nobody is to be told.
 */
function paneNews(event: PaneNewsSource): string | null {
	if (event.kind === "settled_change" || event.userChanged.length === 0) {
		return null;
	}
	const changed = event.userChanged;
	if (event.kind === "pane_selection") {
		return readingNews(event, changed);
	}
	return changed.includes("focus") ? focusNews(event) : null;
}

export { paneNews };
