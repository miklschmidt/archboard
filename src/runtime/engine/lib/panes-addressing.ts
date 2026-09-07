// Which pane a caller means.

import {
	type PaneRegistration,
	type PlacedPane,
	panesInOrder,
} from "@/runtime/engine/lib/panes-layout";

/** Everything `--pane` accepts, for the message that lists them. */
// Every spelling here has to be taught, and a spelling that is never needed is
// a spelling that can only drift. `only` used to be accepted and named nowhere:
// it matched just when one pane was open, and that is exactly when --pane can be
// left off, because `soloPane` resolves it. Closing the last pane is refused, so
// it had no use there either (TASK-050).
const PANE_SPECS =
	"a place (left, right, top, bottom), a position (1, 2), `focused`, `primary`, or a pane id";

/**
 * How many panes the shell will lay out.
 *
 * A product fact, not a limit of this module: the shell's grid has a column
 * rule for two panes and its own button stops offering another past that
 * (src/ui/shell, the pane bar and its add-pane control). It lives here because the
 * server has to refuse a third pane before it asks the browser for one, and
 * because the message that says "no such pane" has to know whether making one
 * is still possible.
 */
const MAX_PANES = 2;

/**
 * A pane's place, in a sentence.
 *
 * `place` is a phrase, not a word — "left", but also "the only pane" — so
 * dropping it into "in the ... pane" produced "in the the only pane pane".
 * @param place The pane's place.
 * @returns The phrase, as it reads in a sentence.
 */
function paneWords(place: string): string {
	return place.startsWith("the ") ? place : `the ${place} pane`;
}

/** The command that makes a pane, said the same way everywhere it is offered. */
const HOW_TO_OPEN_A_PANE =
	"Open one with `archboard browser open`, which splits the live canvas and answers with the pane it made.";

/**
 * Which pane a caller means by `left`, `2`, `focused`, `pane-1`…
 *
 * Deliberately refuses rather than picks when a spec matches nothing or more
 * than one thing — putting a board on the wrong half of the screen is cheap to
 * notice, but so is saying which half, and a canvas that quietly ignores the
 * half you asked for teaches you to stop trusting the flag.
 * @param registrations The panes on screen.
 * @param spec What the caller typed.
 * @returns The pane it names.
 * @throws {Error} When it names none, or more than one.
 */
function resolvePaneSpec(registrations: PaneRegistration[], spec: string): PaneRegistration {
	const ordered = panesInOrder(registrations);
	if (ordered.length === 0) {
		throw new Error(
			`No pane is open, so there is nowhere to put a board — "${spec}" names nothing. ` +
				"Open the canvas in a browser first, then retry the browser command.",
		);
	}
	const wanted = spec.trim().toLowerCase();
	/**
	 * The panes on screen, as the refusal lists them.
	 * @returns One numbered entry per pane.
	 */
	const list = (): string =>
		ordered.map((entry) => `${entry.position}. ${entry.place} (${entry.pane.board})`).join(", ");

	const matches = ordered.filter((entry) => matchesSpec(entry, wanted, spec.trim()));

	if (matches.length === 1) {
		return matches[0]!.pane;
	}
	if (matches.length > 1) {
		throw new Error(
			`"${spec}" matches ${matches.length} panes (${matches.map((m) => m.place).join(", ")}), ` +
				`so which one is not decided. Panes on screen: ${list()}.`,
		);
	}
	// Nothing here can point a board at a pane that does not exist, and until
	// TASK-033 nothing could make one either — the human had to click Split,
	// which is not available to a voice thread. So the refusal carries the
	// command that makes one, while there is still room in the browser layout.
	const makeOne = ordered.length < MAX_PANES ? ` ${HOW_TO_OPEN_A_PANE}` : "";
	throw new Error(
		`No pane called "${spec}". Panes on screen: ${list()}. ` +
			`--pane takes ${PANE_SPECS}.${makeOne}`,
	);
}

/**
/**
 * Whether one pane answers to a spec: its place, its id, its client, its
 * position, or one of the two roles a pane can have.
 * @param entry The pane and where it sits.
 * @param wanted The spec, lowercased.
 * @param exact The spec as the caller typed it, for the client id.
 * @returns True when the pane answers to it.
 */
function matchesSpec(entry: PlacedPane, wanted: string, exact: string): boolean {
	const named =
		entry.place.toLowerCase() === wanted ||
		entry.pane.paneId.toLowerCase() === wanted ||
		entry.pane.clientId === exact ||
		String(entry.position) === wanted;
	return named || matchesRole(entry.pane, wanted);
}

/**
 * Whether a pane holds the role a spec names.
 * @param pane The pane.
 * @param wanted The spec, lowercased.
 * @returns True when it is the focused or the primary pane, as asked.
 */
function matchesRole(pane: PaneRegistration, wanted: string): boolean {
	if (wanted === "focused") {
		return pane.focused;
	}
	return wanted === "primary" && pane.primary;
}

/**
 * The pane a caller who named none means — when there is only one, that one.
 *
 * With two panes on screen there is no such pane and this refuses, for the
 * same reason a board has to be named: the answers on offer are "wherever you
 * last clicked" and "whichever we listed first", and both put a board on a
 * half of the screen nobody chose. Which half is cheaper to get wrong than
 * which board, but it is still a guess, and refusing costs one flag.
 *
 * No pane at all is not a refusal: nothing is on screen, so a board can be
 * loaded without being shown.
 * @param registrations The panes on screen.
 * @returns The one pane, or null when nothing is on screen.
 * @throws {Error} When more than one pane is open.
 */
function soloPane(registrations: PaneRegistration[]): PaneRegistration | null {
	const ordered = panesInOrder(registrations);
	if (ordered.length === 0) {
		return null;
	}
	if (ordered.length === 1) {
		return ordered[0]!.pane;
	}
	throw new Error(
		`${ordered.length} panes are open, so this needs a pane as well as a board — ` +
			`--pane ${ordered.map((entry) => entry.place).join(" | ")}. ` +
			`They are showing ${ordered.map((entry) => `${entry.pane.board} (${entry.place})`).join(", ")}.`,
	);
}

export { HOW_TO_OPEN_A_PANE, MAX_PANES, paneWords, resolvePaneSpec, soloPane };
