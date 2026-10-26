// Archboard's context changes, as the voice agent announces them (TASK-530.05): a board change
// that settled, and what a pane shows or has picked out. Each tab session has one semantic
// publisher, which reads the change feed the tab hears and the pane reports of its panes; each
// event it publishes is one `agent.announce`. What is Archboard's stays here: which changes are
// news at all (the publisher drops a cosmetic one), the words a model is told (pane-news.ts),
// whether a board is on screen, whether a narration stops for it, and a brief that went stale.

import type { ContextChange, TabSessionId } from "@archboard/codex-realtime-voice/server";
import { checkoutOfVault } from "@archboard/workspace/vault";
import { createSemanticContextPublisher } from "#runtime/operations/semantic-context-publisher.ts";
import { paneNews } from "#runtime/rules/coordinator-callbacks/pane-news.ts";
import { archboardPayloadOf } from "#runtime/services/host/archboard.ts";
import type {
	CoordinatorCallbackCanvas,
	CoordinatorPaneNews,
} from "#runtime/protocol/coordinator-callbacks/contract.ts";
import type {
	PaneFocusEvent,
	PaneSelectionEvent,
	SemanticContextPublisher,
	SemanticContextPublisherOptions,
	SettledSemanticChangeEvent,
} from "#runtime/schemas/semantic-context-types.ts";
import { canonicalContextFromBrief } from "#server/projections/semantic-context/semantic-input.ts";

/** The feed pane reports are announced on: one sequence for every pane of the process. */
const PANE_FEED = "archboard_panes";

/** What one tab session's canvas holds when a change of it is announced. */
interface TabCanvas {
	readonly id: TabSessionId;
	readonly canvas: CoordinatorCallbackCanvas;
}

/**
 * Whether pane news stops the narration under way: news that stops a talk, of the narrated board
 * or of no board in particular.
 * @param news The pane news.
 * @param canvas What the canvas holds.
 * @returns True when the voice answers it now.
 */
function stopsNarration(news: CoordinatorPaneNews, canvas: CoordinatorCallbackCanvas): boolean {
	return (
		news.stops &&
		canvas.narrated !== null &&
		(news.board === null || news.board === canvas.narrated)
	);
}

/**
 * What the coordinator and the voice are told of one event. The voice is told every piece of news
 * of a board on screen, and the coordinator what an agent outside the session did, since neither
 * model asked for it.
 * @param news The pane news, or null when nothing of the event was the user's or an outside agent's.
 * @param canvas What the canvas holds.
 * @returns The coordinator's and the voice's parts of the change.
 */
function heard(
	news: CoordinatorPaneNews | null,
	canvas: CoordinatorCallbackCanvas,
): Pick<ContextChange, "coordinator" | "voice"> {
	if (news === null) return { voice: { withheld: "agent" } };
	if (news.board !== null && !canvas.boards.includes(news.board)) {
		return { voice: { withheld: "not_shown" } };
	}
	return {
		...(news.by === "agent" ? { coordinator: { text: news.sentence } } : {}),
		voice: { text: news.sentence, speech: stopsNarration(news, canvas) },
	};
}

/**
 * The change one settled board change announces to one tab session: the brief to the workhorse of
 * the board's checkout, and the news to the coordinator and the voice.
 * @param event The settled change, as the tab's publisher built it.
 * @param tab The tab session and its canvas.
 * @returns The change.
 */
function boardChangeAnnouncement(event: SettledSemanticChangeEvent, tab: TabCanvas): ContextChange {
	const checkouts = [checkoutOfVault(event.board.vault)];
	return {
		feed: event.change.feedId,
		sequence: event.change.cursor.sequence,
		tabSessions: [tab.id],
		author: event.change.by,
		capturedAtMs: event.freshness.capturedAtMs,
		workhorse:
			event.staleness.state === "current"
				? {
						checkouts,
						text: event.brief,
						payload: archboardPayloadOf(
							canonicalContextFromBrief(event, event.pane.paneId, {
								id: null,
								kind: null,
								rpc: null,
								outcome: null,
							}),
						),
					}
				: { checkouts, withheld: "stale" },
		...heard(paneNews(event), tab.canvas),
	};
}

/**
 * What a pane report is about, who moved the pane when an agent did, and when it was captured.
 * @param event The focus or selection report.
 * @returns Those parts of the change.
 */
function paneFacts(
	event: PaneFocusEvent | PaneSelectionEvent,
): Required<Pick<ContextChange, "topic" | "author" | "capturedAtMs">> {
	return event.kind === "pane_focus"
		? {
				topic: "focus",
				author: event.agentSwitch?.by ?? null,
				capturedAtMs: event.focus.capturedAtMs,
			}
		: { topic: "selection", author: null, capturedAtMs: event.selectionCapturedAtMs };
}

/**
 * The change one pane report announces to one tab session. What the user changed by hand is
 * replaced by the next report of the same kind while it waits; what an agent did is told once.
 * @param event The focus or selection report.
 * @param tab The tab session and its canvas.
 * @param sequence The report's place in the pane feed.
 * @returns The change.
 */
function paneAnnouncement(
	event: PaneFocusEvent | PaneSelectionEvent,
	tab: TabCanvas,
	sequence: number,
): ContextChange {
	const news = paneNews(event);
	const { topic, ...facts } = paneFacts(event);
	return {
		feed: PANE_FEED,
		sequence,
		tabSessions: [tab.id],
		...facts,
		...(news?.by === "agent" ? {} : { topic }),
		...heard(news, tab.canvas),
	};
}

/** What announcing the changes of the tab sessions needs from the server around it. */
interface ArchboardAnnouncementOptions {
	/** Where a tab session's publisher reads its changes and pane reports. */
	readonly publisherOptions: (id: TabSessionId) => SemanticContextPublisherOptions;
	/** What a tab session's canvas holds now. */
	readonly canvas: (id: TabSessionId) => CoordinatorCallbackCanvas;
	/** Announce one change to the voice agent. */
	readonly announce: (change: ContextChange) => Promise<unknown>;
	/** Report a change that could not be announced. */
	readonly onError: (error: unknown) => void;
}

/** The tab sessions' publishers, each announcing what it publishes. */
interface ArchboardAnnouncements {
	/** The tab session's publisher, made on first use. */
	readonly publisherFor: (id: TabSessionId) => SemanticContextPublisher;
	/** Keep the publishers of these tab sessions and dispose of every other. */
	readonly keepOnly: (ids: readonly TabSessionId[]) => void;
	/** Dispose of every publisher. */
	readonly dispose: () => void;
}

/**
 * Announce what each tab session's publisher publishes.
 * @param options Where publishers read, what canvases hold, and the voice agent.
 * @returns The publishers.
 */
function createArchboardAnnouncements(
	options: ArchboardAnnouncementOptions,
): ArchboardAnnouncements {
	const publishers = new Map<TabSessionId, SemanticContextPublisher>();
	let paneSequence = 0;
	/**
	 * Announce one change, and report it when it cannot be.
	 * @param change The change, built when this is called.
	 */
	const tell = (change: () => ContextChange): void => {
		try {
			void options.announce(change()).catch(options.onError);
		} catch (error) {
			options.onError(error);
		}
	};
	/**
	 * Make one tab session's publisher and announce what it publishes.
	 * @param id The tab session.
	 * @returns The publisher.
	 */
	const open = (id: TabSessionId): SemanticContextPublisher => {
		const publisher = createSemanticContextPublisher(options.publisherOptions(id));
		/**
		 * The tab session and its canvas now.
		 * @returns Both.
		 */
		const tab = (): TabCanvas => ({ id, canvas: options.canvas(id) });
		publisher.subscribeSettledChange((event) => {
			tell(() => boardChangeAnnouncement(event, tab()));
		});
		/**
		 * Announce one pane report.
		 * @param event The report.
		 */
		const onPane = (event: PaneFocusEvent | PaneSelectionEvent): void => {
			const sequence = paneSequence++;
			tell(() => paneAnnouncement(event, tab(), sequence));
		};
		publisher.subscribePaneFocus(onPane);
		publisher.subscribePaneSelection(onPane);
		publishers.set(id, publisher);
		return publisher;
	};
	/**
	 * Dispose of one publisher.
	 * @param id Its tab session.
	 */
	const close = (id: TabSessionId): void => {
		const publisher = publishers.get(id);
		publishers.delete(id);
		try {
			publisher?.dispose();
		} catch (error) {
			options.onError(error);
		}
	};
	return Object.freeze({
		/**
		 * The tab session's publisher, made on first use.
		 * @param id The tab session.
		 * @returns Its publisher.
		 */
		publisherFor: (id: TabSessionId) => publishers.get(id) ?? open(id),
		/**
		 * Keep the publishers of these tab sessions and dispose of every other.
		 * @param ids The tab sessions to keep.
		 */
		keepOnly: (ids: readonly TabSessionId[]) => {
			for (const id of publishers.keys()) if (!ids.includes(id)) close(id);
		},
		/** Dispose of every publisher. */
		dispose: () => {
			for (const id of publishers.keys()) close(id);
		},
	});
}

export {
	boardChangeAnnouncement,
	createArchboardAnnouncements,
	paneAnnouncement,
	type ArchboardAnnouncements,
};
