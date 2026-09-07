import { buildSemanticBrief } from "@/runtime/codex-semantic-context/lib/brief";
import { SEMANTIC_CONTEXT_LIMITS } from "@/runtime/codex-semantic-context/lib/limits";
import {
	byteLength,
	clipJsonUtf8,
	deepFreeze,
	feedIdValue,
	fail,
	textValue,
	type BoundedValue,
} from "@/runtime/codex-semantic-context/lib/normalize";
import type {
	FreshSemanticBrief,
	PaneFocusEvent,
	PaneSelectionEvent,
	SemanticBrief,
	SemanticChangeOrigin,
	SemanticContextInput,
	SemanticContextPublisher,
	SemanticContextPublisherOptions,
	SemanticListenerDiagnosticPolicy,
	SemanticListenerFailureBatch,
	SemanticListenerFailure,
	SemanticPublisherPort,
	SemanticUnsubscribe,
	SettledChangeSourceEvent,
	SettledSemanticChangeEvent,
} from "@/runtime/codex-semantic-context/lib/types";

import {
	errorDetails,
	LISTENER_DIAGNOSTIC_ERROR_NAME_FALLBACK,
	LISTENER_DIAGNOSTIC_FALLBACK_MESSAGE,
} from "@/runtime/codex-semantic-context/lib/listener-diagnostics";

export { SemanticContextInputError } from "@/runtime/codex-semantic-context/lib/normalize";

export class SemanticContextLifecycleError extends Error {
	readonly phase: "registration" | "dispose";
	readonly causes: readonly unknown[];

	/**
	 * Build the lifecycle failure, keeping every cause: a registration or dispose that fails partway leaves several failures, and losing any of them would hide what is still subscribed.
	 * @param phase - Whether the failure happened while registering or while disposing.
	 * @param causes - Everything that was thrown, in the order it happened.
	 */
	constructor(phase: "registration" | "dispose", causes: readonly unknown[]) {
		super(
			`Semantic context ${phase} failed with ${causes.length} error${causes.length === 1 ? "" : "s"}.`,
		);
		this.name = "SemanticContextLifecycleError";
		this.phase = phase;
		this.causes = Object.freeze([...causes]);
	}
}

/**
 * Whether a settled change is one Archboard delivers at all. An agent's own change would tell the
 * coordinator what it already knows, and a cosmetic one carries no design intent; both are dropped
 * rather than delivered as noise. An unreviewed origin or significance is refused outright.
 * @param event - The settled change the feed reported.
 * @returns True when the change should be published.
 * @throws {Error} When the change names an origin or significance that is not reviewed.
 */
function isDeliverableChange(event: SettledChangeSourceEvent): boolean {
	if (!validOrigin(event.origin)) {
		fail("change.origin", "is invalid");
	}
	if (!validSignificance(event.significance)) {
		fail("change.significance", "is invalid");
	}
	return event.origin !== "agent" && event.significance !== "cosmetic";
}

/**
 * What a change's own timestamp leaves ambiguous: it was too long to keep in full, or it could
 * not be read at all and the publisher's clock stood in for it. Both are recorded on the brief so
 * the coordinator is never given a capture time that quietly means something else.
 * @param timestampTruncated - Whether the timestamp text was shortened.
 * @param capture - What the capture step decided.
 * @returns The ambiguity reasons, which is empty when the timestamp was exact.
 */
function captureAmbiguity(timestampTruncated: boolean, capture: SemanticCapture): string[] {
	const reasons: string[] = [];
	if (timestampTruncated) {
		reasons.push("settled event timestamp was truncated");
	}
	if (capture.ambiguous) {
		reasons.push("settled event timestamp was invalid; capture time was used");
	}
	return reasons;
}

/**
 * The stale reason for a change whose board is not the board its context describes, which means
 * the brief and the change are talking about different boards.
 * @param eventBoard - The board the change named.
 * @param contextBoard - The board the context names.
 * @returns The reasons, which is empty when the two agree.
 */
function boardMismatchReasons(eventBoard: string, contextBoard: string): string[] {
	return eventBoard === contextBoard
		? []
		: [`settled event names board "${eventBoard}" but context names "${contextBoard}"`];
}

/**
 * Build one published brief from its fields: the brief's own kind, every field `buildSemanticBrief`
 * produced, and whatever that kind adds. The kind and its extra fields are what distinguish the
 * published event types from one another; nothing else about a brief changes between them.
 * @param fields - The fields the brief builder produced.
 * @param kind - The kind of brief being published.
 * @param extra - The fields this kind adds.
 * @returns The frozen event.
 */
function withKind<Event extends SemanticBrief>(
	fields: ReturnType<typeof buildSemanticBrief>,
	kind: Event["kind"],
	extra: Record<string, unknown> = {},
): Event {
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- each caller names the event type whose kind it passes and supplies exactly that kind's extra fields; TypeScript cannot tie the literal kind to the union member through an open extra record
	return deepFreeze({ kind, ...fields, ...extra }) as Event;
}

/**
 * Prove the configured feed identity is a valid one before any event is published under it.
 * @param feedId - The configured feed identity.
 * @returns The same identity.
 */
function validateFeedId(feedId: string): string {
	return feedIdValue(feedId, "feedId");
}

/**
 * Whether a settled change names one of the three reviewed origins. Origin decides whether a
 * change is delivered at all, so an unrecognised one is refused rather than guessed at.
 * @param value - The claimed origin.
 * @returns True for a reviewed origin.
 */
function validOrigin(value: unknown): value is SemanticChangeOrigin {
	return value === "human" || value === "agent" || value === "mixed";
}

/**
 * Whether a settled change names one of the three reviewed significances.
 * @param value - The claimed significance.
 * @returns True for a reviewed significance.
 */
function validSignificance(value: unknown): value is "layout" | "structural" | "cosmetic" {
	return value === "layout" || value === "structural" || value === "cosmetic";
}

/**
 * The feed cursor a settled change carries, refused unless it is a whole non-negative number: a
 * settled change without a usable cursor cannot be ordered against the rest of the feed.
 * @param value - The claimed cursor.
 * @returns The cursor.
 * @throws {Error} When the cursor is not a non-negative safe integer.
 */
function sourceCursor(value: unknown): number {
	if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
		fail("change.cursor", "must be a non-negative safe integer");
	}
	return value;
}

/** One settled change's fields, after each has been checked against its own limit. */
interface SettledChangeFields {
	readonly cursor: number;
	readonly board: BoundedValue<string>;
	readonly at: BoundedValue<string>;
	readonly capture: SemanticCapture;
}

/** When a change was captured, and whether that time had to be inferred. */
interface SemanticCapture {
	readonly capturedAtMs: number;
	readonly ambiguous: boolean;
}

/**
 * When a settled change was captured. An unparseable timestamp falls back to the clock and is
 * reported as ambiguous, so the brief says the time is approximate rather than inventing one.
 * @param at - The timestamp the change carried.
 * @param clock - The publisher's clock.
 * @returns The capture time and whether it was inferred.
 */
function dateCapture(at: string, clock: () => number): SemanticCapture {
	const parsed = Date.parse(at);
	return Number.isFinite(parsed)
		? { capturedAtMs: parsed, ambiguous: false }
		: { capturedAtMs: clock(), ambiguous: true };
}

/**
 * Run every cleanup in reverse order, collecting failures rather than stopping: one source that
 * cannot be unsubscribed must not leave the others subscribed.
 * @param cleanups - The cleanups, in the order they were made.
 * @returns Everything that was thrown.
 */
function cleanupAll(cleanups: readonly SemanticUnsubscribe[]): unknown[] {
	const errors: unknown[] = [];
	for (let index = cleanups.length - 1; index >= 0; index--) {
		try {
			cleanups[index]!();
		} catch (error) {
			errors.push(error);
		}
	}
	return errors;
}

const LISTENER_DIAGNOSTIC_MAX_DROPPED_COUNT = Number.MAX_SAFE_INTEGER;
const LISTENER_DIAGNOSTIC_MAX_ENTRIES = 64;
const LISTENER_DIAGNOSTIC_ERROR_NAME_BYTES = 128;
const LISTENER_DIAGNOSTIC_MESSAGE_BYTES = 2_048;
const LISTENER_DIAGNOSTIC_RECORD_FIXED_BYTES =
	byteLength(
		JSON.stringify({
			port: "settled_change",
			eventKind: "settled_change",
			listenerIndex: LISTENER_DIAGNOSTIC_MAX_DROPPED_COUNT,
			errorName: "",
			message: "",
		}),
	) - 4;
const LISTENER_DIAGNOSTIC_MAX_RECORD_BYTES =
	LISTENER_DIAGNOSTIC_RECORD_FIXED_BYTES +
	LISTENER_DIAGNOSTIC_ERROR_NAME_BYTES +
	LISTENER_DIAGNOSTIC_MESSAGE_BYTES;
const LISTENER_DIAGNOSTIC_BATCH_PREFIX_BYTES = byteLength('{"entries":[');
const LISTENER_DIAGNOSTIC_BATCH_SUFFIX_BYTES = byteLength(
	`],"droppedCount":${LISTENER_DIAGNOSTIC_MAX_DROPPED_COUNT}}`,
);

/**
 * One pending debug burst retains its oldest 64 reports. The two string-token
 * caps and the derived batch ceiling bound the JSON payload kept in memory.
 */
export const SEMANTIC_LISTENER_DIAGNOSTIC_POLICY: SemanticListenerDiagnosticPolicy = Object.freeze({
	maxEntries: LISTENER_DIAGNOSTIC_MAX_ENTRIES,
	errorNameBytes: LISTENER_DIAGNOSTIC_ERROR_NAME_BYTES,
	messageBytes: LISTENER_DIAGNOSTIC_MESSAGE_BYTES,
	maxBatchBytes:
		LISTENER_DIAGNOSTIC_BATCH_PREFIX_BYTES +
		LISTENER_DIAGNOSTIC_MAX_ENTRIES * LISTENER_DIAGNOSTIC_MAX_RECORD_BYTES +
		(LISTENER_DIAGNOSTIC_MAX_ENTRIES - 1) +
		LISTENER_DIAGNOSTIC_BATCH_SUFFIX_BYTES,
});

/**
 * Build the publisher that turns a person's gestures and settled board changes into semantic briefs and hands them to its subscribers. It subscribes to its sources on construction and unsubscribes on dispose; a listener that throws is recorded as a failure rather than allowed to stop delivery to the rest.
 * @param options - The feed and pane sources, the context readers, the diagnostics policy and the clock.
 * @returns The publisher.
 */
export function createSemanticContextPublisher(
	options: SemanticContextPublisherOptions,
): SemanticContextPublisher {
	const feedId = validateFeedId(options.feedId);
	const clock = options.now ?? (() => Date.now());
	const settledListeners = new Set<(event: SettledSemanticChangeEvent) => void>();
	const focusListeners = new Set<(event: PaneFocusEvent) => void>();
	const selectionListeners = new Set<(event: PaneSelectionEvent) => void>();
	const listenerFailures: SemanticListenerFailure[] = [];
	let droppedListenerFailures = 0;
	let disposed = false;

	/**
	 * Record that one listener threw, under the diagnostics policy's own limits: past the entry limit only a count is kept, so a listener failing on every event cannot grow this without bound.
	 * @param port - The port the event was published on.
	 * @param eventKind - The kind of brief being delivered.
	 * @param listenerIndex - Which listener failed, in subscription order.
	 * @param error - What it threw.
	 */
	const recordListenerFailure = (
		port: SemanticPublisherPort,
		eventKind: SemanticBrief["kind"],
		listenerIndex: number,
		error: unknown,
	): void => {
		if (listenerFailures.length >= SEMANTIC_LISTENER_DIAGNOSTIC_POLICY.maxEntries) {
			if (droppedListenerFailures < LISTENER_DIAGNOSTIC_MAX_DROPPED_COUNT) {
				droppedListenerFailures++;
			}
			return;
		}
		const details = errorDetails(error);
		const errorName =
			clipJsonUtf8(details.errorName, SEMANTIC_LISTENER_DIAGNOSTIC_POLICY.errorNameBytes).value ||
			LISTENER_DIAGNOSTIC_ERROR_NAME_FALLBACK;
		const message =
			clipJsonUtf8(details.message, SEMANTIC_LISTENER_DIAGNOSTIC_POLICY.messageBytes).value ||
			LISTENER_DIAGNOSTIC_FALLBACK_MESSAGE;
		listenerFailures.push(
			deepFreeze({
				port,
				eventKind,
				listenerIndex,
				errorName,
				message,
			}),
		);
	};

	/**
	 * Deliver one event to every listener, in subscription order, over a copy of the set so a listener that subscribes or unsubscribes during delivery cannot change who receives this event. A listener that throws is recorded and the rest still receive it.
	 * @param listeners - The listeners to deliver to.
	 * @param event - The event to deliver.
	 * @param port - The port being published on.
	 * @param eventKind - The kind of brief being delivered.
	 */
	const emit = <Event>(
		listeners: Iterable<(event: Event) => void>,
		event: Event,
		port: SemanticPublisherPort,
		eventKind: SemanticBrief["kind"],
	): void => {
		for (const [listenerIndex, listener] of Array.from(listeners).entries()) {
			try {
				listener(event);
			} catch (error) {
				recordListenerFailure(port, eventKind, listenerIndex, error);
			}
		}
	};

	/**
	 * Refuse any use of a disposed publisher, so a source that outlives its publisher cannot publish through it.
	 */
	const ensureLive = (): void => {
		if (disposed) {
			throw new Error("The semantic context publisher has been disposed.");
		}
	};

	/**
	 * Subscribe one listener and return the cleanup that removes it. The cleanup is safe to call twice: the second call does nothing rather than removing a listener somebody else added.
	 * @param listeners - The set to subscribe to.
	 * @param listener - The listener to add.
	 * @returns The unsubscribe.
	 */
	const subscribe = <Event>(
		listeners: Set<(event: Event) => void>,
		listener: (event: Event) => void,
	): SemanticUnsubscribe => {
		ensureLive();
		listeners.add(listener);
		let active = true;
		return () => {
			if (!active) {
				return;
			}
			active = false;
			listeners.delete(listener);
		};
	};

	/**
	 * Publish that a pane took or lost focus, with the context as it was at that moment.
	 * @param input - The semantic context of the pane.
	 * @returns The published event.
	 */
	function publishPaneFocus(input: SemanticContextInput): PaneFocusEvent {
		ensureLive();
		const capturedAtMs = clock();
		const fields = buildSemanticBrief(input, feedId, clock, {
			source: "pane_focus",
			origin: null,
			capturedAtMs,
		});
		const event = withKind<PaneFocusEvent>(fields, "pane_focus", {
			focus: {
				paneId: fields.pane.paneId,
				focused: fields.pane.focused,
				capturedAtMs,
			},
		});
		emit(focusListeners, event, "pane_focus", "pane_focus");
		return event;
	}

	/**
	 * Publish what a person has selected in a pane, with the context as it was at that moment.
	 * @param input - The semantic context of the pane.
	 * @returns The published event.
	 */
	function publishPaneSelection(input: SemanticContextInput): PaneSelectionEvent {
		ensureLive();
		const capturedAtMs = clock();
		const fields = buildSemanticBrief(input, feedId, clock, {
			source: "pane_selection",
			origin: null,
			capturedAtMs,
		});
		const event = withKind<PaneSelectionEvent>(fields, "pane_selection", {
			selectionCapturedAtMs: capturedAtMs,
		});
		emit(selectionListeners, event, "pane_selection", "pane_selection");
		return event;
	}

	/**
	 * Build a brief for a context the caller supplies, without publishing it: this is what a caller asks for when it needs the current state rather than a change to it.
	 * @param input - The semantic context to describe.
	 * @returns The fresh brief.
	 */
	function freshBriefFor(input: SemanticContextInput): FreshSemanticBrief {
		ensureLive();
		const capturedAtMs = clock();
		const fields = buildSemanticBrief(input, feedId, clock, {
			source: "fresh_brief",
			origin: null,
			capturedAtMs,
		});
		return withKind<FreshSemanticBrief>(fields, "fresh_brief");
	}

	/**
	 * Build a brief for the current state, read through the publisher's own fresh-context source.
	 * @returns The fresh brief.
	 */
	function freshBrief(): FreshSemanticBrief {
		return freshBriefFor(options.fresh.read());
	}

	/**
	 * Take one settled change from the feed and publish it, unless it is one Archboard does not
	 * deliver: an agent's own change, or a cosmetic one. Everything else is normalized into a brief
	 * and emitted once.
	 * @param event - The settled change the feed reported.
	 */
	const onSettledChange = (event: SettledChangeSourceEvent): void => {
		if (disposed || !isDeliverableChange(event)) {
			return;
		}
		const eventCursor = sourceCursor(event.cursor);
		const eventBoard = textValue(
			event.board,
			"change.board",
			SEMANTIC_CONTEXT_LIMITS.boardKeyBytes,
		);
		const eventAt = textValue(event.at, "change.at", SEMANTIC_CONTEXT_LIMITS.reasonBytes);
		const capture = dateCapture(eventAt.value, clock);
		let context: SemanticContextInput;
		try {
			context = options.contextForChange(event);
		} catch (error) {
			recordListenerFailure("settled_change", "settled_change", 0, error);
			return;
		}
		publishSettledChange(event, context, {
			cursor: eventCursor,
			board: eventBoard,
			at: eventAt,
			capture,
		});
	};

	/**
	 * Build and emit the brief for one settled change. A settled change must carry a cursor: it is
	 * how the coordinator orders this change against the rest of the feed, so a brief without one
	 * is refused rather than delivered unordered.
	 * @param event - The settled change the feed reported.
	 * @param context - The semantic context of the board it changed.
	 * @param settled - The change's checked cursor, board, timestamp and capture time.
	 */
	const publishSettledChange = (
		event: SettledChangeSourceEvent,
		context: SemanticContextInput,
		settled: SettledChangeFields,
	): void => {
		const staleReasons = boardMismatchReasons(settled.board.value, context.board.key);
		const changeText = textValue(
			event.text,
			"change.text",
			SEMANTIC_CONTEXT_LIMITS.descriptionBytes,
			false,
		);
		const fields = buildSemanticBrief(context, feedId, clock, {
			source: "settled_change",
			origin: event.origin,
			cursorOverride: { feedId, sequence: settled.cursor },
			capturedAtMs: settled.capture.capturedAtMs,
			additionalAmbiguity: [
				...staleReasons,
				...captureAmbiguity(settled.at.truncated, settled.capture),
			],
			additionalStaleReasons: staleReasons,
			inputTruncated: settled.board.truncated || settled.at.truncated || changeText.truncated,
		});
		if (fields.cursor === null) {
			fail("change.cursor", "settled changes require a cursor");
		}
		const published = withKind<SettledSemanticChangeEvent>(fields, "settled_change", {
			change: {
				feedId,
				cursor: fields.cursor,
				board: settled.board.value,
				at: settled.at.value,
				origin: event.origin,
				significance: event.significance,
				text: changeText.value,
			},
		});
		emit(settledListeners, published, "settled_change", "settled_change");
	};

	const sourceUnsubscribes: SemanticUnsubscribe[] = [];
	try {
		sourceUnsubscribes.push(options.feed.onChange(onSettledChange));
		if (options.pane) {
			sourceUnsubscribes.push(options.pane.onFocus((input) => publishPaneFocus(input)));
			sourceUnsubscribes.push(options.pane.onSelection((input) => publishPaneSelection(input)));
		}
	} catch (error) {
		const cleanupErrors = cleanupAll(sourceUnsubscribes);
		if (cleanupErrors.length > 0) {
			throw new SemanticContextLifecycleError("registration", [error, ...cleanupErrors]);
		}
		throw error;
	}

	/**
	 * Take the listener failures recorded since the last drain, together with how many were dropped past the policy's limit, and reset both.
	 * @returns The frozen batch.
	 */
	function drainListenerFailures(): SemanticListenerFailureBatch {
		const drained = {
			entries: listenerFailures.splice(0),
			droppedCount: droppedListenerFailures,
		};
		droppedListenerFailures = 0;
		return deepFreeze(drained);
	}

	/**
	 * Stop for good: unsubscribe from every source and forget every listener. Cleanup failures are collected and raised together, because a source that could not be unsubscribed is still delivering.
	 * @throws {SemanticContextLifecycleError} When any source cleanup failed.
	 */
	function dispose(): void {
		if (disposed) {
			return;
		}
		disposed = true;
		const cleanupErrors = cleanupAll(sourceUnsubscribes);
		settledListeners.clear();
		focusListeners.clear();
		selectionListeners.clear();
		if (cleanupErrors.length > 0) {
			throw new SemanticContextLifecycleError("dispose", cleanupErrors);
		}
	}

	return Object.freeze({
		/**
		 * Subscribe to settled board changes.
		 * @param listener - The listener to add.
		 * @returns The unsubscribe.
		 */
		subscribeSettledChange: (listener: (event: SettledSemanticChangeEvent) => void) =>
			subscribe(settledListeners, listener),
		/**
		 * Subscribe to pane focus changes.
		 * @param listener - The listener to add.
		 * @returns The unsubscribe.
		 */
		subscribePaneFocus: (listener: (event: PaneFocusEvent) => void) =>
			subscribe(focusListeners, listener),
		/**
		 * Subscribe to pane selection changes.
		 * @param listener - The listener to add.
		 * @returns The unsubscribe.
		 */
		subscribePaneSelection: (listener: (event: PaneSelectionEvent) => void) =>
			subscribe(selectionListeners, listener),
		publishPaneFocus,
		publishPaneSelection,
		freshBrief,
		freshBriefFor,
		drainListenerFailures,
		dispose,
	});
}
