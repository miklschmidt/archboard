// Which folders and boards a person has opened in the navigator, remembered in
// this browser across reloads. It is a reading preference, never board
// content: it lives in local storage, and a browser without storage still
// opens and closes rows for the session.

import { useCallback, useMemo, useState } from "react";

const STORAGE_KEY = "archboard.navigator.open";

/** Open or closed, by row id, where the person chose; the default elsewhere. */
type Choices = Readonly<Record<string, boolean>>;

/**
 * The choices this browser remembers.
 * @returns The choices, or none.
 */
function storedChoices(): Choices {
	try {
		const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}");
		if (typeof parsed !== "object" || parsed === null) return {};
		return Object.fromEntries(
			Object.entries(parsed).filter(
				(entry): entry is [string, boolean] => typeof entry[1] === "boolean",
			),
		);
	} catch {
		return {};
	}
}

/**
 * Remember the choices, when the browser lets us.
 * @param choices The choices.
 */
function storeChoices(choices: Choices): void {
	try {
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(choices));
	} catch {
		// Rows still open and close for this session.
	}
}

/** The navigator's open rows and the moves that change them. */
interface OutlineExpansion {
	/**
	 * Whether a row is open.
	 * @param id The row.
	 * @returns True when open.
	 */
	readonly expanded: (id: string) => boolean;
	/**
	 * Open or close one row.
	 * @param id The row.
	 * @param open Whether it opens.
	 */
	readonly setExpanded: (id: string, open: boolean) => void;
}

/**
 * The navigator's open rows. A row nobody chose for is open when the default says so.
 * @param openByDefault Whether a row nobody chose for starts open.
 * @returns The expansion.
 */
function useOutlineExpansion(openByDefault: (id: string) => boolean): OutlineExpansion {
	const [choices, setChoices] = useState<Choices>(storedChoices);
	const expanded = useCallback(
		(id: string): boolean => choices[id] ?? openByDefault(id),
		[choices, openByDefault],
	);
	const setExpanded = useCallback((id: string, open: boolean): void => {
		setChoices((current) => {
			const next = { ...current, [id]: open };
			storeChoices(next);
			return next;
		});
	}, []);
	return useMemo(() => ({ expanded, setExpanded }), [expanded, setExpanded]);
}

export { useOutlineExpansion, type OutlineExpansion };
