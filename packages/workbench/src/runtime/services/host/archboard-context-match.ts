import type { ArchboardContext } from "#runtime/rules/instructions/context.ts";
import type { SettledSemanticChangeEvent } from "#runtime/schemas/semantic-context-types.ts";
import { canonicalSemanticCursorToken } from "#runtime/services/thread-context/event-identity.ts";
import { sameStringValues } from "#runtime/services/thread-context/link-equality.ts";

/**
 * Whether the context addresses the event's own pane and board at the event's
 * version and cursor.
 * @param context - The canonical context the adapter built.
 * @param event - The settled semantic change, already known to carry a cursor and version.
 * @param cursor - The canonical cursor token for the event.
 * @returns True when the pane and board fields agree.
 */
function boardMatches(
	context: ArchboardContext,
	event: SettledSemanticChangeEvent,
	cursor: string,
): boolean {
	return (
		context.paneId === event.pane.paneId &&
		context.board.name === event.board.name &&
		context.board.key === event.board.key &&
		context.board.version === event.version &&
		context.board.cursor === cursor
	);
}

/**
 * Whether the context embeds the event's brief with the event's freshness.
 * @param context - The canonical context the adapter built.
 * @param event - The settled semantic change.
 * @returns True when the semantic block agrees.
 */
function semanticMatches(context: ArchboardContext, event: SettledSemanticChangeEvent): boolean {
	return (
		context.semantic.brief === event.brief &&
		context.semantic.capturedAtMs === event.freshness.capturedAtMs &&
		context.semantic.freshUntilMs === event.freshness.freshUntilMs &&
		context.semantic.truncated === event.truncated
	);
}

/**
 * Whether focus and the capture times were taken from the event itself.
 *
 * What was selected is compared with the rest of the architecture, subject by
 * subject and field by field; this is only about when it was captured.
 * @param context - The canonical context the adapter built.
 * @param event - The settled semantic change.
 * @returns True when focus and selection agree with the event.
 */
function paneStateMatches(context: ArchboardContext, event: SettledSemanticChangeEvent): boolean {
	return (
		context.focus.paneId === (event.pane.focused ? event.pane.paneId : null) &&
		context.focus.capturedAtMs === event.freshness.capturedAtMs &&
		context.selection.capturedAtMs === event.freshness.capturedAtMs
	);
}

/**
 * Whether the context names the architecture the event was about, in full.
 *
 * Field by field rather than by identity, because everything here is something
 * an agent acts on or repeats to a person: a variant's lifecycle decides whether
 * it may be edited at all, a subject's name is what gets said out loud, and a
 * repair sentence is an instruction. An adapter that passed the right ids with
 * the wrong words around them would be putting its own words in front of a
 * person as though the board had said them.
 *
 * The comparison is against a re-projection of the event rather than a list of
 * field checks, so a field added to the context cannot be forgotten here: a new
 * field that the re-projection does not produce fails the comparison. That
 * failure direction is the safe one — a valid context is refused and nothing is
 * delivered, rather than an unaccounted-for field riding along unchecked.
 * @param context - The canonical context the adapter built.
 * @param event - The settled semantic change.
 * @returns True when every architectural field is the event's own.
 */
function architectureMatches(
	context: ArchboardContext,
	event: SettledSemanticChangeEvent,
): boolean {
	const architecture = event.architecture;
	const variant = architecture.variant;
	return (
		same(
			context.variant,
			variant === null
				? null
				: { id: variant.id, name: variant.name, lifecycle: variant.lifecycle },
		) &&
		same(context.view, architecture.view) &&
		same(
			{ count: context.selection.count, subjects: context.selection.subjects },
			{ count: architecture.selection.count, subjects: architecture.selection.subjects },
		) &&
		same(context.reconciliation, {
			required: architecture.reconciliation.required,
			count: architecture.reconciliation.count,
			blockedBy: architecture.reconciliation.blockedBy,
			issues: architecture.reconciliation.issues,
		})
	);
}

/**
 * Whether two projections of the same fields say the same thing.
 *
 * Both sides are built in one reviewed field order — the context by its own
 * canonical ordering, this side by the re-projection above — so comparing the
 * encodings compares the values.
 * @param one - What the context carries.
 * @param other - What the event says it should carry.
 * @returns True when they are the same projection.
 */
function same(one: unknown, other: unknown): boolean {
	return JSON.stringify(one) === JSON.stringify(other);
}

/**
 * Whether claim and ambiguity come from the event and no operation is claimed.
 * @param context - The canonical context the adapter built.
 * @param event - The settled semantic change.
 * @returns True when the claim block agrees and the operation is empty.
 */
function claimMatches(context: ArchboardContext, event: SettledSemanticChangeEvent): boolean {
	return (
		context.claim.holder === event.claim.holder &&
		context.claim.doing === event.claim.doing &&
		sameStringValues(context.ambiguity, event.ambiguity) &&
		context.operation.id === null
	);
}

/**
 * Compare board meaning and presentation with the exact event.
 * The reusable delivery gate compares execution identity independently.
 * @param event - The settled semantic change.
 * @param context - The canonical context the adapter built for it.
 * @returns True when every context field is accounted for by the event.
 */
function archboardContextMatchesEvent(
	event: SettledSemanticChangeEvent,
	context: ArchboardContext,
): boolean {
	if (event.cursor === null || event.version === null) {
		return false;
	}
	const cursor = canonicalSemanticCursorToken(event.cursor);
	return boardMatches(context, event, cursor) && capturedStateMatches(context, event);
}

/**
 * Whether the captured pane state in the context is the event's own.
 * @param context - The canonical context the adapter built.
 * @param event - The settled semantic change.
 * @returns True when semantic, focus, selection and claim all agree.
 */
function capturedStateMatches(
	context: ArchboardContext,
	event: SettledSemanticChangeEvent,
): boolean {
	return (
		semanticMatches(context, event) &&
		architectureMatches(context, event) &&
		paneStateMatches(context, event) &&
		claimMatches(context, event)
	);
}

export { archboardContextMatchesEvent };

/**
 * Read the Archboard event payload at the host boundary without granting execution authority.
 * @param event The source event with its identity and freshness.
 * @returns The Archboard domain event.
 */
function archboardContextEvent(
	event: import("#runtime/protocol/host/context-source.ts").WorkbenchContextEvent,
): SettledSemanticChangeEvent {
	if (!("board" in event) || !("architecture" in event) || !("pane" in event))
		throw new TypeError("Archboard context event has no board or pane.");
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- only the Archboard publisher supplies this payload; the core separately checks execution and freshness
	return event as SettledSemanticChangeEvent;
}
export { archboardContextEvent };
