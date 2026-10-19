import type { PaneRegistration } from "@archboard/server-lifecycle/panes";

/** What choosing a presenting pane needs to know about a pane on screen. */
export type PresentablePane = Readonly<Pick<PaneRegistration, "paneId" | "focused" | "recording">>;

/**
 * The pane that work nobody's command started presents through: the semantic
 * brief a voice session opens with, the context a delegated turn or an outcome
 * report runs under.
 *
 * The conversation belongs to its browser tab, not to the pane that created it
 * (TASK-302.06, TASK-373), so closing that pane must not strand the work. The
 * preferred pane when it is still open, else the pane the person is in, else
 * the first pane in reading order, among the tab's own panes. A browser command
 * never comes here: it runs against the exact pane that sent it.
 *
 * A recording page's pane (TASK-304) presents the same id as somebody's and
 * is nobody's to read, so it is chosen only when it is all that is open: a
 * recording on a server with no browser still opens its session through it.
 * @param preferredPaneId The pane the work names, or null when it names none.
 * @param panesInReadingOrder Every pane on screen, in reading order.
 * @returns The pane.
 * @throws {Error} When no pane is open, which leaves nothing to present through.
 */
export function presentingPane<Pane extends PresentablePane>(
	preferredPaneId: string | null,
	panesInReadingOrder: readonly Pane[],
): Pane {
	const readable = panesInReadingOrder.filter((candidate) => candidate.recording !== true);
	const pane =
		readable.find((candidate) => candidate.paneId === preferredPaneId) ??
		readable.find((candidate) => candidate.focused) ??
		readable[0] ??
		panesInReadingOrder[0];
	if (pane === undefined) {
		throw new Error("No canvas pane is open to present the Codex conversation through.");
	}
	return pane;
}
