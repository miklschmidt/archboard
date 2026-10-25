import {
	normalizeCoordinatorCallback as normalizeCoreCallback,
	coordinatorCallbackKey,
	coordinatorCallbackCoalescingKey,
	type CoordinatorHostContextSource,
	type CoordinatorCallbackLinkCorrelation,
	type CoordinatorCallbackRealtimeGeneration,
	type CoordinatorHostContextCallback,
} from "@archboard/codex-realtime-voice/runtime";
import type {
	PaneFocusEvent,
	PaneSelectionEvent,
	SettledSemanticChangeEvent,
} from "#runtime/schemas/semantic-context-types.ts";
import type {
	ArchboardHostContext,
	CoordinatorCallbackSource,
} from "#runtime/protocol/coordinator-callbacks/contract.ts";
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
function typeOf(event: SemanticSource): CoordinatorHostContextSource["type"] {
	if (event.kind === "settled_change") return "change";
	return event.kind === "pane_focus" ? "focus" : "selection";
}

/**
 * Project domain fields into Archboard's payload of the host-context event.
 * @param event The domain event.
 * @returns The payload.
 */
function payloadOf(event: SemanticSource): ArchboardHostContext {
	return {
		origin: event.origin,
		significance: event.kind === "settled_change" ? event.change.significance : null,
		paneId: event.pane.paneId,
		focused: event.pane.focused,
		selection: event.architecture.selection.subjects.map(({ kind, id }) => ({ kind, id })),
		detail: event.kind === "settled_change" ? event.change.text : null,
		news: paneNews(event),
	};
}

/**
 * What tells one focus or selection apart from another captured in the same millisecond: a
 * focus by whether the pane is focused and the sentence that tells it, so two agents' shows
 * stay apart; a selection by the subjects picked.
 * @param event The domain event.
 * @param payload Its payload.
 * @returns The identity text.
 */
function identityOf(event: SemanticSource, payload: ArchboardHostContext): string {
	if (event.kind === "pane_focus") {
		return `${payload.focused ? "1" : "0"}:${payload.news?.sentence ?? ""}`;
	}
	return event.kind === "pane_selection" ? JSON.stringify(payload.selection) : "";
}

/**
 * Project domain fields into the host-context event the runtime captures. What an outside agent
 * did is told once per thing it did: a write is one whole thing somebody asked for, so nothing of
 * it is folded into the next (TASK-293.06).
 * @param event The domain event.
 * @returns The host-context event.
 */
function contextOf(event: SemanticSource): CoordinatorHostContextSource["context"] {
	const payload = payloadOf(event);
	return {
		feedId: event.feedId,
		sequence: event.cursor?.sequence ?? null,
		brief: event.brief,
		capturedAtMs: semanticCapturedAt(event),
		freshUntilMs: event.freshness.freshUntilMs,
		identity: identityOf(event, payload),
		coalesces: payload.news?.by !== "agent",
		payload,
	};
}

/** Every key of Archboard's payload, which a host-context callback must carry exactly. */
const ARCHBOARD_CONTEXT_KEYS = [
	"detail",
	"focused",
	"news",
	"origin",
	"paneId",
	"selection",
	"significance",
] as const;

/**
 * Whether a payload has exactly the keys of Archboard's; the encoder checks every value.
 * @param value The payload.
 * @returns True for an Archboard payload.
 */
function isArchboardContext(value: unknown): value is ArchboardHostContext {
	if (typeof value !== "object" || value === null) return false;
	const keys = Object.keys(value).toSorted();
	return (
		keys.length === ARCHBOARD_CONTEXT_KEYS.length &&
		ARCHBOARD_CONTEXT_KEYS.every((key, index) => keys[index] === key)
	);
}

/**
 * Read Archboard's payload of a host-context callback.
 * @param callback The normalized callback.
 * @returns The payload, or null when the callback carries none of Archboard's.
 */
function archboardContextOf(callback: CoordinatorHostContextCallback): ArchboardHostContext | null {
	const { payload } = callback.context;
	return isArchboardContext(payload) ? payload : null;
}

/**
 * Supply domain data without granting execution authority to the adapter.
 * @param event The domain event.
 * @returns The host source whose correlation the runtime independently captures.
 */
function toHostSource(event: SemanticSource): CoordinatorHostContextSource {
	return {
		kind: "host",
		type: typeOf(event),
		child: event.child,
		coordinator: event.coordinator,
		workhorse: event.workhorse,
		threadLink: event.threadLink,
		author: authorOf(event),
		context: contextOf(event),
	};
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
	archboardContextOf,
	normalizeCoordinatorCallback,
	coordinatorCallbackKey,
	coordinatorCallbackCoalescingKey,
};
