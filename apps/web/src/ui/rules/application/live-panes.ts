// The panes as an action reads them when it runs, not as they were when it was made.
//
// The shell's actions read the pane records, the list and the active pane only
// when somebody acts. Made over the panes themselves, they were made again with
// every pane's news (a status, a claim, a socket coming up), and every control
// holding one was drawn again with them (TASK-385.04). Made over this view, they
// keep one identity for as long as the owners they act on do.

import type { Panes } from "#ui/hooks/application/use-panes.ts";
import type { LiveBinding } from "#ui/state/application/live-binding.ts";

/**
 * The panes, read through a binding each time a field is read.
 * @param binding Where the latest panes are bound, each render.
 * @returns The panes as they are when read.
 */
function livePanesOver(binding: LiveBinding<Panes>): Panes {
	return {
		/**
		 * The pane list now.
		 * @returns It.
		 */
		get list() {
			return binding.read().list;
		},
		/**
		 * The pane records now.
		 * @returns Them.
		 */
		get records() {
			return binding.read().records;
		},
		/**
		 * Which panes are linked now.
		 * @returns The links.
		 */
		get links() {
			return binding.read().links;
		},
		/**
		 * The active pane's record now.
		 * @returns It.
		 */
		get active() {
			return binding.read().active;
		},
		/**
		 * The pane handles.
		 * @returns Them.
		 */
		get handles() {
			return binding.read().handles;
		},
		/**
		 * The callbacks every session reports into.
		 * @returns Them.
		 */
		get callbacks() {
			return binding.read().callbacks;
		},
		/**
		 * Open the second pane.
		 * @returns False when there is no pane to open.
		 */
		add: () => binding.read().add(),
		/**
		 * Close a pane.
		 * @param paneId The pane.
		 * @returns False when the list refuses.
		 */
		close: (paneId) => binding.read().close(paneId),
		/**
		 * Focus a pane.
		 * @param paneId The pane.
		 * @returns False when it is already the focused one.
		 */
		select: (paneId) => binding.read().select(paneId),
		/**
		 * Patch a pane's record.
		 * @param paneId The pane.
		 * @param next What changes.
		 */
		patch: (paneId, next) => {
			binding.read().patch(paneId, next);
		},
		/**
		 * Bind the events the callbacks forward to.
		 * @param events The events.
		 */
		bindEvents: (events) => {
			binding.read().bindEvents(events);
		},
	};
}

export { livePanesOver };
