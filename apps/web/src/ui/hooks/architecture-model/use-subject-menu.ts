// The menu a right click opens at the cursor, on a part of the picture.
//
// It is about what stands under the cursor. A part outside the selection becomes
// the selection, and a part inside it keeps the rest. Anywhere else the browser
// keeps its own menu, so text can still be copied from the panels.

import { useCallback, useState, type MouseEvent } from "react";

import { pickedTarget } from "#ui/clients/canvas/picture/picture-pick.ts";
import type { SemanticAtlas } from "#ui/clients/canvas/reads/drawings.ts";
import { subjectAt } from "#ui/clients/canvas/subjects/subjects.ts";
import type { Reader } from "#ui/hooks/architecture-model/use-reader.ts";

/** Where the menu stands and whether it is open. It keeps its place while it closes. */
interface SubjectMenu {
	readonly open: boolean;
	readonly x: number;
	readonly y: number;
}

/** The menu before any right click. */
const CLOSED: SubjectMenu = { open: false, x: 0, y: 0 };

/**
 * The part of the picture under a right click.
 * @param event The right click.
 * @param atlas Where every subject of the picture ended up, or nothing while there is no picture.
 * @returns The part, or null anywhere else.
 */
function subjectUnder(
	event: MouseEvent<HTMLElement>,
	atlas: SemanticAtlas | undefined,
): string | null {
	const { target, clientX, clientY } = event;
	const picture = target instanceof Element ? target.closest("[data-slot='model-diagram']") : null;
	if (picture === null || atlas === undefined) return null;
	return subjectAt(pickedTarget({ target, currentTarget: picture, clientX, clientY }), atlas);
}

/**
 * The menu of the part under the cursor.
 * @param reader The reader, whose selection the menu acts on.
 * @returns The menu, what opens it, and what closes it.
 */
function useSubjectMenu(reader: Pick<Reader, "accepted" | "selection">) {
	const [menu, setMenu] = useState(CLOSED);
	const { ids, select } = reader.selection;
	const atlas = reader.accepted.scene?.picture.atlas;
	const onContextMenu = useCallback(
		(event: MouseEvent<HTMLElement>): void => {
			const subject = subjectUnder(event, atlas);
			if (subject === null) return;
			event.preventDefault();
			if (!ids.has(subject)) select(subject);
			setMenu({ open: true, x: event.clientX, y: event.clientY });
		},
		[atlas, ids, select],
	);
	const onOpenChange = useCallback((open: boolean): void => {
		setMenu((shown) => ({ ...shown, open }));
	}, []);
	return { menu, onContextMenu, onOpenChange };
}

export { useSubjectMenu, type SubjectMenu };
