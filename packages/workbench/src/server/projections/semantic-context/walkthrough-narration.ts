// What the voice model is told of a narrated walkthrough, over this Archboard server's panes (TASK-251).
//
// The user steps the presentation; the voice explains the step on screen. Pressing Narrate starts
// voice for one walkthrough, and the server opens its first step in the pane. From then on every
// step the pane says it is on, the first included, reaches the voice model the same way, and so
// does leaving. Nothing here chooses a step: the pane is where the talk is.
//
// A pane is named by its client id here, never by the shell's "A": every browser tab presents a
// pane "A" of its own (on 2026-09-22 the ChatGPT desktop app held one for a day beside Chrome's),
// and a narration is about the exact pane its voice session was started from (TASK-294, TASK-373).
//
// A recording (TASK-304) is started the same way, but its page opens step 1 itself and moves on
// by itself, so the server opens nothing: every step the recording pane reports, the first
// included, reaches the voice model as a step chosen by hand does.

import type {
	RealtimePresentation,
	RealtimePresentationChange,
} from "#runtime/rules/realtime/presentation-mode.ts";
import { parseBoardKey, statedVariant } from "@archboard/board/address";
import { readBoardVariant } from "@archboard/board/store-read";
import type { SemanticBoard, SemanticVariant } from "@archboard/board/document";
import {
	panePresentations,
	type UserPresentationChange,
} from "#server/services/panes/presentation.ts";
import { narratedSubjects } from "#server/rules/semantic-context/narrated-subjects.ts";
import { paneBoardOf, panes } from "#server/services/panes/registry.ts";
import { semanticPaneContextFor } from "#server/services/panes/context.ts";
import { aggregateKey } from "#server/projections/semantic-context/board-context.ts";
import { tabSessionOf } from "#server/services/panes/tab-sessions.ts";
import type { TabSessionId } from "@archboard/codex-realtime-voice/server";
import type { VariantContent } from "@archboard/board/content";

import {
	captureNarration,
	matchesCapture,
	canonicalNarrationChange,
} from "#server/projections/semantic-context/canonical-narration.ts";

type SemanticWalkthrough = VariantContent["walkthroughs"][number];

/**
 * The board a pane shows: what the pane itself last said is on screen, which
 * follows a drill-down, and otherwise the board the server pointed it at.
 * @param clientId The pane's client id.
 * @returns The board by name and the variant, or null when the pane shows no board.
 */
function boardOnPane(clientId: string): {
	readonly board: string;
	readonly variant: string | undefined;
} | null {
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

/**
 * What one live pane is showing, and the vault it shows it in.
 * @param clientId The pane's client id.
 * @returns The vault, board and variant, or null when the pane has gone or shows no board.
 */
function showingOf(clientId: string): {
	readonly vault: string;
	readonly board: string;
	readonly variant: string | undefined;
} | null {
	const pane = panes.get(clientId);
	const shown = pane === undefined ? null : boardOnPane(clientId);
	return pane === undefined || shown === null ? null : { vault: pane.vault, ...shown };
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
	const opened = readBoardVariant(showing.vault, showing.board, showing.variant);
	if (!opened.ok) {
		return undefined;
	}
	const walkthrough = opened.variant.content.walkthroughs.find((one) => one.id === walkthroughId);
	return walkthrough === undefined
		? undefined
		: { board: opened.board, variant: opened.variant, walkthrough };
}

type CanonicalCapture = {
	readonly vault: string;
	readonly model: Awaited<ReturnType<typeof captureNarration>>;
};

/**
 * The walkthrough each voice-linked pane is narrating, by the pane's client id, and for a
 * recording made with `--against` the id of the variant its frames are drawn against.
 */
const narrated = new Map<
	string,
	{
		readonly walkthrough: string;
		readonly against: string | null;
		readonly capture?: CanonicalCapture;
	}
>();

/** What the voice model is to be told of one narrated pane, and which pane, by client id. */
type NarrationListener = (change: RealtimePresentationChange, clientId: string) => void;

/** Who hears what the voice model is to be told: the voice session's delivery. */
const listeners = new Set<NarrationListener>();

/**
 * The walkthrough a voice session is being started to present, written for the start.
 *
 * Read from the board the pane is showing, never taken from the browser: the
 * browser names a walkthrough and the server says what it says.
 * @param clientId The client id of the pane the start came from.
 * @param walkthroughId The walkthrough the user chose.
 * @param recording For a talk recorded rather than listened to live, the language it is narrated
 *   in and the variant its frames are drawn against, if it names one; null otherwise.
 * @returns The walkthrough, what to call it and, for a recording, its language.
 * @throws {Error} When the pane is not showing a board that states that walkthrough.
 */
function narrationFor(
	clientId: string,
	walkthroughId: string,
	recording: RealtimePresentation["recording"],
): RealtimePresentation | Promise<RealtimePresentation> {
	const architecture = semanticPaneContextFor(clientId)?.architecture;
	if (architecture != null) {
		return capturedNarrationFor(clientId, architecture, walkthroughId, recording);
	}
	return legacyNarrationFor(clientId, walkthroughId, recording);
}

/**
 * Capture a canonical narrative for the exact pane and vault that requested it.
 * @param clientId The pane's client identity.
 * @param architecture The reported address and revision guards.
 * @param walkthroughId The chosen narrative.
 * @param recording The existing recording mode.
 * @returns The prepared voice presentation.
 */
async function capturedNarrationFor(
	clientId: string,
	architecture: Parameters<typeof captureNarration>[0],
	walkthroughId: string,
	recording: RealtimePresentation["recording"],
): Promise<RealtimePresentation> {
	if (panes.get(clientId)?.vault !== architecture.vault)
		throw new Error("The pane no longer belongs to the narrative vault.");
	const model = await captureNarration(architecture, walkthroughId);
	const walkthrough = model.playback.walkthrough;
	narrated.set(clientId, {
		walkthrough: walkthrough.id,
		against: null,
		capture: { vault: architecture.vault, model },
	});
	return { walkthrough: walkthrough.id, name: walkthrough.name, recording };
}

/**
 * Prepare the existing board-owned narration.
 * @param clientId The pane's client identity.
 * @param walkthroughId The chosen walkthrough.
 * @param recording The existing recording mode.
 * @returns The prepared voice presentation.
 */
function legacyNarrationFor(
	clientId: string,
	walkthroughId: string,
	recording: RealtimePresentation["recording"],
): RealtimePresentation {
	const walkthrough = walkthroughOnPane(clientId, walkthroughId)?.walkthrough;
	if (walkthrough === undefined) {
		throw new Error("The pane is not showing a board that states that walkthrough.");
	}
	narrated.set(clientId, { walkthrough: walkthrough.id, against: recording?.against ?? null });
	return { walkthrough: walkthrough.id, name: walkthrough.name, recording };
}

/**
 * The variant a narrated pane's recording is drawn against.
 * @param clientId The pane's client id.
 * @returns The variant's id, or null for a narration with none.
 */
function againstOf(clientId: string): string | null {
	return narrated.get(clientId)?.against ?? null;
}

/**
 * The voice session that narrated this pane has been replaced: nothing it shows is news now.
 * @param clientId The pane's client id.
 */
function forgetNarration(clientId: string): void {
	narrated.delete(clientId);
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
	const narration = narrated.get(change.clientId);
	if (narration === undefined) return null;
	if (!said.arrived || said.walkthrough !== narration.walkthrough) return null;
	return narration.capture === undefined
		? legacyNarrationChange(change.clientId, said)
		: capturedNarrationChange(change.clientId, narration.capture, said.beat);
}

/**
 * Match an arrived pane to its server-owned canonical capture.
 * @param clientId The reporting pane.
 * @param capture The original vault and immutable model.
 * @param beat The arrived beat.
 * @returns Captured narration when the pane still shows that reading.
 */
function capturedNarrationChange(
	clientId: string,
	capture: CanonicalCapture,
	beat: number,
): RealtimePresentationChange | null {
	const architecture = semanticPaneContextFor(clientId)?.architecture;
	if (architecture == null) return null;
	if (architecture.vault !== capture.vault) return null;
	return matchesCapture(capture.model, architecture)
		? canonicalNarrationChange(capture.model, beat)
		: null;
}

/**
 * Explain one arrived legacy beat through its existing board reader.
 * @param clientId The reporting pane.
 * @param said The arrived position.
 * @returns The existing board narration or absence.
 */
function legacyNarrationChange(
	clientId: string,
	said: NonNullable<UserPresentationChange["presentation"]>,
): RealtimePresentationChange | null {
	const shown = walkthroughOnPane(clientId, said.walkthrough);
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
		subjects: narratedSubjects(shown.board, shown.variant, beat, againstOf(clientId)),
	};
}

/**
 * Tell the voice session where a narrated pane's presentation now is. A user reading a
 * walkthrough on their own, with nobody narrating, is nobody's news, and neither is another
 * tab's pane of the same id. Leaving ends the narration.
 * @param change Where the pane says its presentation is.
 */
function tell(change: UserPresentationChange): void {
	const told = narrated.has(change.clientId) ? narrationChangeOf(change) : null;
	if (told === null) {
		return;
	}
	if (told.kind === "left") {
		narrated.delete(change.clientId);
	}
	for (const listener of listeners) {
		listener(told, change.clientId);
	}
}

panePresentations.onUserChange(tell);

/**
 * Open a narration's first step in its pane, and tell the voice session once it has arrived.
 *
 * The step then reaches the voice model the way every step the user moves to does. A step that
 * never arrives, because the pane closed or the user moved first, is not told: where the user
 * moved is.
 * @param clientId The narrated pane's client id.
 */
async function openNarration(clientId: string): Promise<void> {
	const narration = narrated.get(clientId);
	const pane = panes.get(clientId);
	if (narration === undefined || pane === undefined) {
		return;
	}
	const outcome = await panePresentations.present({
		clientId,
		walkthrough: narration.walkthrough,
		beat: 0,
	});
	if (outcome.kind === "arrived" && narrated.get(clientId) === narration) {
		tell({ paneId: pane.paneId, clientId, presentation: outcome.presentation });
	}
}

/**
 * What a user does by hand to a walkthrough one browser tab's voice narrates: only a pane of that
 * tab is its news (TASK-373).
 * @param tabSessionId The tab.
 * @returns Subscribes a listener, and returns what stops it.
 */
function narrationChangesOf(
	tabSessionId: TabSessionId,
): (listener: (change: RealtimePresentationChange) => void) => () => void {
	return (listener) =>
		subscribeNarrationChanges((change, clientId) => {
			if (tabSessionOf(clientId) === tabSessionId) {
				listener(change);
			}
		});
}

/**
 * The board a narration in one of a browser tab's panes is on, read from what that pane shows now.
 * @param tabSessionId The tab.
 * @returns The board's aggregate key, or null when no pane of that tab is narrated.
 */
function narratedBoardOf(tabSessionId: TabSessionId): string | null {
	for (const [clientId, narration] of narrated) {
		if (narration.capture !== undefined) continue;
		const showing = tabSessionOf(clientId) === tabSessionId ? showingOf(clientId) : null;
		if (showing !== null) {
			return aggregateKey(showing.board);
		}
	}
	return null;
}

/**
 * Hear what the voice model is to be told of a narrated walkthrough, and of which pane.
 * @param listener What to tell.
 * @returns Stops listening.
 */
function subscribeNarrationChanges(listener: NarrationListener): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

export {
	forgetNarration,
	narratedBoardOf,
	narrationChangesOf,
	narrationFor,
	openNarration,
	subscribeNarrationChanges,
};
