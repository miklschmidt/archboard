import {
	SEMANTIC_CONTEXT_ELLIPSIS,
	SEMANTIC_CONTEXT_LIMITS,
} from "@/runtime/codex-semantic-context/lib/limits";
import type {
	SemanticContextInput,
	SemanticClaimHolder,
	SemanticChild,
	SemanticClaim,
	SemanticCoordinator,
	SemanticBoard,
	SemanticCursor,
	SemanticCursorInput,
	SemanticPane,
	SemanticThreadLink,
	SemanticWorkhorse,
} from "@/runtime/codex-semantic-context/lib/types";

interface BoundedValue<Value> {
	readonly value: Value;
	readonly truncated: boolean;
}

interface NormalizedContext {
	readonly repository: string;
	readonly child: SemanticChild;
	readonly threadLink: SemanticThreadLink;
	readonly workhorse: SemanticWorkhorse;
	readonly coordinator: SemanticCoordinator;
	readonly board: SemanticBoard & { readonly version: number | null };
	readonly pane: SemanticPane;
	readonly selection: readonly string[];
	readonly claim: SemanticClaim;
	readonly doing: string | null;
	readonly cursor: SemanticCursor | null;
	readonly description: string;
	readonly ambiguity: readonly string[];
	readonly staleReasons: readonly string[];
	readonly truncated: boolean;
}

class SemanticContextInputError extends Error {
	readonly field: string;

	/**
	 * Names the context field that failed validation so the adapter that
	 * supplied it can be corrected.
	 * @param field - The dotted path of the offending field.
	 * @param message - What the field must satisfy.
	 */
	constructor(field: string, message: string) {
		super(`${field}: ${message}`);
		this.name = "SemanticContextInputError";
		this.field = field;
	}
}

/**
 * Throws the input error for one field.
 * @param field - The dotted path of the offending field.
 * @param message - What the field must satisfy.
 */
function fail(field: string, message: string): never {
	throw new SemanticContextInputError(field, message);
}

/**
 * UTF-8 size of a string.
 * @param value - The text.
 * @returns The byte count of its UTF-8 encoding.
 */
function byteLength(value: string): number {
	return new TextEncoder().encode(value).byteLength;
}

/** Control characters JSON spells with a two-character escape. */
const JSON_SHORT_ESCAPES: ReadonlySet<number> = new Set([0x08, 0x09, 0x0a, 0x0c, 0x0d]);

/**
 * Whether a one-code-unit character is an unpaired surrogate, which
 * JSON.stringify writes as a six-byte `\uXXXX` escape.
 * @param character - One code point as iterated from a string.
 * @returns True for a lone surrogate.
 */
function isLoneSurrogate(character: string): boolean {
	const codeUnit = character.charCodeAt(0);
	return character.length === 1 && codeUnit >= 0xd800 && codeUnit <= 0xdfff;
}

/**
 * UTF-8 bytes one code point occupies inside a JSON string token.
 * @param character - One code point as iterated from a string.
 * @returns Its encoded size, escapes included.
 */
function jsonStringPayloadBytes(character: string): number {
	const codeUnit = character.charCodeAt(0);
	if (character === '"' || character === "\\") {
		return 2;
	}
	if (codeUnit <= 0x1f) {
		return JSON_SHORT_ESCAPES.has(codeUnit) ? 2 : 6;
	}
	return isLoneSurrogate(character) ? 6 : byteLength(character);
}

/**
 * UTF-8 bytes occupied by JSON.stringify(value), including its quotes.
 * @param value - The text.
 * @returns The encoded size of the JSON string token.
 */
function jsonStringByteLength(value: string): number {
	let bytes = 2;
	for (const character of value) {
		bytes += jsonStringPayloadBytes(character);
	}
	return bytes;
}

/**
 * Whether a string's JSON token fits a byte budget, stopping the count as soon
 * as the budget is exceeded.
 * @param value - The text.
 * @param maximum - The byte budget for the JSON string token.
 * @returns True when the whole token fits.
 */
function fitsJsonUtf8(value: string, maximum: number): boolean {
	let encodedBytes = 2;
	for (const character of value) {
		encodedBytes += jsonStringPayloadBytes(character);
		if (encodedBytes > maximum) {
			return false;
		}
	}
	return true;
}

/**
 * Clips a string by its JSON-encoded UTF-8 size without splitting a code point.
 * @param value - The text.
 * @param maximum - The byte budget for the JSON string token.
 * @returns The text, clipped with an ellipsis when it did not fit.
 */
function clipJsonUtf8(value: string, maximum: number): BoundedValue<string> {
	if (fitsJsonUtf8(value, maximum)) {
		return { value, truncated: false };
	}
	const suffix = SEMANTIC_CONTEXT_ELLIPSIS;
	const suffixBytes = jsonStringByteLength(suffix);
	if (suffixBytes > maximum) {
		return { value: "", truncated: true };
	}
	const kept: string[] = [];
	let encodedBytes = suffixBytes;
	for (const character of value) {
		const characterBytes = jsonStringPayloadBytes(character);
		if (encodedBytes + characterBytes > maximum) {
			break;
		}
		kept.push(character);
		encodedBytes += characterBytes;
	}
	return { value: `${kept.join("")}${suffix}`, truncated: true };
}

/**
 * Validates a feed identity: it is never clipped, only refused, because a
 * clipped feed id would silently name a different feed.
 * @param value - The candidate feed id.
 * @param field - The dotted path used in errors.
 * @returns The feed id unchanged.
 */
function feedIdValue(value: unknown, field: string): string {
	const result = textValue(value, field, SEMANTIC_CONTEXT_LIMITS.cursorBytes);
	if (result.truncated) {
		fail(field, `must not exceed ${SEMANTIC_CONTEXT_LIMITS.cursorBytes} UTF-8 bytes`);
	}
	if (jsonStringByteLength(result.value) > SEMANTIC_CONTEXT_LIMITS.feedIdJsonBytes) {
		fail(
			field,
			`must not exceed ${SEMANTIC_CONTEXT_LIMITS.feedIdJsonBytes} UTF-8 bytes when JSON encoded`,
		);
	}
	return result.value;
}

/**
 * Clips a string to a raw UTF-8 byte budget without splitting a code point.
 * @param value - The text.
 * @param maximum - The byte budget.
 * @returns The text, clipped with an ellipsis when it did not fit.
 */
function clipUtf8(value: string, maximum: number): BoundedValue<string> {
	if (byteLength(value) <= maximum) {
		return { value, truncated: false };
	}
	if (byteLength(SEMANTIC_CONTEXT_ELLIPSIS) > maximum) {
		return { value: "", truncated: true };
	}
	let kept = "";
	for (const character of Array.from(value)) {
		const candidate = `${kept}${character}${SEMANTIC_CONTEXT_ELLIPSIS}`;
		if (byteLength(candidate) > maximum) {
			break;
		}
		kept += character;
	}
	return {
		value: `${kept}${SEMANTIC_CONTEXT_ELLIPSIS}`,
		truncated: true,
	};
}

/**
 * Validates a text field and clips it to its byte budget.
 * @param value - The candidate text.
 * @param field - The dotted path used in errors.
 * @param maximum - The byte budget.
 * @param required - Whether blank text is refused.
 * @returns The clipped text.
 */
function textValue(
	value: unknown,
	field: string,
	maximum: number,
	required = true,
): BoundedValue<string> {
	if (typeof value !== "string") {
		fail(field, "must be a string");
	}
	if (value.includes("\0")) {
		fail(field, "must not contain NUL");
	}
	if (required && value.trim() === "") {
		fail(field, "must not be empty");
	}
	return clipUtf8(value, maximum);
}

/**
 * Validates an optional text field, where null means absent.
 * @param value - The candidate text or null.
 * @param field - The dotted path used in errors.
 * @param maximum - The byte budget.
 * @returns The clipped text, or null.
 */
function nullableTextValue(
	value: unknown,
	field: string,
	maximum: number,
): BoundedValue<string | null> {
	if (value === null) {
		return { value: null, truncated: false };
	}
	const result = textValue(value, field, maximum);
	return { value: result.value, truncated: result.truncated };
}

/**
 * Refuses an identity that is empty, contains NUL, or exceeds the identity
 * byte budget; identities are never clipped because a clipped identity names
 * something else.
 * @param value - The candidate identity.
 * @param field - The dotted path used in errors.
 */
function assertIdentityText(value: string, field: string): void {
	if (value.length === 0) {
		fail(field, "must be a non-empty identity");
	}
	if (value.includes("\0")) {
		fail(field, "must not contain NUL");
	}
	if (byteLength(value) > SEMANTIC_CONTEXT_LIMITS.identityBytes) {
		fail(field, `must not exceed ${SEMANTIC_CONTEXT_LIMITS.identityBytes} UTF-8 bytes`);
	}
}

/**
 * Validates an optional identity, where null and undefined both mean absent.
 * @param value - The candidate identity.
 * @param field - The dotted path used in errors.
 * @returns The identity unchanged, or null.
 */
function identityValue<Identity extends string>(
	value: Identity | null | undefined,
	field: string,
): Identity | null {
	if (value === null || value === undefined) {
		return null;
	}
	if (typeof value !== "string") {
		fail(field, "must be a non-empty identity");
	}
	assertIdentityText(value, field);
	return value;
}

/**
 * Validates an optional non-negative safe integer.
 * @param value - The candidate number or null.
 * @param field - The dotted path used in errors.
 * @returns The number, or null.
 */
function numberValue(value: unknown, field: string): number | null {
	if (value === null) {
		return null;
	}
	if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
		fail(field, "must be a non-negative safe integer or null");
	}
	return value;
}

interface NormalizedCursor {
	readonly value: SemanticCursor | null;
	readonly staleReason: string | null;
}

/**
 * Whether a value is a non-array object whose keys can be inspected.
 * @param value - Any value.
 * @returns True for a plain object or class instance.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Refuses a cursor object carrying anything but `feedId` and `sequence`.
 * @param value - The cursor object.
 */
function exactCursorKeys(value: Record<string, unknown>): void {
	const keys = Reflect.ownKeys(value);
	if (
		keys.length !== 2 ||
		keys.some((key) => typeof key !== "string") ||
		keys.map(String).toSorted().join(" ") !== "feedId sequence"
	) {
		fail("cursor", "must contain only feedId and sequence");
	}
}

/**
 * Validates a cursor and notes when it belongs to another feed.
 * @param value - The candidate cursor or null.
 * @param currentFeedId - The feed this publisher serves.
 * @returns The frozen cursor and a stale reason when the feed differs.
 */
function normalizeCursor(value: unknown, currentFeedId: string): NormalizedCursor {
	if (value === null) {
		return { value: null, staleReason: null };
	}
	if (!isRecord(value)) {
		fail("cursor", "must be null or {feedId, sequence}");
	}
	exactCursorKeys(value);
	const feedId = feedIdValue(value["feedId"], "cursor.feedId");
	const sequence = numberValue(value["sequence"], "cursor.sequence");
	if (sequence === null) {
		fail("cursor.sequence", "must be a number");
	}
	const staleReason =
		feedId === currentFeedId
			? null
			: `cursor belongs to feed "${feedId}"; current feed is "${currentFeedId}"`;
	return {
		value: deepFreeze({ feedId, sequence }),
		staleReason,
	};
}

/**
 * De-duplicates and sorts strings by code unit so output is deterministic.
 * @param values - The strings.
 * @returns The unique strings in sorted order.
 */
function uniqueSorted(values: readonly string[]): string[] {
	return [...new Set(values)].toSorted((left, right) => (left < right ? -1 : left > right ? 1 : 0));
}

/**
 * Whether a value is an object whose own values can be walked.
 * @param value - Any value.
 * @returns True for any non-null object, arrays included.
 */
function isObjectLike(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

/**
 * Freezes a value and everything reachable from it.
 * @param value - The value to freeze.
 * @returns The same value, now frozen.
 */
function deepFreeze<Value>(value: Value): Value {
	if (!isObjectLike(value) || Object.isFrozen(value)) {
		return value;
	}
	Object.freeze(value);
	for (const child of Object.values(value)) {
		deepFreeze(child);
	}
	return value;
}

/**
 * Validates a claim holder.
 * @param value - The candidate holder.
 * @returns The holder.
 */
function claimHolder(value: unknown): SemanticClaimHolder {
	if (value === "human" || value === "agent" || value === "none") {
		return value;
	}
	return fail("claim.holder", "must be human, agent, or none");
}

/**
 * Validates a thread-link state.
 * @param value - The candidate state.
 * @returns The state.
 */
function threadLinkState(value: unknown): "executable" | "inspect_only" | "unbound" {
	if (value === "executable" || value === "inspect_only" || value === "unbound") {
		return value;
	}
	return fail("threadLink.state", "must be executable, inspect_only, or unbound");
}

/**
 * Validates a boolean field.
 * @param value - The candidate boolean.
 * @param field - The dotted path used in errors.
 * @returns The boolean.
 */
function booleanValue(value: unknown, field: string): boolean {
	if (typeof value !== "boolean") {
		fail(field, "must be a boolean");
	}
	return value;
}

/**
 * Validates a list of reason strings, clipping each, de-duplicating, and
 * capping the count.
 * @param values - The candidate reasons.
 * @param field - The dotted path used in errors.
 * @returns The bounded reasons.
 */
function boundedReasons(values: readonly unknown[], field: string): BoundedValue<string[]> {
	const entries = values.map((value, index) =>
		textValue(value, `${field}[${index}]`, SEMANTIC_CONTEXT_LIMITS.ambiguityBytes),
	);
	const unique = uniqueSorted(entries.map((entry) => entry.value));
	return {
		value: unique.slice(0, SEMANTIC_CONTEXT_LIMITS.ambiguityEntries),
		truncated:
			entries.some((entry) => entry.truncated) ||
			unique.length > SEMANTIC_CONTEXT_LIMITS.ambiguityEntries,
	};
}

/**
 * Validates the board block.
 * @param board - The board input.
 * @returns The frozen board with its version.
 */
function normalizeBoard(
	board: SemanticContextInput["board"],
): BoundedValue<NormalizedContext["board"]> {
	const key = textValue(board.key, "board.key", SEMANTIC_CONTEXT_LIMITS.boardKeyBytes);
	const note = textValue(board.note, "board.note", SEMANTIC_CONTEXT_LIMITS.noteBytes);
	const version = numberValue(board.version, "board.version");
	return {
		value: deepFreeze({ key: key.value, note: note.value, version }),
		truncated: key.truncated || note.truncated,
	};
}

/**
 * Validates the pane block.
 * @param pane - The pane input.
 * @returns The frozen pane.
 */
function normalizePane(pane: SemanticContextInput["pane"]): BoundedValue<SemanticPane> {
	const paneId = textValue(pane.paneId, "pane.paneId", SEMANTIC_CONTEXT_LIMITS.paneIdBytes);
	const focused = booleanValue(pane.focused, "pane.focused");
	return {
		value: deepFreeze({ paneId: paneId.value, focused }),
		truncated: paneId.truncated,
	};
}

/**
 * Validates the claim block; an absent claim means nobody holds the board.
 * @param claim - The claim input, if supplied.
 * @returns The frozen claim.
 */
function normalizeClaim(claim: SemanticContextInput["claim"]): BoundedValue<SemanticClaim> {
	const input = claim ?? { holder: "none" as const, doing: null };
	const holder = claimHolder(input.holder);
	const doing = nullableTextValue(input.doing, "claim.doing", SEMANTIC_CONTEXT_LIMITS.doingBytes);
	return {
		value: deepFreeze({ holder, doing: doing.value }),
		truncated: doing.truncated,
	};
}

/**
 * Validates the child block.
 * @param child - The child input, if supplied.
 * @returns The frozen child identities.
 */
function normalizeChild(child: SemanticContextInput["child"]): SemanticChild {
	return deepFreeze({
		id: identityValue(child?.id, "child.id"),
		epoch: identityValue(child?.epoch, "child.epoch"),
	});
}

/**
 * Validates the thread-link block; an absent link is unbound.
 * @param threadLink - The thread-link input, if supplied.
 * @returns The frozen thread link.
 */
function normalizeThreadLink(
	threadLink: SemanticContextInput["threadLink"],
): BoundedValue<SemanticThreadLink> {
	const reason = nullableTextValue(
		threadLink?.reason ?? null,
		"threadLink.reason",
		SEMANTIC_CONTEXT_LIMITS.reasonBytes,
	);
	return {
		value: deepFreeze({
			state: threadLinkState(threadLink?.state ?? "unbound"),
			reason: reason.value,
		}),
		truncated: reason.truncated,
	};
}

/**
 * Validates the workhorse block.
 * @param workhorse - The workhorse input, if supplied.
 * @returns The frozen workhorse identities.
 */
function normalizeWorkhorse(workhorse: SemanticContextInput["workhorse"]): SemanticWorkhorse {
	return deepFreeze({
		threadId: identityValue(workhorse?.threadId, "workhorse.threadId"),
		turnId: identityValue(workhorse?.turnId, "workhorse.turnId"),
	});
}

/**
 * Validates the coordinator block.
 * @param coordinator - The coordinator input, if supplied.
 * @returns The frozen coordinator identities.
 */
function normalizeCoordinator(
	coordinator: SemanticContextInput["coordinator"],
): SemanticCoordinator {
	return deepFreeze({
		threadId: identityValue(coordinator?.threadId, "coordinator.threadId"),
		realtimeSessionId: identityValue(
			coordinator?.realtimeSessionId,
			"coordinator.realtimeSessionId",
		),
	});
}

/**
 * Validates the selection: each id is clipped and the list de-duplicated, but
 * the count is only reported as over budget here; the brief applies the cap.
 * @param selection - The selection input.
 * @returns The frozen unique ids.
 */
function normalizeSelection(
	selection: SemanticContextInput["selection"],
): BoundedValue<readonly string[]> {
	if (!Array.isArray(selection)) {
		fail("selection", "must be an array");
	}
	const entries = selection.map((id, index) =>
		textValue(id, `selection[${index}]`, SEMANTIC_CONTEXT_LIMITS.selectionIdBytes),
	);
	const unique = uniqueSorted(entries.map((entry) => entry.value));
	return {
		value: deepFreeze(unique),
		truncated:
			entries.some((entry) => entry.truncated) ||
			unique.length > SEMANTIC_CONTEXT_LIMITS.selectionEntries,
	};
}

/**
 * Validates the ambiguity list and appends the cursor's stale reason to it.
 * @param ambiguity - The ambiguity input, if supplied.
 * @param cursorReasons - The reason the cursor is stale, if it is.
 * @returns The frozen bounded reasons.
 */
function normalizeAmbiguity(
	ambiguity: SemanticContextInput["ambiguity"],
	cursorReasons: readonly string[],
): BoundedValue<readonly string[]> {
	const input = ambiguity ?? [];
	if (!Array.isArray(input)) {
		fail("ambiguity", "must be an array");
	}
	const bounded = boundedReasons([...input, ...cursorReasons], "ambiguity");
	return { value: deepFreeze(bounded.value), truncated: bounded.truncated };
}

/**
 * Collects every reason the context is stale: the source's own flag and
 * reasons, the cursor's feed mismatch, and reasons the caller adds.
 * @param input - The whole context input.
 * @param cursorReasons - The reason the cursor is stale, if it is.
 * @param additionalStaleReasons - Reasons supplied by the publisher.
 * @returns The frozen bounded reasons.
 */
function normalizeStaleReasons(
	input: SemanticContextInput,
	cursorReasons: readonly string[],
	additionalStaleReasons: readonly string[],
): BoundedValue<readonly string[]> {
	const staleReasons = input.staleReasons ?? [];
	if (!Array.isArray(staleReasons)) {
		fail("staleReasons", "must be an array");
	}
	const bounded = boundedReasons(
		[
			...(input.stale === true ? ["source marked this context stale"] : []),
			...staleReasons,
			...cursorReasons,
			...additionalStaleReasons,
		],
		"staleReasons",
	);
	return { value: deepFreeze(bounded.value), truncated: bounded.truncated };
}

/**
 * Validates and bounds a complete context input, field by field in a fixed
 * order so the first invalid field is the one reported.
 * @param input - The scalar context from the composition adapter.
 * @param currentFeedId - The feed this publisher serves.
 * @param cursorOverride - A cursor that replaces the input's, when the feed supplies one.
 * @param additionalStaleReasons - Reasons supplied by the publisher.
 * @returns The frozen normalized context.
 */
function normalizeContext(
	input: SemanticContextInput,
	currentFeedId: string,
	cursorOverride?: SemanticCursorInput | null,
	additionalStaleReasons: readonly string[] = [],
): NormalizedContext {
	const repository = textValue(
		input.repository,
		"repository",
		SEMANTIC_CONTEXT_LIMITS.repositoryBytes,
	);
	const board = normalizeBoard(input.board);
	const pane = normalizePane(input.pane);
	const description = textValue(
		input.description,
		"description",
		SEMANTIC_CONTEXT_LIMITS.descriptionBytes,
		false,
	);
	const claim = normalizeClaim(input.claim);
	const doing = nullableTextValue(input.doing, "doing", SEMANTIC_CONTEXT_LIMITS.doingBytes);
	const child = normalizeChild(input.child);
	const threadLink = normalizeThreadLink(input.threadLink);
	const workhorse = normalizeWorkhorse(input.workhorse);
	const coordinator = normalizeCoordinator(input.coordinator);
	const cursor = normalizeCursor(
		cursorOverride === undefined ? input.cursor : cursorOverride,
		currentFeedId,
	);
	const cursorReasons = cursor.staleReason === null ? [] : [cursor.staleReason];
	const selection = normalizeSelection(input.selection);
	const ambiguity = normalizeAmbiguity(input.ambiguity, cursorReasons);
	const staleReasons = normalizeStaleReasons(input, cursorReasons, additionalStaleReasons);
	const parts: readonly BoundedValue<unknown>[] = [
		repository,
		board,
		pane,
		threadLink,
		description,
		claim,
		doing,
		selection,
		ambiguity,
		staleReasons,
	];
	return {
		repository: repository.value,
		child,
		threadLink: threadLink.value,
		workhorse,
		coordinator,
		board: board.value,
		pane: pane.value,
		selection: selection.value,
		claim: claim.value,
		doing: doing.value,
		cursor: cursor.value,
		description: description.value,
		ambiguity: ambiguity.value,
		staleReasons: staleReasons.value,
		truncated: parts.some((part) => part.truncated),
	};
}

export {
	type BoundedValue,
	type NormalizedContext,
	SemanticContextInputError,
	fail,
	byteLength,
	jsonStringByteLength,
	clipJsonUtf8,
	feedIdValue,
	clipUtf8,
	textValue,
	nullableTextValue,
	identityValue,
	numberValue,
	uniqueSorted,
	deepFreeze,
	boundedReasons,
	normalizeContext,
};
