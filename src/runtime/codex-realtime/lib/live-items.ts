import {
	parseRealtimeItemId,
	type RealtimeState,
	type RealtimeTranscriptRecord,
} from "@/shared/codex-realtime-host";
import type { ItemId, TrustedIdentityDecoder } from "@/shared/codex-workbench-identity";
import * as phase from "@/runtime/codex-realtime/lib/phase";
import type { RealtimeSessionOps } from "@/runtime/codex-realtime/lib/session-ops";
import type {
	ActiveRealtimeSession,
	RealtimeTranscriptEntry,
} from "@/runtime/codex-realtime/lib/state";

interface LiveRealtimeItem {
	readonly id: string;
	readonly realtimeSessionId: string;
	readonly type: string;
	readonly role?: RealtimeTranscriptRecord["role"];
	readonly text?: string;
}

interface LiveTranscriptSegment extends LiveRealtimeItem {
	readonly role: RealtimeTranscriptRecord["role"];
	readonly text: string;
}

/** A live segment is only ever provisional or final; interruption is a recovered-record status. */
type TranscriptStatus = "provisional" | "final";

/** Whether an item id is new to this session (item/started) or must already be known. */
type LiveItemIdentityMode = "introduce" | "reference";

/**
 * Decode a wire item id under the given identity mode, refusing any id that does not decode or
 * is not a realtime item id.
 * @param decoder - Decodes wire identities.
 * @param wireId - The item id as Codex sent it.
 * @param mode - Whether the id may be adopted as new or must resolve to a known id.
 * @returns The trusted item id, or null when it must be ignored.
 */
function liveItemId(
	decoder: TrustedIdentityDecoder,
	wireId: string,
	mode: LiveItemIdentityMode,
): ItemId | null {
	try {
		const itemId =
			mode === "introduce" ? decoder.adoptItemId(wireId) : decoder.resolveItemId(wireId);
		parseRealtimeItemId(itemId);
		return itemId;
	} catch {
		return null;
	}
}

/**
 * Whether an item is a transcript segment of this session with both a role and text.
 * @param session - The live session.
 * @param item - The notified item.
 * @returns True when the item can be entered into the transcript.
 */
function isTranscriptSegmentFor(
	session: ActiveRealtimeSession,
	item: LiveRealtimeItem,
): item is LiveTranscriptSegment {
	return (
		item.realtimeSessionId === session.wireSessionId &&
		item.type === "transcriptSegment" &&
		item.role !== undefined &&
		item.text !== undefined
	);
}

/**
 * The transcript order for an item: an existing entry keeps its place, a new live entry takes
 * the next live slot after every recovered position.
 * @param session - The live session.
 * @param existing - The entry already held for the item, if any.
 * @returns The order value.
 */
function liveOrder(
	session: ActiveRealtimeSession,
	existing: RealtimeTranscriptEntry | undefined,
): number {
	return existing === undefined ? session.nextLiveOrder++ : existing.order;
}

/**
 * The state steps a transcript segment implies: assistant segments drive speaking, a final user
 * segment counts as completed input.
 * @param current - The session's current state.
 * @param role - Who produced the segment.
 * @param status - Whether the segment is provisional or final.
 * @returns The states to apply in order.
 */
function segmentStates(
	current: RealtimeState,
	role: RealtimeTranscriptRecord["role"],
	status: TranscriptStatus,
): readonly RealtimeState[] {
	if (role === "assistant") {
		return phase.assistantStates(current, status);
	}
	return status === "final" ? phase.inputStates(current) : [];
}

/**
 * Enter or update one live transcript segment, advance the phase it implies and republish the
 * transcript. Items of other sessions, non-segments and unknown references are ignored.
 * @param ops - The adapter's session operations.
 * @param session - The live session.
 * @param item - The notified item.
 * @param status - Whether the segment is provisional or final.
 * @param identityMode - Whether the item id is being introduced or referenced.
 */
function upsertLiveItem(
	ops: RealtimeSessionOps,
	session: ActiveRealtimeSession,
	item: LiveRealtimeItem,
	status: TranscriptStatus,
	identityMode: LiveItemIdentityMode,
): void {
	if (!isTranscriptSegmentFor(session, item)) {
		return;
	}
	const itemId = liveItemId(ops.options.identity.decoder, item.id, identityMode);
	if (itemId === null) {
		return;
	}
	const existing = session.entries.get(itemId);
	if (identityMode === "reference" && existing === undefined) {
		return;
	}
	session.entries.set(itemId, {
		itemId,
		role: item.role,
		status,
		text: item.text,
		order: liveOrder(session, existing),
	});
	ops.states(session, segmentStates(session.state, item.role, status));
	ops.publishTranscript(session);
}

export { type LiveRealtimeItem, type LiveItemIdentityMode, liveItemId, upsertLiveItem };
