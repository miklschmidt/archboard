// Where each voice-linked pane's narration stands, over this canvas's panes (TASK-251).
//
// The step presenter beside this is pure: given what a pane shows and where a talk stands, it
// settles a step and asks the pane for it. This is the half that knows this canvas: which pane
// is which, what each last said is on screen, which walkthrough a voice session is narrating and
// which step it stands on, and what a user's hand on the keys means for a talk under way.

import type { CoordinatorToolPresentStepOutcome } from "@/runtime/codex-coordinator-tools";
import type { RealtimePresentation, RealtimePresentationChange } from "@/runtime/codex-realtime";
import { parseBoardKey } from "@/runtime/engine/board";
import type { PaneRegistration } from "@/runtime/engine/panes";
import { readSemanticBoard } from "@/runtime/semantic-board-store";
import type { SemanticPaneContext } from "@/shared/semantic-pane-context/index";
import type { SemanticBoard, SemanticWalkthrough } from "@/shared/semantic-board/index";
import { narrationTiming } from "@/server/canvas/lib/narration-timing";
import {
	panePresentations,
	type UserPresentationChange,
} from "@/server/canvas/lib/pane-presentation";
import { paneBoardOf, panes } from "@/server/canvas/lib/pane-registry";
import {
	contentOn,
	presentWalkthroughStep,
	type PresentedPane,
	type PresentStepRequest,
} from "@/server/canvas/lib/present-walkthrough-step";
import { semanticPaneContextFor } from "@/server/canvas/lib/semantic-pane-context";

// Which browser's pane each voice session is about, by the pane id the shell and the
// coordinator name it by.
//
// A pane id is not exact. A second browser on the same canvas presents a pane "A" of its own
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
 * pane with that id. Two browsers presenting that id, with neither bound, is nobody's pane.
 * @param paneId The pane, as the shell and the coordinator name it.
 * @returns The registration, or undefined.
 */
function registrationFor(paneId: string): PaneRegistration | undefined {
	const bound = voicePanes.get(paneId);
	const boundPane = bound === undefined ? undefined : panes.get(bound);
	if (boundPane !== undefined) {
		return boundPane;
	}
	const named = [...panes.values()].filter((one) => one.paneId === paneId);
	return named.length === 1 ? named[0] : undefined;
}

/**
 * What one live pane is showing: what the pane itself last said is on screen,
 * which follows a drill-down, and otherwise the board the server pointed it at.
 * @param pane The pane's registration, or undefined when it has gone.
 * @returns The board and variant, or null when the pane has gone or shows no board.
 */
function showingOf(pane: PaneRegistration | undefined): PresentedPane | null {
	if (pane === undefined) {
		return null;
	}
	return (
		paneSaid(pane.clientId, semanticPaneContextFor(pane.clientId)) ??
		paneAddressed(pane.clientId, paneBoardOf(pane.clientId))
	);
}

/**
 * What the pane a pane id means is showing.
 * @param paneId The pane, as the shell and the coordinator name it.
 * @returns The board and variant, or null when the pane has gone or shows no board.
 */
function paneShowing(paneId: string): PresentedPane | null {
	return showingOf(registrationFor(paneId));
}

/**
 * What a pane says is on screen, which follows a drill-down.
 * @param clientId The pane's client id.
 * @param said The pane's last report, or null.
 * @returns The board and variant, or null when the pane has not said.
 */
function paneSaid(clientId: string, said: SemanticPaneContext | null): PresentedPane | null {
	if (said?.board == null) {
		return null;
	}
	return {
		clientId,
		board: said.board.name,
		variant: said.variant?.id,
		presenting: said.presentation?.walkthrough ?? null,
	};
}

/**
 * What a pane that has not reported yet is showing, from the board it was pointed at.
 * @param clientId The pane's client id.
 * @param key The pane's board key, or null when it has none.
 * @returns The board and variant, or null.
 */
function paneAddressed(clientId: string, key: string | null): PresentedPane | null {
	if (key === null) {
		return null;
	}
	const identity = parseBoardKey(key);
	return { clientId, board: identity.board, variant: identity.variant, presenting: null };
}

/**
 * Read one board from the vault.
 * @param name The board's name.
 * @returns The board, or null when it cannot be read.
 */
function readBoard(name: string): SemanticBoard | null {
	const read = readSemanticBoard(name);
	return read.ok ? read.board : null;
}

/**
 * One walkthrough of the board one browser's pane is showing.
 * @param clientId The pane's client id.
 * @param walkthroughId The walkthrough's id.
 * @returns The walkthrough, or undefined when that pane's board does not state it.
 */
function walkthroughOnPane(
	clientId: string,
	walkthroughId: string,
): SemanticWalkthrough | undefined {
	const pane = showingOf(panes.get(clientId));
	const shown = pane === null ? null : contentOn({ readBoard }, pane);
	return shown?.content.walkthroughs.find((one) => one.id === walkthroughId);
}

/** Where one narration stands. */
interface NarrationStanding {
	readonly walkthrough: string;
	/** The step it stands on, counted from one; zero before the first. */
	readonly step: number;
	/**
	 * The coordinator turn that last asked for "the next step", and where the narration stood
	 * when that turn began. "Next" means one step for the whole of a turn: a coordinator that
	 * calls again because it could not read the first answer must get the same step, not the one
	 * after it. In the first session with a stepless call it called twice and the pane went to
	 * step 2 while the voice was still introducing step 1.
	 */
	readonly turn: { readonly id: string; readonly base: number } | null;
}

/** Where each voice-linked pane's narration stands, by pane id. */
const narrated = new Map<string, NarrationStanding>();

/**
 * Remember where a pane's narration stands, or forget it.
 * @param paneId The voice-linked pane.
 * @param walkthrough The walkthrough's id, or null when the narration is over.
 * @param step The step it stands on, counted from one; zero before the first.
 * @param turn The coordinator turn that asked, and where the narration stood when it began.
 */
function noteNarratedWalkthrough(
	paneId: string,
	walkthrough: string | null,
	step = 0,
	turn: NarrationStanding["turn"] = null,
): void {
	if (walkthrough === null) {
		narrated.delete(paneId);
	} else {
		narrated.set(paneId, { walkthrough, step, turn });
	}
}

/**
 * Where "the next step" counts from, for one coordinator turn.
 * @param standing Where the narration stands, or undefined before it began.
 * @param turnId The coordinator turn asking, or null when the host could not name it.
 * @returns The step to count from: where the narration stood when that turn began.
 */
function nextCountsFrom(standing: NarrationStanding | undefined, turnId: string | null): number {
	if (standing === undefined) {
		return 0;
	}
	return turnId !== null && standing.turn?.id === turnId ? standing.turn.base : standing.step;
}

/**
 * Present one step in a pane of this canvas, for the narrator linked to it.
 * @param request The pane, the step, the walkthrough when named, and the call's signal.
 * @returns The step, or why it is not on screen.
 */
async function presentStepInCanvasPane(
	request: Omit<PresentStepRequest, "sessionWalkthrough" | "lastStep"> & {
		/** The coordinator turn the call was made in, or null when the host could not name it. */
		readonly turnId: string | null;
	},
): Promise<CoordinatorToolPresentStepOutcome> {
	const standing = narrated.get(request.paneId);
	const base = nextCountsFrom(standing, request.turnId);
	const outcome = await presentWalkthroughStep(
		{
			presentations: panePresentations,
			paneShowing,
			readBoard,
		},
		{
			paneId: request.paneId,
			input: request.input,
			signal: request.signal,
			sessionWalkthrough: standing?.walkthrough ?? null,
			lastStep: base,
		},
	);
	if (outcome.tag === "ok") {
		noteNarratedWalkthrough(
			request.paneId,
			outcome.value.walkthroughId,
			outcome.value.step,
			request.turnId === null ? null : { id: request.turnId, base },
		);
		narrationTiming.stepArrived(outcome.value.step);
	}
	return outcome;
}

/**
 * The walkthrough a voice session is being started to present, written for the start.
 *
 * Read from the board the pane is showing, never taken from the browser: the
 * browser names a walkthrough and the server says what it says.
 * @param paneId The pane voice is starting for, as the shell names it.
 * @param clientId The client id of that pane in the browser the start came from.
 * @param walkthroughId The walkthrough the user chose.
 * @returns The walkthrough and what to call it.
 * @throws {Error} When the pane is not showing a board that states that walkthrough.
 */
function narrationFor(
	paneId: string,
	clientId: string,
	walkthroughId: string,
): RealtimePresentation {
	const walkthrough = walkthroughOnPane(clientId, walkthroughId);
	if (walkthrough === undefined) {
		throw new Error("The pane is not showing a board that states that walkthrough.");
	}
	noteNarratedWalkthrough(paneId, walkthrough.id);
	return { walkthrough: walkthrough.id, name: walkthrough.name };
}

/**
 * What a user's by-hand change is, as both models are told it.
 * @param change What the pane reported.
 * @returns The change, or null when the step it names is not on that pane's board.
 */
function narrationChangeOf(change: UserPresentationChange): RealtimePresentationChange | null {
	const said = change.presentation;
	if (said === null) {
		return { kind: "left" };
	}
	const walkthrough = walkthroughOnPane(change.clientId, said.walkthrough);
	const beat = walkthrough?.beats[said.beat];
	if (walkthrough === undefined || beat === undefined) {
		return null;
	}
	return {
		kind: "stepped",
		step: said.beat + 1,
		of: walkthrough.beats.length,
		heading: beat.heading,
		body: beat.body,
	};
}

/**
 * Where the user put the picture is where the talk goes on from; leaving ends the narration.
 * @param change What the pane reported.
 */
function noteWhereTheUserIs(change: UserPresentationChange): void {
	const said = change.presentation;
	if (said === null) {
		noteNarratedWalkthrough(change.paneId, null);
	} else {
		noteNarratedWalkthrough(change.paneId, said.walkthrough, said.beat + 1);
	}
}

/**
 * Whether a by-hand change is news to a narration.
 *
 * Not before its first step has been handed over, unless the user left. Pressing Narrate
 * opens the walkthrough, which is itself a by-hand choice of step 1, and its report can land just
 * after the narration begins; counted as "the user moved to step 1", it would start the talk
 * on step 2. Until the first step is handed over the talk starts at step 1 whatever is on screen.
 *
 * Nor from another browser's pane of the same id: what is done there is not this talk.
 * @param change What the pane reported.
 * @returns True when the narrator should hear of it.
 */
function narrationUnderWay(change: UserPresentationChange): boolean {
	const standing = narrated.get(change.paneId);
	const bound = voicePanes.get(change.paneId);
	if (standing === undefined || (bound !== undefined && bound !== change.clientId)) {
		return false;
	}
	return standing.step > 0 || change.presentation === null;
}

/**
 * Hear what a user does by hand to a walkthrough that is being narrated.
 *
 * Only a narrated pane's changes are told: a user reading a walkthrough on
 * their own, with nobody narrating, is nobody's news. Leaving ends the narration.
 * @param listener What to tell.
 * @returns Stops listening.
 */
function subscribeNarrationChanges(
	listener: (change: RealtimePresentationChange) => void,
): () => void {
	return panePresentations.onUserChange((change) => {
		if (!narrationUnderWay(change)) {
			return;
		}
		const told = narrationChangeOf(change);
		if (told === null) {
			return;
		}
		noteWhereTheUserIs(change);
		listener(told);
	});
}

export {
	bindVoicePane,
	narrationFor,
	nextCountsFrom,
	noteNarratedWalkthrough,
	presentStepInCanvasPane,
	subscribeNarrationChanges,
	type NarrationStanding,
};
