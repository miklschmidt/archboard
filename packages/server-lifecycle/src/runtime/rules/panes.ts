// What the user is currently looking at.
//
// This exists for one reason. The voice model cannot see the screen, so "move
// that box over there" is uninterpretable unless the thread can ask what is on
// screen and what the user has selected. That is spatial deixis, and it
// is the whole justification for this module.
//
// So this reports VIEW STATE, never model contents. It is meant to be called on
// every turn, which it can only be if it stays small: inlining the architecture
// "to save a round trip" would make it expensive, which would make it uncallable
// every turn, which defeats the point. `semantic show` reports contents; this
// reports where the panes are, which model and state each holds, how it
// is read, and what is picked in each — bounded no matter how big the
// model is.
//
// A pane is known to the server only while its socket is open (see server.ts):
// a closed tab or an unsplit takes its registration with it, so there are no
// ghosts. No pane at all is the normal state of a headless server, not an error.

import { paneAddressKey, parsePaneKey } from "@archboard/model/legacy-address";
import type { SemanticPaneContextSchema } from "@archboard/model/pane-context";
import type { z } from "zod";
import {
	type Arrangement,
	type PaneContext,
	type PaneReading,
	type PaneRegistration,
	type PaneReport,
	type PanesReport,
	MAX_IDS,
	arrangementOf,
	panesInOrder,
} from "#runtime/rules/panes-layout.ts";
import {
	HOW_TO_OPEN_A_PANE,
	MAX_PANES,
	addressablePanes,
	panesAddressableFirst,
	paneWords,
	resolvePaneSpec,
	soloPane,
} from "#runtime/rules/panes-addressing.ts";

type LegacyIdentity = ReturnType<typeof parsePaneKey>;
type PaneArchitecture = NonNullable<z.infer<typeof SemanticPaneContextSchema>["architecture"]>;

/**
 * What the read-out says beyond naming the panes: the things an agent needs
 * to know that are not visible in the list itself.
 * @param panes The panes on screen.
 * @param arrangement How they are laid out.
 * @returns The lines, in the order they are read.
 */
function advice(panes: readonly PaneReport[], arrangement: Arrangement): string[] {
	const lines: string[] = [];
	if (arrangement === "overlapping") {
		// Not a split: two browsers on the same server. Saying so stops a thread
		// offering "the left one" as a way to tell them apart.
		lines.push(
			"These are separate tabs or windows on the same Archboard server, not a split — nothing is to the left of anything.",
		);
	}
	if (panes.length === 1) {
		// One pane is one reading on screen, and a comparison needs two. Said here
		// because this is the report an agent reads every turn, and an agent that
		// does not know a second pane is obtainable reuses the first one — which
		// means overwriting whatever the human was looking at.
		lines.push(
			`Only one pane is on screen. To put another beside it, keeping this one: ${HOW_TO_OPEN_A_PANE}`,
		);
	}
	lines.push(...readingAdvice(panes));
	return lines;
}

/**
 * What the read-out says about how to change what the panes show.
 * @param panes The panes on screen.
 * @returns The lines.
 */
function readingAdvice(panes: readonly PaneReport[]): string[] {
	if (panes.some((pane) => pane.architecture != null)) {
		return ["Each pane reports its own reading. Use `browser show --pane <pane>` to change one."];
	}
	return [];
}

/**
 * The read-out when nothing is on screen.
 * @param arrangement How the panes are laid out, which is "none".
 * @param context Where to read the server URL from.
 * @returns The report.
 */
function emptyReport(arrangement: Arrangement, context: PaneContext): PanesReport {
	const where = context.serverUrl
		? ` Open ${context.serverUrl} to put it in front of somebody.`
		: "";
	const summary = `No pane is open, so nothing is on screen.${where}`;
	return {
		paneCount: 0,
		arrangement,
		focused: null,
		samePaneKey: true,
		panes: [],
		summary,
		text:
			summary +
			"\nThe architecture itself is unaffected — it lives on the server, not in the browser.",
	};
}

/**
 * One pane as the report holds it.
 * @param pane The pane.
 * @param index Where it sits in reading order.
 * @param place The phrase that names where it is.
 * @param context Where to read its model and selection from.
 * @returns The pane's entry.
 */
function paneReport(
	pane: PaneRegistration,
	index: number,
	place: string,
	context: PaneContext,
): PaneReport {
	const identity = identityOf(pane.paneKey, context);
	const { repository, checkout } = context.whereabouts(pane.vault);
	return {
		paneId: pane.paneId,
		clientId: pane.clientId,
		position: index + 1,
		place,
		focused: pane.focused,
		primary: pane.primary,
		paneKey: identity === null ? pane.paneKey : paneAddressKey(identity),
		identity,
		vault: pane.vault,
		repository,
		checkout,
		own: pane.vault === context.caller,
		rect: pane.rect,
		reading: readingOf(pane, context),
		architecture: context.architecture(pane.clientId),
		at: pane.at,
	};
}

/**
 * What legacy board a pane is on, when it is on one.
 * @param paneKey The legacy board key the pane reported, or null.
 * @param context Where legacy board keys are resolved.
 * @returns The legacy identity, or null for a canonical model or empty pane.
 */
function identityOf(paneKey: string | null, context: PaneContext): LegacyIdentity | null {
	if (paneKey === null || paneKey.startsWith("model:")) {
		return null;
	}
	return context.identity(paneKey) ?? parsePaneKey(paneKey);
}

const LAYOUT_PHRASE: Record<string, string> = {
	grid: "in a grid",
	overlapping: "in the same place",
	"side-by-side": "side by side",
	stacked: "stacked",
};

/**
 * How many panes there are and how they sit, in the words a report opens with.
 * @param arrangement How they are laid out.
 * @param count How many there are.
 * @returns The phrase.
 */
function layoutPhrase(arrangement: Arrangement, count: number): string {
	if (arrangement === "single") {
		return "1 pane on screen";
	}
	return `${count} panes, ${LAYOUT_PHRASE[arrangement] ?? arrangement}`;
}

/**
 * What the panes are showing.
 *
 * Named once only when they are reading it the same way. Two panes on one model
 * at two states are the comparison somebody set up, and a read-out that said
 * the model once would hide the thing they are looking at.
 * @param panes The panes.
 * @returns The phrase.
 */
function showingPhrase(panes: readonly PaneReport[]): string {
	const shown = panes.map((pane) => shownPhrase(pane));
	return new Set(shown).size === 1 ? `, showing ${shown[0]!}` : `, showing ${shown.join(" and ")}`;
}

/**
 * What one pane is reading, as the report holds it.
 *
 * A pane that has said nothing yet reads as nothing being shown, which is the
 * truth about a pane that has just mounted rather than a gap in the report.
 * @param pane The pane.
 * @param context Where to read what each pane reported.
 * @returns The reading, with the phrase a report reads out.
 */
function readingOf(pane: PaneRegistration, context: PaneContext): PaneReading {
	const read = context.reading(pane.clientId);
	if (read === null) {
		return {
			variant: null,
			view: null,
			selection: [],
			moreSelected: 0,
			summary: "nothing selected",
			version: null,
			at: null,
		};
	}
	const shown = read.selection.slice(0, MAX_IDS);
	return {
		...read,
		selection: shown,
		moreSelected: Math.max(0, read.selection.length - MAX_IDS),
		summary: describeSelection(read.selection),
	};
}

/**
 * What a selection is, in one phrase: how many things and what they are
 * called.
 * @param selection The subjects the person picked out.
 * @returns The sentence.
 */
function describeSelection(
	selection: readonly { id: string; kind?: string; name?: string }[],
): string {
	if (selection.length === 0) {
		return "nothing selected";
	}
	const kinds = new Set(selection.map((subject) => subject.kind ?? "subject"));
	const thing = kinds.size === 1 ? [...kinds][0]! : "subject";
	const named = selection
		.slice(0, MAX_IDS)
		.map((subject) => `"${subject.name ?? subject.id}"`)
		.join(", ");
	const more = selection.length > MAX_IDS ? `, and ${selection.length - MAX_IDS} more` : "";
	return `${selection.length} ${plural(thing, selection.length)} — ${named}${more}`;
}

/**
 * A word, pluralised by the number in front of it.
 * @param word The singular.
 * @param count How many.
 * @returns The word as it reads.
 */
function plural(word: string, count: number): string {
	return count === 1 ? word : `${word}s`;
}

/**
 * What a pane is reading, in the words of its reading: the model, then the state it opens and
 * what it is compared with, then the diagram it draws when that is not the architecture.
 * @param architecture What the pane reported.
 * @returns The phrase.
 */
function architectureWords(architecture: PaneArchitecture): string {
	const { display, selection, reading } = architecture;
	const labels =
		display === undefined
			? intentWords(architecture)
			: [display.model, display.state, display.comparison];
	return [
		...labels,
		checkpointWords(selection?.checkpoint),
		reading.grammar === "architecture" ? undefined : reading.grammar,
	]
		.filter(Boolean)
		.join(", ");
}

/**
 * Describe machine selectors when an older browser reports no labels.
 * @param architecture The captured reading.
 * @returns The model and explicit selection intent.
 */
function intentWords(architecture: PaneArchitecture) {
	const { state, against, compare } = architecture.selection ?? {};
	return [
		architecture.model,
		state === undefined ? undefined : `state ${state}`,
		comparisonWords(against, compare),
	];
}

/**
 * Describe an exact selected checkpoint without printing its complete identity.
 * @param checkpoint The selected checkpoint.
 * @returns Its short label or absence.
 */
function checkpointWords(checkpoint: string | undefined) {
	return checkpoint === undefined ? undefined : `checkpoint ${checkpoint.slice(0, 8)}`;
}

/**
 * Describe explicit intent from a browser that reports no display labels.
 * @param against The explicit comparison base.
 * @param compare Whether comparison is disabled.
 * @returns The comparison intent, without guessing the default.
 */
function comparisonWords(against: string | undefined, compare: boolean | undefined) {
	if (compare === false) return "No comparison";
	return against === undefined ? undefined : `against ${against}`;
}

/**
 * What one pane is showing, named the way somebody would say it out loud.
 * @param pane The pane.
 * @returns The phrase.
 */
function shownPhrase(pane: PaneReport): string {
	return pane.architecture == null ? "nothing yet" : architectureWords(pane.architecture);
}

/**
 * Where a pane's vault is, as the read-out says it: the repository and the
 * checkout, and whether that is the caller's own.
 * @param pane The pane.
 * @returns The phrase.
 */
function repositoryPhrase(pane: PaneReport): string {
	const named = pane.repository === null ? pane.checkout : `${pane.repository} at ${pane.checkout}`;
	return pane.own ? `${named} (your checkout)` : named;
}

/**
 * One pane as a line of the read-out: where it is, what it shows, which
 * repository it is in, how it is being read, and what is picked.
 * @param pane The pane.
 * @returns The line.
 */
function paneLine(pane: PaneReport): string {
	const { reading } = pane;
	const parts = [
		`${pane.position}. ${pane.place}`,
		shownPhrase(pane),
		repositoryPhrase(pane),
		reading.summary,
	];
	if (pane.focused) {
		parts.push("focused");
	}
	if (pane.primary) {
		parts.push("answers screenshots");
	}
	return parts.join(" · ");
}

/**
 * Build the read-out. Cost is one pass over the registry: what each pane is
 * reading is what that pane itself reported, so nothing here reads a model.
 * @param registrations The panes on screen, of which only the addressable ones are reported.
 * @param context Where to read model identities, readings and the server URL from.
 * @returns The report, and the text an agent reads out.
 */
function buildPanesReport(registrations: PaneRegistration[], context: PaneContext): PanesReport {
	const inOrder = panesInOrder(addressablePanes(registrations));
	const ordered = inOrder.map((entry) => entry.pane);
	const arrangement = arrangementOf(ordered);
	if (ordered.length === 0) {
		return emptyReport(arrangement, context);
	}
	const panes: PaneReport[] = inOrder.map((entry, index) =>
		paneReport(entry.pane, index, entry.place, context),
	);
	// One model, whichever states of it are on screen. Two panes comparing a
	// proposal against what is current are reading one document, and a command
	// that names no model is not ambiguous between them — it is the comparison
	// this tool exists for.
	const samePaneKey =
		new Set(panes.map((p) => p.architecture?.model ?? p.identity?.board ?? p.paneKey)).size === 1;
	const focused = panes.find((p) => p.focused)?.paneId ?? null;
	const summary = `${layoutPhrase(arrangement, panes.length)}${showingPhrase(panes)}.`;
	const lines = [
		summary,
		...advice(panes, arrangement),
		...panes.map((pane) => `  ${paneLine(pane)}`),
	];
	return {
		paneCount: panes.length,
		arrangement,
		focused,
		samePaneKey,
		panes,
		summary,
		text: lines.join("\n"),
	};
}

export type {
	Arrangement,
	PaneContext,
	PaneReading,
	PaneRegistration,
	PaneReport,
	PanesReport,
	Rect,
} from "#runtime/rules/panes-layout.ts";
export {
	architectureWords,
	HOW_TO_OPEN_A_PANE,
	MAX_PANES,
	addressablePanes,
	panesAddressableFirst,
	buildPanesReport,
	paneWords,
	panesInOrder,
	resolvePaneSpec,
	soloPane,
};
