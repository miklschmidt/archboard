import { buildSemanticBrief } from "./brief.js";
import { SEMANTIC_CONTEXT_LIMITS } from "./limits.js";
import { byteLength, clipJsonUtf8, deepFreeze, feedIdValue, fail, textValue } from "./normalize.js";
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
} from "./types.js";

export { SemanticContextInputError } from "./normalize.js";

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

const LISTENER_DIAGNOSTIC_FALLBACK_NAME = "ThrownValue";
const LISTENER_DIAGNOSTIC_FALLBACK_MESSAGE = "listener failure details unavailable";
const LISTENER_DIAGNOSTIC_ERROR_NAME_FALLBACK = "Error";

export class SemanticContextLifecycleError extends Error {
	readonly phase: "registration" | "dispose";
	readonly causes: readonly unknown[];

	constructor(phase: "registration" | "dispose", causes: readonly unknown[]) {
		super(
			`Semantic context ${phase} failed with ${causes.length} error${causes.length === 1 ? "" : "s"}.`,
		);
		this.name = "SemanticContextLifecycleError";
		this.phase = phase;
		this.causes = Object.freeze([...causes]);
	}
}

function withKind(
	fields: ReturnType<typeof buildSemanticBrief>,
	kind: SemanticBrief["kind"],
	extra: Record<string, unknown> = {},
): SemanticBrief {
	return deepFreeze({ kind, ...fields, ...extra }) as SemanticBrief;
}

function validateFeedId(feedId: string): string {
	return feedIdValue(feedId, "feedId");
}

function validOrigin(value: unknown): value is SemanticChangeOrigin {
	return value === "human" || value === "agent" || value === "mixed";
}

function validSignificance(value: unknown): value is "layout" | "structural" | "cosmetic" {
	return value === "layout" || value === "structural" || value === "cosmetic";
}

function sourceCursor(value: unknown): number {
	if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
		fail("change.cursor", "must be a non-negative safe integer");
	}
	return value;
}

function dateCapture(
	at: string,
	clock: () => number,
): { capturedAtMs: number; ambiguous: boolean } {
	const parsed = Date.parse(at);
	return Number.isFinite(parsed)
		? { capturedAtMs: parsed, ambiguous: false }
		: { capturedAtMs: clock(), ambiguous: true };
}

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

function errorDetails(error: unknown): { errorName: string; message: string } {
	let isError: boolean;
	try {
		isError = error instanceof Error;
	} catch {
		return {
			errorName: LISTENER_DIAGNOSTIC_FALLBACK_NAME,
			message: LISTENER_DIAGNOSTIC_FALLBACK_MESSAGE,
		};
	}
	if (isError) {
		let errorName: unknown;
		let message: unknown;
		try {
			errorName = (error as Error).name;
		} catch {
			errorName = LISTENER_DIAGNOSTIC_ERROR_NAME_FALLBACK;
		}
		try {
			message = (error as Error).message;
		} catch {
			message = LISTENER_DIAGNOSTIC_FALLBACK_MESSAGE;
		}
		return {
			errorName:
				typeof errorName === "string" && errorName.length > 0
					? errorName
					: LISTENER_DIAGNOSTIC_ERROR_NAME_FALLBACK,
			message:
				typeof message === "string" && message.length > 0
					? message
					: LISTENER_DIAGNOSTIC_FALLBACK_MESSAGE,
		};
	}
	try {
		return { errorName: LISTENER_DIAGNOSTIC_FALLBACK_NAME, message: String(error) };
	} catch {
		return {
			errorName: LISTENER_DIAGNOSTIC_FALLBACK_NAME,
			message: LISTENER_DIAGNOSTIC_FALLBACK_MESSAGE,
		};
	}
}

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

	const ensureLive = (): void => {
		if (disposed) throw new Error("The semantic context publisher has been disposed.");
	};

	const subscribe = <Event>(
		listeners: Set<(event: Event) => void>,
		listener: (event: Event) => void,
	): SemanticUnsubscribe => {
		ensureLive();
		listeners.add(listener);
		let active = true;
		return () => {
			if (!active) return;
			active = false;
			listeners.delete(listener);
		};
	};

	function publishPaneFocus(input: SemanticContextInput): PaneFocusEvent {
		ensureLive();
		const capturedAtMs = clock();
		const fields = buildSemanticBrief(input, feedId, clock, {
			source: "pane_focus",
			origin: null,
			capturedAtMs,
		});
		const event = withKind(fields, "pane_focus", {
			focus: {
				paneId: fields.pane.paneId,
				focused: fields.pane.focused,
				capturedAtMs,
			},
		}) as PaneFocusEvent;
		emit(focusListeners, event, "pane_focus", "pane_focus");
		return event;
	}

	function publishPaneSelection(input: SemanticContextInput): PaneSelectionEvent {
		ensureLive();
		const capturedAtMs = clock();
		const fields = buildSemanticBrief(input, feedId, clock, {
			source: "pane_selection",
			origin: null,
			capturedAtMs,
		});
		const event = withKind(fields, "pane_selection", {
			selectionCapturedAtMs: capturedAtMs,
		}) as PaneSelectionEvent;
		emit(selectionListeners, event, "pane_selection", "pane_selection");
		return event;
	}

	function freshBriefFor(input: SemanticContextInput): FreshSemanticBrief {
		ensureLive();
		const capturedAtMs = clock();
		const fields = buildSemanticBrief(input, feedId, clock, {
			source: "fresh_brief",
			origin: null,
			capturedAtMs,
		});
		return withKind(fields, "fresh_brief") as FreshSemanticBrief;
	}

	function freshBrief(): FreshSemanticBrief {
		return freshBriefFor(options.fresh.read());
	}

	const onSettledChange = (event: SettledChangeSourceEvent): void => {
		if (disposed) return;
		if (!validOrigin(event.origin)) fail("change.origin", "is invalid");
		if (!validSignificance(event.significance)) fail("change.significance", "is invalid");
		if (event.origin === "agent" || event.significance === "cosmetic") return;
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
		const staleReasons =
			context.board.key === eventBoard.value
				? []
				: [
						`settled event names board "${eventBoard.value}" but context names "${context.board.key}"`,
					];
		const changeText = textValue(
			event.text,
			"change.text",
			SEMANTIC_CONTEXT_LIMITS.descriptionBytes,
			false,
		);
		const fields = buildSemanticBrief(context, feedId, clock, {
			source: "settled_change",
			origin: event.origin,
			cursorOverride: { feedId, sequence: eventCursor },
			capturedAtMs: capture.capturedAtMs,
			additionalAmbiguity: [
				...staleReasons,
				...(eventAt.truncated ? ["settled event timestamp was truncated"] : []),
				...(capture.ambiguous
					? ["settled event timestamp was invalid; capture time was used"]
					: []),
			],
			additionalStaleReasons: staleReasons,
			inputTruncated: eventBoard.truncated || eventAt.truncated || changeText.truncated,
		});
		if (fields.cursor === null) fail("change.cursor", "settled changes require a cursor");
		const published = withKind(fields, "settled_change", {
			change: {
				feedId,
				cursor: fields.cursor,
				board: eventBoard.value,
				at: eventAt.value,
				origin: event.origin,
				significance: event.significance,
				text: changeText.value,
			},
		}) as SettledSemanticChangeEvent;
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

	function drainListenerFailures(): SemanticListenerFailureBatch {
		const drained = {
			entries: listenerFailures.splice(0),
			droppedCount: droppedListenerFailures,
		};
		droppedListenerFailures = 0;
		return deepFreeze(drained);
	}

	function dispose(): void {
		if (disposed) return;
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
		subscribeSettledChange: (listener: (event: SettledSemanticChangeEvent) => void) =>
			subscribe(settledListeners, listener),
		subscribePaneFocus: (listener: (event: PaneFocusEvent) => void) =>
			subscribe(focusListeners, listener),
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
