// What one pane is reading, published to the server so an agent can ground a
// request in it without waking a browser.
//
// The pane is read-only, so this is the whole of what a person contributes to
// a board's context: which board and variant they are looking at, which named
// view they are reading it through, and which semantic subjects they picked
// out. No geometry, no camera, and nothing that could be mistaken for content
// (ADR 0023) — the board on disk is still the only thing that says what the
// architecture is.
//
// Debounced for the same reason a selection always has been: picking things out
// is a click a second, and what reads this is a command that runs once a turn.
//
// The wire shape is `@/shared/semantic-pane-context`, which the reader of these
// reports owns; nothing about it is restated here.

import {
	SEMANTIC_PANE_CONTEXT_ROUTE,
	type SemanticPaneContext,
	type SemanticPanePart,
} from "@/shared/semantic-pane-context";
import { SELECTION_DEBOUNCE_MS } from "@/shared/timing/timing";
import { createUserMarks } from "@/ui/pane-session/lib/user-marks";
import { post } from "@/ui/server-requests";

/** What one pane is reading, before its identity, count and moment are stamped on. */
type PaneReading = Omit<SemanticPaneContext, "paneId" | "clientId" | "at" | "sequence" | "byUser">;

/** A pane showing nothing: what a pane reports when it leaves a board. */
const NOTHING_READ: PaneReading = Object.freeze({
	board: null,
	variant: null,
	view: null,
	selection: [],
	version: null,
});

/** One pane's reading publisher. */
interface ReadingPublisher {
	/**
	 * The reading changed; publish it after the debounce.
	 * @param reading What the pane is reading now.
	 */
	readonly publish: (reading: PaneReading) => void;
	/**
	 * The user asked, by hand, for a part of the reading to change. The report in which it does
	 * change says so; a part that changes without this is told to nobody.
	 * @param part The part their gesture was about.
	 */
	readonly userChanged: (part: SemanticPanePart) => void;
	/**
	 * What the user asked for came to nothing, so that part is not waiting to change.
	 * @param part The part.
	 */
	readonly userChangeFailed: (part: SemanticPanePart) => void;
	/** Forget what was published and what was read, because the board changed. */
	readonly reset: () => void;
	/** Send the last reading again, because whoever had it no longer does. */
	readonly republish: () => void;
	/** The pane is closing. */
	readonly dispose: () => void;
}

/** What the publisher needs beyond the reading itself. */
interface ReadingPublisherParts {
	readonly paneId: string;
	readonly clientId: string;
	/**
	 * Send one reading. Supplied by a test; the route otherwise.
	 * @param body The report.
	 * @returns The server's answer, which says whether it kept the report.
	 */
	readonly send?: (body: SemanticPaneContext) => Promise<ReadingReply>;
	/**
	 * Say that a report arrived out of order. Supplied by a test; the console
	 * otherwise.
	 * @param message What happened.
	 */
	readonly warn?: (message: string) => void;
}

/** What the reader answers a report with. */
interface ReadingReply {
	/** False when this report was overtaken by a later one and dropped. */
	readonly kept?: boolean;
}

/**
 * Send one reading to the server.
 * @param body The report.
 * @returns The server's answer.
 */
function sendReading(body: SemanticPaneContext): Promise<ReadingReply> {
	return post<ReadingReply>(SEMANTIC_PANE_CONTEXT_ROUTE, body);
}

/**
 * Create the reading publisher for one pane.
 * @param parts The pane's identity and, for a test, where readings go.
 * @returns The publisher.
 */
function createReadingPublisher(parts: ReadingPublisherParts): ReadingPublisher {
	const send = parts.send ?? sendReading;
	const warn = parts.warn ?? ((message: string): void => console.warn(message));
	let timer: ReturnType<typeof setTimeout> | null = null;
	let published = "";
	let pending: PaneReading | null = null;
	// The last reading this pane had, kept so it can be said again. A pane whose
	// socket dropped is retired by the server along with its report, and nothing
	// about the pane changed while it was away — so without this the pane would
	// stay ungrounded until the person next touched it, and an agent asked what
	// they were looking at would be told nothing.
	let latest: PaneReading | null = null;
	// Which report this is. Two reports can be in flight at once and HTTP does
	// not promise the order they arrive in, so the reader keeps the highest
	// count it has seen and this is how it tells them apart. It counts up for
	// the life of this publisher and never goes back.
	let sequence = 0;
	const marks = createUserMarks();

	/** Send the pending reading, unless it is what was already published. */
	function flush(): void {
		timer = null;
		const reading = pending ?? NOTHING_READ;
		pending = null;
		// The moment is deliberately outside the comparison: two readings that say
		// the same thing are one reading, however long apart they were made.
		const key = JSON.stringify({ paneId: parts.paneId, clientId: parts.clientId, ...reading });
		if (key === published) {
			return;
		}
		published = key;
		const counted = sequence;
		sequence += 1;
		// A report that has to be sent again after a failure goes without its marks. Saying
		// nothing is the safe way to be wrong here.
		const byUser = marks.take(reading);
		send({
			paneId: parts.paneId,
			clientId: parts.clientId,
			...reading,
			...(byUser.length === 0 ? {} : { byUser: [...byUser] }),
			at: new Date().toISOString(),
			sequence: counted,
		})
			.then((reply) => noteDropped(reply, counted))
			.catch(() => {
				// A failed publication forgets what was published, so the next change
				// resends rather than leaving the server describing an older pane.
				published = "";
			});
	}

	/**
	 * The reading changed.
	 * @param reading What the pane is reading now.
	 */
	function publish(reading: PaneReading): void {
		latest = reading;
		pending = reading;
		if (timer !== null) {
			clearTimeout(timer);
		}
		timer = setTimeout(flush, SELECTION_DEBOUNCE_MS);
	}

	/**
	 * Say so when the reader dropped a report as overtaken.
	 *
	 * It means this publisher is racing itself, or has been restarted without a
	 * fresh client id. Neither should happen, and both are invisible without
	 * this: the reader answers a dropped report exactly as it answers a kept one.
	 * @param reply What the reader answered.
	 * @param counted Which report it was.
	 */
	function noteDropped(reply: ReadingReply, counted: number): void {
		if (reply.kept === false) {
			warn(
				`Pane ${parts.paneId} report ${counted} arrived after a later one and was dropped. ` +
					"What an agent is told about this pane may be behind what is on screen.",
			);
		}
	}

	/**
	 * Forget what was published and what was read.
	 *
	 * For a pane that has moved to another board: what it was reading names
	 * subjects of a board it is no longer showing, and saying it again would be
	 * saying something that is not true any more.
	 */
	function reset(): void {
		published = "";
		latest = null;
		pending = null;
	}

	/**
	 * Say the last reading again.
	 *
	 * For a pane whose socket came back: the server retired this pane's report
	 * when the socket closed, and the reading itself never changed, so nothing
	 * on the browser's side would otherwise ever mention it again.
	 */
	function republish(): void {
		if (latest !== null) {
			published = "";
			publish(latest);
		}
	}

	/** The pane is closing. */
	function dispose(): void {
		if (timer !== null) {
			clearTimeout(timer);
			timer = null;
		}
	}

	return {
		publish,
		userChanged: marks.mark,
		userChangeFailed: marks.unmark,
		republish,
		reset,
		dispose,
	};
}

export { NOTHING_READ, createReadingPublisher, type PaneReading, type ReadingPublisher };
