import {
	normalizeCoordinatorCallback as normalizeCoreCallback,
	coordinatorCallbackKey,
	coordinatorCallbackCoalescingKey,
	type CoordinatorHostCallbackSource,
	type CoordinatorCallbackLinkCorrelation,
	type CoordinatorCallbackRealtimeGeneration,
	type CoordinatorSemanticCallback,
} from "@archboard/agent-workbench/runtime";
import type {
	PaneFocusEvent,
	PaneSelectionEvent,
	SettledSemanticChangeEvent,
} from "#runtime/schemas/semantic-context-types.ts";
import type { CoordinatorCallbackSource } from "#runtime/protocol/coordinator-callbacks/contract.ts";
import { paneNews } from "#runtime/rules/coordinator-callbacks/pane-news.ts";

type SemanticSource = SettledSemanticChangeEvent | PaneFocusEvent | PaneSelectionEvent;

/**
 * Read the gesture time from its domain event.
 * @param event The domain event.
 * @returns The capture time.
 */
function semanticCapturedAt(event: SemanticSource): number {
	if (event.kind === "pane_focus") return event.focus.capturedAtMs;
	return event.kind === "pane_selection"
		? event.selectionCapturedAtMs
		: event.freshness.capturedAtMs;
}

/**
 * Read the author of a write or a pane switch.
 * @param event The domain event.
 * @returns The author, or null for an unattributed event.
 */
function authorOf(event: SemanticSource): string | null {
	if (event.kind === "settled_change") return event.change.by;
	return event.kind === "pane_focus" ? (event.agentSwitch?.by ?? null) : null;
}

/**
 * Read the structural callback type from the domain event.
 * @param event The domain event.
 * @returns The callback type.
 */
function typeOf(event: SemanticSource): CoordinatorHostCallbackSource["type"] {
	if (event.kind === "settled_change") return "change";
	return event.kind === "pane_focus" ? "focus" : "selection";
}

/**
 * Project domain fields into the structural callback data that the runtime captures.
 * @param event The domain event.
 * @returns The callback data.
 */
function dataOf(event: SemanticSource): CoordinatorHostCallbackSource["semantic"] {
	return {
		feedId: event.feedId,
		sequence: event.cursor?.sequence ?? null,
		origin: event.origin,
		significance: event.kind === "settled_change" ? event.change.significance : null,
		brief: event.brief,
		capturedAtMs: semanticCapturedAt(event),
		freshUntilMs: event.freshness.freshUntilMs,
		paneId: event.pane.paneId,
		focused: event.pane.focused,
		selection: event.architecture.selection.subjects.map(({ kind, id }) => ({ kind, id })),
		detail: event.kind === "settled_change" ? event.change.text : null,
		news: paneNews(event),
	};
}

/**
 * Supply domain data without granting execution authority to the adapter.
 * @param event The domain event.
 * @returns The host source whose correlation the runtime independently captures.
 */
function toHostSource(event: SemanticSource): CoordinatorHostCallbackSource {
	return {
		kind: "host",
		type: typeOf(event),
		child: event.child,
		coordinator: event.coordinator,
		workhorse: event.workhorse,
		threadLink: event.threadLink,
		author: authorOf(event),
		semantic: dataOf(event),
	};
}

/**
 * Normalize a domain source through the single runtime implementation.
 * @param event The domain event.
 * @param link The captured workhorse link.
 * @param generation The current realtime generation.
 * @returns The immutable normalized callback.
 */
function normalizeSemanticCallback(
	event: SemanticSource,
	link: CoordinatorCallbackLinkCorrelation,
	generation: CoordinatorCallbackRealtimeGeneration | null,
): CoordinatorSemanticCallback {
	const callback = normalizeCoreCallback(toHostSource(event), link, generation);
	if (callback.kind !== "semantic") throw new TypeError("Expected host context callback.");
	return callback;
}

/**
 * Adapt a domain source or pass through a runtime source.
 * @param event The source event.
 * @param link The captured workhorse link.
 * @param generation The current realtime generation.
 * @returns The immutable normalized callback.
 */
function normalizeCoordinatorCallback(
	event: CoordinatorCallbackSource,
	link: CoordinatorCallbackLinkCorrelation,
	generation: CoordinatorCallbackRealtimeGeneration | null,
) {
	return normalizeCoreCallback(callbackSource(event), link, generation);
}

/**
 * Adapt only the domain sources.
 * @param event The source event.
 * @returns The runtime source.
 */
function callbackSource(event: CoordinatorCallbackSource) {
	if (!("kind" in event) || event.kind === "workhorse_news" || event.kind === "host") return event;
	return toHostSource(event);
}
export {
	callbackSource,
	toHostSource,
	normalizeSemanticCallback,
	normalizeCoordinatorCallback,
	coordinatorCallbackKey,
	coordinatorCallbackCoalescingKey,
};
