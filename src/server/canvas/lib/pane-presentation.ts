// Asking a pane for a step of a walkthrough, and hearing where it got to.
//
// Where a pane is in a walkthrough is the pane's own (ADR 0023): nothing here
// holds a position or sets one. Narrate asks for the first step, the pane goes
// there the way it would for a key press, and the pane's own report says which
// step is on screen and whether it has finished arriving (TASK-251). The acknowledgement is that report and never a promise from the
// shell, for the reason a layout's is a registration: it is the only evidence
// in this process of what a user can see.
//
// The same reports say when a user stepped by hand or left. A position a
// request did not put there is somebody's hand on the keys, and the voice
// narrating it has to be told, or it goes on describing a picture nobody is
// looking at.

import { randomUUID } from "node:crypto";

import type {
	PanePresentRequest,
	SemanticPaneContext,
	SemanticPanePresentation,
} from "@/shared/semantic-pane-context/index";
import { PRESENTATION_ARRIVAL_TIMEOUT_MS } from "@/shared/timing/timing";
import { paneBoardOf, panes, sendToPane } from "@/server/canvas/lib/pane-registry";

/** Why a pane could not be shown the step it was asked for. */
type PresentRefusal =
	/** No live pane has that id, or it is showing no board. */
	| "no_pane"
	/** A later request for the same pane replaced this one. */
	| "superseded"
	/** A user stepped by hand or left while the step was on its way. */
	| "person_took_over"
	/** The pane never said the step arrived. */
	| "timeout"
	/** The canvas is stopping. */
	| "stopping";

/** How asking a pane for a step ended. */
type PresentOutcome =
	| { readonly kind: "arrived"; readonly presentation: SemanticPanePresentation }
	| { readonly kind: "refused"; readonly reason: PresentRefusal };

/** What to ask of one pane. */
interface PresentInput {
	/**
	 * The pane, by its client id: exact, where a shell id ("A") is one a second browser on the
	 * same canvas presents a pane of too.
	 */
	readonly clientId: string;
	/** The walkthrough to present. */
	readonly walkthrough: string;
	/** Which beat of it, counted from zero. */
	readonly beat: number;
}

/** A user moved a presentation, or left it. */
interface UserPresentationChange {
	readonly paneId: string;
	readonly clientId: string;
	/** Where the presentation is now, or null when the user left it. */
	readonly presentation: SemanticPanePresentation | null;
}

/** One request a pane has not answered yet. */
interface Pending {
	readonly request: string;
	/**
	 * Whether the pane has been seen answering this request. A report is sent a
	 * moment after what it describes, so one that lands after the request went
	 * out may still be about where a user had the pane before it arrived. Only
	 * once the pane has taken the request up is a position a user chose a user
	 * taking over.
	 */
	takenUp: boolean;
	readonly settle: (outcome: PresentOutcome) => void;
}

/** Where a live pane is, as the presentation port needs to know it. */
interface PresentablePane {
	readonly clientId: string;
	/** The board key the pane is showing, which its socket messages are addressed by. */
	readonly board: string;
}

/** What the port needs of the canvas around it. */
interface PanePresentationParts {
	/**
	 * The live pane with that client id, showing a board.
	 * @param clientId The pane's client id.
	 * @returns The pane, or null when it has gone or shows no board.
	 */
	readonly paneFor: (clientId: string) => PresentablePane | null;
	/**
	 * Send one request down a pane's socket.
	 * @param pane The pane.
	 * @param message The request.
	 * @returns Whether a live socket took it.
	 */
	readonly send: (pane: PresentablePane, message: PanePresentRequest) => boolean;
}

/** Asking panes for steps, and hearing where they got to. */
interface PanePresentations {
	/**
	 * Ask one pane for a step of a walkthrough, and wait for the pane to say it arrived.
	 * @param input The pane, the walkthrough and the beat.
	 * @returns How it ended: arrived, or refused with the reason.
	 */
	readonly present: (input: PresentInput) => Promise<PresentOutcome>;
	/**
	 * Take what a pane just said about its presentation.
	 *
	 * Called for a report the pane-context store kept, so an overtaken report
	 * never reaches here. It settles the request the pane was sent when the report
	 * answers it, and otherwise tells the listeners when the position is one a
	 * user chose and is not the one the pane last said.
	 * @param report The pane's report.
	 */
	readonly note: (report: SemanticPaneContext) => void;
	/**
	 * Hear when a user steps a presentation by hand, or leaves it.
	 * @param listener What to tell.
	 * @returns Stops listening.
	 */
	readonly onUserChange: (listener: (change: UserPresentationChange) => void) => () => void;
	/** Refuse every unanswered request and forget every position: the canvas is stopping. */
	readonly forget: () => void;
}

/**
 * Whether two positions are the same step of the same walkthrough.
 * @param one A position, or null.
 * @param other The other, or null.
 * @returns True when neither is presenting, or both are on the same step.
 */
function sameStep(
	one: SemanticPanePresentation | null,
	other: SemanticPanePresentation | null,
): boolean {
	if (one === null || other === null) {
		return one === other;
	}
	return one.walkthrough === other.walkthrough && one.beat === other.beat;
}

/**
 * Whether a report answers the request a pane was sent.
 * @param waiting The unanswered request.
 * @param said Where the pane says its presentation is, or null.
 * @returns The outcome it settles, or null when the pane is still on its way.
 */
function answerTo(waiting: Pending, said: SemanticPanePresentation | null): PresentOutcome | null {
	return said?.answering === waiting.request && said.arrived
		? { kind: "arrived", presentation: said }
		: null;
}

/**
 * Whether a position is one a user chose: a step nobody asked for, or an empty
 * pane that was presenting a moment ago.
 * @param before Where the pane last said it was, or null.
 * @param said Where it says it is now, or null.
 * @returns True when a user's hand moved it from where it was.
 */
function movedByPerson(
	before: SemanticPanePresentation | null,
	said: SemanticPanePresentation | null,
): boolean {
	const byPerson = said === null ? before !== null : said.answering === null;
	return byPerson && !sameStep(before, said);
}

/**
 * Settle a request the pane's report answers, and note when the pane has taken it up.
 * @param waiting The unanswered request, or undefined when the pane was sent none.
 * @param said Where the pane says its presentation is, or null.
 * @returns True when the report answered the request.
 */
function settledBy(waiting: Pending | undefined, said: SemanticPanePresentation | null): boolean {
	if (waiting === undefined) {
		return false;
	}
	const outcome = answerTo(waiting, said);
	if (outcome !== null) {
		waiting.settle(outcome);
		return true;
	}
	if (said?.answering === waiting.request) {
		waiting.takenUp = true;
	}
	return false;
}

/** The state one port keeps: what each pane was asked, and where each last said it was. */
interface PresentationLedger {
	/** The unanswered request per pane, by client id: a pane shows one step at a time. */
	readonly pending: Map<string, Pending>;
	/** Where each pane last said its presentation was, by client id. */
	readonly lastSaid: Map<string, SemanticPanePresentation | null>;
	readonly listeners: Set<(change: UserPresentationChange) => void>;
}

/**
 * Wait for one pane to answer one request.
 * @param parts How to send to the pane.
 * @param ledger The port's state.
 * @param pane The pane.
 * @param input What was asked of it.
 * @returns How it ended.
 */
function awaitAnswer(
	parts: PanePresentationParts,
	ledger: PresentationLedger,
	pane: PresentablePane,
	input: PresentInput,
): Promise<PresentOutcome> {
	const { clientId } = pane;
	const { pending } = ledger;
	const request = `present:${randomUUID()}`;
	return new Promise<PresentOutcome>((resolve) => {
		const timer = setTimeout(() => {
			settle({ kind: "refused", reason: "timeout" });
		}, PRESENTATION_ARRIVAL_TIMEOUT_MS);
		/**
		 * End the wait once, whoever ends it.
		 * @param outcome How it ended.
		 */
		function settle(outcome: PresentOutcome): void {
			if (pending.get(clientId)?.request !== request) {
				return;
			}
			pending.delete(clientId);
			clearTimeout(timer);
			resolve(outcome);
		}
		pending.set(clientId, { request, takenUp: false, settle });
		const sent = parts.send(pane, {
			type: "pane_present",
			request,
			walkthrough: input.walkthrough,
			beat: input.beat,
		});
		if (!sent) {
			settle({ kind: "refused", reason: "no_pane" });
		}
	});
}

/**
 * Refuse a request a user's hand overtook, once the pane had taken it up. Before
 * that, the position may be where they had the pane before the request arrived.
 * @param waiting The unanswered request, or undefined when the pane was sent none.
 */
function refuseTakenOver(waiting: Pending | undefined): void {
	if (waiting?.takenUp === true) {
		waiting.settle({ kind: "refused", reason: "person_took_over" });
	}
}

/**
 * Take what a pane just said about its presentation.
 * @param ledger The port's state.
 * @param report The pane's report.
 */
function noteReport(ledger: PresentationLedger, report: SemanticPaneContext): void {
	const said = report.presentation ?? null;
	const before = ledger.lastSaid.get(report.clientId) ?? null;
	ledger.lastSaid.set(report.clientId, said);
	const waiting = ledger.pending.get(report.clientId);
	if (settledBy(waiting, said) || !movedByPerson(before, said)) {
		return;
	}
	refuseTakenOver(waiting);
	for (const listener of ledger.listeners) {
		listener({ paneId: report.paneId, clientId: report.clientId, presentation: said });
	}
}

/**
 * The port over one canvas's panes.
 * @param parts How to find a pane and how to send to it.
 * @returns The port.
 */
function createPanePresentations(parts: PanePresentationParts): PanePresentations {
	const ledger: PresentationLedger = {
		pending: new Map(),
		lastSaid: new Map(),
		listeners: new Set(),
	};

	/**
	 * Ask one pane for a step, replacing whatever it was asked before.
	 * @param input The pane, the walkthrough and the beat.
	 * @returns How it ended.
	 */
	function present(input: PresentInput): Promise<PresentOutcome> {
		const pane = parts.paneFor(input.clientId);
		if (pane === null) {
			return Promise.resolve({ kind: "refused", reason: "no_pane" });
		}
		ledger.pending.get(pane.clientId)?.settle({ kind: "refused", reason: "superseded" });
		return awaitAnswer(parts, ledger, pane, input);
	}

	/**
	 * Hear when a user steps a presentation by hand, or leaves it.
	 * @param listener What to tell.
	 * @returns Stops listening.
	 */
	function onUserChange(listener: (change: UserPresentationChange) => void): () => void {
		ledger.listeners.add(listener);
		return (): void => {
			ledger.listeners.delete(listener);
		};
	}

	/** Refuse every unanswered request and forget every position. */
	function forget(): void {
		// Settling removes the entry, which a Map allows while it is walked.
		for (const waiting of ledger.pending.values()) {
			waiting.settle({ kind: "refused", reason: "stopping" });
		}
		ledger.lastSaid.clear();
	}

	return {
		present,
		/**
		 * Take what a pane just said about its presentation.
		 * @param report The pane's report.
		 */
		note: (report) => {
			noteReport(ledger, report);
		},
		onUserChange,
		forget,
	};
}

/** This canvas's port, over the pane registry. */
const panePresentations = createPanePresentations({
	// By the pane's own client id and nothing looser: a narrator is linked to one pane in one
	// browser, "the only pane on screen" is not that pane once it has gone, and a second
	// browser's pane of the same shell id is not it either.
	/**
	 * The live pane with that client id, showing a board.
	 * @param clientId The pane's client id.
	 * @returns The pane, or null.
	 */
	paneFor(clientId) {
		const pane = panes.get(clientId);
		const board = pane === undefined ? null : paneBoardOf(pane.clientId);
		return pane === undefined || board === null ? null : { clientId: pane.clientId, board };
	},
	/**
	 * Send one request down a pane's socket.
	 * @param pane The pane.
	 * @param message The request.
	 * @returns Whether a live socket took it.
	 */
	send: (pane, message) => sendToPane(pane.clientId, message, pane.board),
});

export {
	createPanePresentations,
	panePresentations,
	type PanePresentations,
	type UserPresentationChange,
	type PresentInput,
	type PresentOutcome,
	type PresentRefusal,
};
