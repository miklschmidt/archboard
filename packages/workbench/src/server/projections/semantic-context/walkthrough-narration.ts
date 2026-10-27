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
import {
	panePresentations,
	type UserPresentationChange,
} from "#server/services/panes/presentation.ts";
import { panes } from "#server/services/panes/registry.ts";
import { semanticPaneContextFor } from "#server/services/panes/context.ts";
import { tabSessionOf } from "#server/services/panes/tab-sessions.ts";
import type { TabSessionId } from "@archboard/codex-realtime-voice/server";

import {
	captureNarration,
	matchesCapture,
	canonicalNarrationChange,
} from "#server/projections/semantic-context/canonical-narration.ts";


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
	throw new Error("Report the exact canonical reading before starting narration.");
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
	return narration.capture === undefined ? null : capturedNarrationChange(change.clientId,narration.capture,said.beat);
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
 for (const [clientId,narration] of narrated){
  if(tabSessionOf(clientId)===tabSessionId&&narration.capture!==undefined) return `model:${narration.capture.model.manifest.id}`;
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
