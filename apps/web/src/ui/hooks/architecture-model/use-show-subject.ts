import { useCallback } from "react";
import type { Reader } from "#ui/hooks/architecture-model/use-reader.ts";

/**
 * Show a subject that a finding names. A module inside a part opens that part, because the picture
 * on screen does not draw it.
 * @param reader The reader.
 * @returns Show a subject, or let go of the selection for a finding on the whole model.
 */
function useShowSubject(reader: Reader): (id: string | null) => void {
	const { accepted, selection, choices, onPage } = reader;
	const { model, projection } = accepted.shown;
	const { select } = selection;
	const { findModule } = choices;
	const { nodes } = projection.content;
	return useCallback(
		(id: string | null): void => {
			const held = model.modules.some((one) => one.id === id);
			if (id !== null && held && !nodes.some((one) => one.id === id)) {
				findModule(id, false);
				return;
			}
			select(id);
			if (id !== null) onPage("diagram");
		},
		[select, onPage, findModule, model.modules, nodes],
	);
}

export { useShowSubject };
