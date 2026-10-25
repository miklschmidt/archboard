// Which panes are linked (TASK-538.02), as the shell hands it to the panes: the
// same object until the link changes, so pane news that moves no link draws no
// pane again.

import { useState } from "react";

import { recordFor, type PaneRecords } from "#ui/rules/application/pane-records.ts";
import type { PaneList } from "#ui/rules/application/pane-list.ts";
import { paneLinks, sameLinks, type PaneLinks } from "#ui/rules/application/pane-link.ts";

/**
 * Which panes are linked now.
 * @param records What each pane last said about itself.
 * @param list The panes, in reading order.
 * @returns Each linked pane's partner, or no links.
 */
function usePaneLinks(records: PaneRecords, list: PaneList): PaneLinks {
	const found = paneLinks(list.panes.map((entry) => recordFor(records, entry.paneId).status));
	const [held, hold] = useState(found);
	if (sameLinks(held, found)) {
		return held;
	}
	hold(found);
	return found;
}

export { usePaneLinks };
