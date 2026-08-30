import type { BoundedValue } from "./normalize.js";
import { deepFreeze, fail, textValue } from "./normalize.js";
import { buildSemanticBrief } from "./brief.js";
import { SEMANTIC_CONTEXT_LIMITS } from "./limits.js";
import type {
	FreshSemanticBrief,
	PaneFocusEvent,
	PaneSelectionEvent,
	SemanticBrief,
	SemanticChangeOrigin,
	SemanticContextInput,
	SemanticContextPublisher,
	SemanticContextPublisherOptions,
	SemanticUnsubscribe,
	SettledChangeSourceEvent,
	SettledSemanticChangeEvent,
} from "./types.js";

export { SemanticContextInputError } from "./normalize.js";

function withKind(
	fields: ReturnType<typeof buildSemanticBrief>,
	kind: SemanticBrief["kind"],
	extra: Record<string, unknown> = {},
): SemanticBrief {
	return deepFreeze({ kind, ...fields, ...extra }) as SemanticBrief;
}

function emit<Event>(listeners: ReadonlySet<(event: Event) => void>, event: Event): void {
	for (const listener of Array.from(listeners)) listener(event);
}

function validateFeedId(feedId: string): string {
	const result = textValue(feedId, "feedId", SEMANTIC_CONTEXT_LIMITS.cursorBytes);
	if (result.truncated) {
		fail("feedId", `must not exceed ${SEMANTIC_CONTEXT_LIMITS.cursorBytes} UTF-8 bytes`);
	}
	return result.value;
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
): {
	capturedAtMs: number;
	ambiguous: boolean;
} {
	const parsed = Date.parse(at);
	return Number.isFinite(parsed)
		? { capturedAtMs: parsed, ambiguous: false }
		: { capturedAtMs: clock(), ambiguous: true };
}

export function createSemanticContextPublisher(
	options: SemanticContextPublisherOptions,
): SemanticContextPublisher {
	const feedId = validateFeedId(options.feedId);
	const clock = options.now ?? (() => Date.now());
	const settledListeners = new Set<(event: SettledSemanticChangeEvent) => void>();
	const focusListeners = new Set<(event: PaneFocusEvent) => void>();
	const selectionListeners = new Set<(event: PaneSelectionEvent) => void>();
	let disposed = false;

	const qualifyCursor = (cursor: string | number | null): BoundedValue<string | null> => {
		if (cursor === null) return { value: null, truncated: false };
		const raw = typeof cursor === "number" ? String(cursor) : cursor;
		const qualified = raw.startsWith(`${feedId}:`) ? raw : `${feedId}:${raw}`;
		const result = textValue(qualified, "cursor", SEMANTIC_CONTEXT_LIMITS.cursorBytes);
		return { value: result.value, truncated: result.truncated };
	};

	const ensureLive = (): void => {
		if (disposed) {
			throw new Error("The semantic context publisher has been disposed.");
		}
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
		const fields = buildSemanticBrief(input, feedId, qualifyCursor, clock, {
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
		emit(focusListeners, event);
		return event;
	}

	function publishPaneSelection(input: SemanticContextInput): PaneSelectionEvent {
		ensureLive();
		const capturedAtMs = clock();
		const fields = buildSemanticBrief(input, feedId, qualifyCursor, clock, {
			source: "pane_selection",
			origin: null,
			capturedAtMs,
		});
		const event = withKind(fields, "pane_selection", {
			selectionCapturedAtMs: capturedAtMs,
		}) as PaneSelectionEvent;
		emit(selectionListeners, event);
		return event;
	}

	function freshBrief(): FreshSemanticBrief {
		ensureLive();
		const capturedAtMs = clock();
		const fields = buildSemanticBrief(options.fresh.read(), feedId, qualifyCursor, clock, {
			source: "fresh_brief",
			origin: null,
			capturedAtMs,
		});
		return withKind(fields, "fresh_brief") as FreshSemanticBrief;
	}

	const onSettledChange = (event: SettledChangeSourceEvent): void => {
		if (disposed) return;
		if (!validOrigin(event.origin)) fail("change.origin", "is invalid");
		if (!validSignificance(event.significance)) {
			fail("change.significance", "is invalid");
		}
		if (event.origin === "agent" || event.significance === "cosmetic") {
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
		const context = options.contextForChange(event);
		const staleReasons =
			context.board.key === eventBoard.value
				? []
				: [
						`settled event names board "${eventBoard.value}" but context names "${context.board.key}"`,
					];
		const boardAmbiguity = staleReasons;
		const changeText = textValue(
			event.text,
			"change.text",
			SEMANTIC_CONTEXT_LIMITS.descriptionBytes,
			false,
		);
		const fields = buildSemanticBrief(context, feedId, qualifyCursor, clock, {
			source: "settled_change",
			origin: event.origin,
			capturedAtMs: capture.capturedAtMs,
			additionalAmbiguity: [
				...boardAmbiguity,
				...(eventAt.truncated ? ["settled event timestamp was truncated"] : []),
				...(capture.ambiguous
					? ["settled event timestamp was invalid; capture time was used"]
					: []),
			],
			additionalStaleReasons: staleReasons,
			inputTruncated: eventBoard.truncated || eventAt.truncated || changeText.truncated,
		});
		const published = withKind(fields, "settled_change", {
			change: {
				feedId,
				cursor: eventCursor,
				board: eventBoard.value,
				at: eventAt.value,
				origin: event.origin,
				significance: event.significance,
				text: changeText.value,
			},
		});
		emit(settledListeners, published as SettledSemanticChangeEvent);
	};

	const feedUnsubscribe = options.feed.onChange(onSettledChange);
	const paneUnsubscribes: SemanticUnsubscribe[] = [];
	if (options.pane) {
		paneUnsubscribes.push(options.pane.onFocus((input) => publishPaneFocus(input)));
		paneUnsubscribes.push(options.pane.onSelection((input) => publishPaneSelection(input)));
	}

	function dispose(): void {
		if (disposed) return;
		disposed = true;
		feedUnsubscribe();
		for (const unsubscribe of paneUnsubscribes) unsubscribe();
		settledListeners.clear();
		focusListeners.clear();
		selectionListeners.clear();
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
		dispose,
	});
}
