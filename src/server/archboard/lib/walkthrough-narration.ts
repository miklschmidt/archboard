// What the voice model is told of a narrated walkthrough, over this Archboard server's panes (TASK-251).
//
// The user steps the presentation; the voice explains the step on screen. Pressing Narrate starts
// voice for one walkthrough, and the server opens its first step in the pane. From then on every
// step the pane says it is on, the first included, reaches the voice model the same way, and so
// does leaving. Nothing here chooses a step: the pane is where the talk is.
//
// A recording (TASK-304) is started the same way, but its page opens step 1 itself and moves on
// by itself, so the server opens nothing: every step the recording pane reports, the first
// included, reaches the voice model as a step chosen by hand does.

import type { RealtimePresentation, RealtimePresentationChange } from "@/runtime/codex-realtime";
import { parseBoardKey, statedVariant } from "@/runtime/engine/board";
import { addressablePanes, type PaneRegistration } from "@/runtime/engine/panes";
import { readSemanticBoard } from "@/runtime/semantic-board-store";
import {
	addressedVariant,
	type SemanticBoard,
	type SemanticVariant,
	type SemanticWalkthrough,
} from "@/shared/semantic-board/index";
import {
	panePresentations,
	type UserPresentationChange,
} from "@/server/archboard/lib/pane-presentation";
import { narratedSubjects } from "@/server/archboard/narrated-subjects";
import { paneBoardOf, panes } from "@/server/archboard/lib/pane-registry";
import { semanticPaneContextFor } from "@/server/archboard/lib/semantic-pane-context";

// Which browser's pane each voice session is about, by the pane id the shell and the
// coordinator name it by.
//
// A pane id is not exact. A second browser on the same server presents a pane "A" of its own
// (on 2026-09-22 the ChatGPT desktop app held one for a day beside Chrome's), and whichever
// registered first would answer for both: Narrate looked for the walkthrough on the other
// browser's board and refused. A voice session is started from one browser, whose client id the
// start carries, and everything said in it is about that browser's pane.
const voicePanes = new Map<string, string>();

/**
 * A voice session started from one browser's pane; its narration is about that pane.
 * @param paneId The pane, as the shell and the coordinator name it.
 * @param clientId The client id of the pane in the browser the session was started from.
 */
function bindVoicePane(paneId: string, clientId: string): void {
	voicePanes.set(paneId, clientId);
}

/**
 * The live pane a pane id means: the bound browser's while it is on screen, otherwise the only
 * addressable pane with that id. Two browsers presenting that id, with neither bound, is nobody's
 * pane; a recording page, which binds its own at its start, is never found by the id alone.
 * @param paneId The pane, as the shell and the coordinator name it.
 * @returns The registration, or undefined.
 */
function registrationFor(paneId: string): PaneRegistration | undefined {
	const bound = voicePanes.get(paneId);
	const boundPane = bound === undefined ? undefined : panes.get(bound);
	if (boundPane !== undefined) {
		return boundPane;
	}
	const named = addressablePanes([...panes.values()]).filter((one) => one.paneId === paneId);
	return named.length === 1 ? named[0] : undefined;
}

/**
 * What one live pane is showing: what the pane itself last said is on screen,
 * which follows a drill-down, and otherwise the board the server pointed it at.
 * @param clientId The pane's client id.
 * @returns The board by name and the variant, or null when the pane has gone or shows no board.
 */
function showingOf(
	clientId: string,
): { readonly board: string; readonly variant: string | undefined } | null {
	if (!panes.has(clientId)) {
		return null;
	}
	const said = semanticPaneContextFor(clientId);
	if (said?.board != null) {
		return { board: said.board.name, variant: said.variant?.id };
	}
	const key = paneBoardOf(clientId);
	if (key === null) {
		return null;
	}
	const identity = parseBoardKey(key);
	return { board: identity.board, variant: statedVariant(identity) };
}

/** One walkthrough of the board a pane is showing, with the board and variant it belongs to. */
interface ShownWalkthrough {
	readonly board: SemanticBoard;
	readonly variant: SemanticVariant;
	readonly walkthrough: SemanticWalkthrough;
}

/**
 * One walkthrough of the board one browser's pane is showing, read from the vault.
 * @param clientId The pane's client id.
 * @param walkthroughId The walkthrough's id.
 * @returns The walkthrough, or undefined when that pane's board does not state it.
 */
function walkthroughOnPane(clientId: string, walkthroughId: string): ShownWalkthrough | undefined {
	const showing = showingOf(clientId);
	if (showing === null) {
		return undefined;
	}
	const read = readSemanticBoard(showing.board);
	if (!read.ok) {
		return undefined;
	}
	const opened = addressedVariant(read.board, showing.variant);
	if (!opened.ok) {
		return undefined;
	}
	const walkthrough = opened.variant.content.walkthroughs.find((one) => one.id === walkthroughId);
	return walkthrough === undefined
		? undefined
		: { board: read.board, variant: opened.variant, walkthrough };
}

/** The walkthrough each voice-linked pane is narrating, by pane id. */
const narrated = new Map<string, string>();

/** Who hears what the voice model is to be told: the voice session's delivery. */
const listeners = new Set<(change: RealtimePresentationChange) => void>();

/**
 * The walkthrough a voice session is being started to present, written for the start.
 *
 * Read from the board the pane is showing, never taken from the browser: the
 * browser names a walkthrough and the server says what it says.
 * @param paneId The pane voice is starting for, as the shell names it.
 * @param clientId The client id of that pane in the browser the start came from.
 * @param walkthroughId The walkthrough the user chose.
 * @param recording Whether the talk is recorded rather than listened to live.
 * @returns The walkthrough, what to call it and whether it is recorded.
 * @throws {Error} When the pane is not showing a board that states that walkthrough.
 */
function narrationFor(
	paneId: string,
	clientId: string,
	walkthroughId: string,
	recording: boolean,
): RealtimePresentation {
	const walkthrough = walkthroughOnPane(clientId, walkthroughId)?.walkthrough;
	if (walkthrough === undefined) {
		throw new Error("The pane is not showing a board that states that walkthrough.");
	}
	narrated.set(paneId, walkthrough.id);
	return { walkthrough: walkthrough.id, name: walkthrough.name, recording };
}

/**
 * A voice session that narrates nothing is starting for this pane.
 * @param paneId The pane, as the shell names it.
 */
function forgetNarration(paneId: string): void {
	narrated.delete(paneId);
}

/**
 * What the voice model is told of where a narrated pane's presentation now is.
 * @param change What the pane reported.
 * @returns The change, or null when the step it names is not on that pane's board.
 */
function narrationChangeOf(change: UserPresentationChange): RealtimePresentationChange | null {
	const said = change.presentation;
	if (said === null) {
		return { kind: "left" };
	}
	const shown = walkthroughOnPane(change.clientId, said.walkthrough);
	const beat = shown?.walkthrough.beats[said.beat];
	if (shown === undefined || beat === undefined) {
		return null;
	}
	return {
		kind: "stepped",
		step: said.beat + 1,
		of: shown.walkthrough.beats.length,
		heading: beat.heading,
		body: beat.body,
		subjects: narratedSubjects(shown.board, shown.variant, beat),
	};
}

/**
 * Whether a pane's news is a narration's: a user reading a walkthrough on their own, with nobody
 * narrating, is nobody's news, and neither is another browser's pane of the same id.
 * @param change Where the pane says its presentation is.
 * @returns True when the voice session should hear it.
 */
function narratedHere(change: UserPresentationChange): boolean {
	const bound = voicePanes.get(change.paneId) ?? change.clientId;
	return narrated.has(change.paneId) && bound === change.clientId;
}

/**
 * Tell the voice session where a narrated pane's presentation now is. Leaving ends the
 * narration.
 * @param change Where the pane says its presentation is.
 */
function tell(change: UserPresentationChange): void {
	const told = narratedHere(change) ? narrationChangeOf(change) : null;
	if (told === null) {
		return;
	}
	if (told.kind === "left") {
		narrated.delete(change.paneId);
	}
	for (const listener of listeners) {
		listener(told);
	}
}

panePresentations.onUserChange(tell);

/**
 * Open a narration's first step in its pane, and tell the voice session once it has arrived.
 *
 * The step then reaches the voice model the way every step the user moves to does. A step that
 * never arrives, because the pane closed or the user moved first, is not told: where the user
 * moved is.
 * @param paneId The narrated pane, as the shell names it.
 */
async function openNarration(paneId: string): Promise<void> {
	const walkthrough = narrated.get(paneId);
	const pane = registrationFor(paneId);
	if (walkthrough === undefined || pane === undefined) {
		return;
	}
	const outcome = await panePresentations.present({
		clientId: pane.clientId,
		walkthrough,
		beat: 0,
	});
	if (outcome.kind === "arrived") {
		tell({ paneId, clientId: pane.clientId, presentation: outcome.presentation });
	}
}

/**
 * Hear what the voice model is to be told of a narrated walkthrough.
 * @param listener What to tell.
 * @returns Stops listening.
 */
function subscribeNarrationChanges(
	listener: (change: RealtimePresentationChange) => void,
): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

export { bindVoicePane, forgetNarration, narrationFor, openNarration, subscribeNarrationChanges };
