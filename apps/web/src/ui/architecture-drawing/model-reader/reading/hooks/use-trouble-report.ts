// What is wrong with a pane's reading goes to the shell, which says it in a toast. It is said when
// it changes, never on every render, so a toast the person dismissed stays dismissed until the
// trouble changes. A pane that goes takes its trouble with it.

import { useEffect } from "react";

import type { ReadingTrouble } from "#ui/architecture-drawing/model-reader/reading/rules/reading-freshness.ts";

/** A trouble as plain values, so an effect runs only when one of them changes. */
type Fields = readonly [
	code: string | null,
	tone: ReadingTrouble["tone"] | null,
	title: string,
	description: string,
	retry: boolean,
];

/** No trouble. */
const NONE: Fields = [null, null, "", "", false];

/**
 * A trouble's plain values.
 * @param trouble The trouble, or null.
 * @returns Its values, or NONE.
 */
function fieldsOf(trouble: ReadingTrouble | null): Fields {
	if (trouble === null) return NONE;
	return [trouble.code, trouble.tone, trouble.title, trouble.description, trouble.retry];
}

/**
 * Tell the shell what is wrong with the reading, each time that changes.
 * @param trouble The trouble, or null while the reading is sound.
 * @param onTrouble Where the shell hears it, when it listens.
 */
function useTroubleReport(
	trouble: ReadingTrouble | null,
	onTrouble: ((trouble: ReadingTrouble | null) => void) | undefined,
): void {
	const [code, tone, title, description, retry] = fieldsOf(trouble);
	useEffect(() => {
		onTrouble?.(tone === null ? null : { code, tone, title, description, retry });
	}, [onTrouble, code, tone, title, description, retry]);
	useEffect(() => () => onTrouble?.(null), [onTrouble]);
}

export { useTroubleReport };
