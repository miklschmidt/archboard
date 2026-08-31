import { SEMANTIC_CONTEXT_ELLIPSIS, SEMANTIC_CONTEXT_LIMITS } from "./limits.js";
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
} from "./types.js";

export interface BoundedValue<Value> {
	readonly value: Value;
	readonly truncated: boolean;
}

export interface NormalizedContext {
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

export class SemanticContextInputError extends Error {
	readonly field: string;

	constructor(field: string, message: string) {
		super(`${field}: ${message}`);
		this.name = "SemanticContextInputError";
		this.field = field;
	}
}

export function fail(field: string, message: string): never {
	throw new SemanticContextInputError(field, message);
}

export function byteLength(value: string): number {
	return new TextEncoder().encode(value).byteLength;
}

function jsonStringPayloadBytes(character: string): number {
	const codeUnit = character.charCodeAt(0);
	if (character === '"' || character === "\\") return 2;
	if (codeUnit <= 0x1f) {
		return codeUnit === 0x08 ||
			codeUnit === 0x09 ||
			codeUnit === 0x0a ||
			codeUnit === 0x0c ||
			codeUnit === 0x0d
			? 2
			: 6;
	}
	if (character.length === 1 && codeUnit >= 0xd800 && codeUnit <= 0xdfff) return 6;
	return byteLength(character);
}

/** UTF-8 bytes occupied by JSON.stringify(value), including its quotes. */
export function jsonStringByteLength(value: string): number {
	let bytes = 2;
	for (const character of value) bytes += jsonStringPayloadBytes(character);
	return bytes;
}

/** Clips a string by its JSON-encoded UTF-8 size without splitting a code point. */
export function clipJsonUtf8(value: string, maximum: number): BoundedValue<string> {
	let encodedBytes = 2;
	for (const character of value) {
		encodedBytes += jsonStringPayloadBytes(character);
		if (encodedBytes > maximum) break;
	}
	if (encodedBytes <= maximum) return { value, truncated: false };

	const suffix = SEMANTIC_CONTEXT_ELLIPSIS;
	const suffixBytes = jsonStringByteLength(suffix);
	if (suffixBytes > maximum) return { value: "", truncated: true };

	const kept: string[] = [];
	encodedBytes = suffixBytes;
	for (const character of value) {
		const characterBytes = jsonStringPayloadBytes(character);
		if (encodedBytes + characterBytes > maximum) break;
		kept.push(character);
		encodedBytes += characterBytes;
	}
	return { value: `${kept.join("")}${suffix}`, truncated: true };
}

export function clipUtf8(value: string, maximum: number): BoundedValue<string> {
	if (byteLength(value) <= maximum) return { value, truncated: false };
	if (byteLength(SEMANTIC_CONTEXT_ELLIPSIS) > maximum) {
		return { value: "", truncated: true };
	}
	let kept = "";
	for (const character of Array.from(value)) {
		const candidate = `${kept}${character}${SEMANTIC_CONTEXT_ELLIPSIS}`;
		if (byteLength(candidate) > maximum) break;
		kept += character;
	}
	return {
		value: `${kept}${SEMANTIC_CONTEXT_ELLIPSIS}`,
		truncated: true,
	};
}

export function textValue(
	value: unknown,
	field: string,
	maximum: number,
	required = true,
): BoundedValue<string> {
	if (typeof value !== "string") fail(field, "must be a string");
	if (value.includes("\0")) fail(field, "must not contain NUL");
	if (required && value.trim() === "") fail(field, "must not be empty");
	return clipUtf8(value, maximum);
}

export function nullableTextValue(
	value: unknown,
	field: string,
	maximum: number,
): BoundedValue<string | null> {
	if (value === null) return { value: null, truncated: false };
	const result = textValue(value, field, maximum);
	return { value: result.value, truncated: result.truncated };
}

export function identityValue<Identity extends string>(
	value: Identity | null | undefined,
	field: string,
): Identity | null {
	if (value === null || value === undefined) return null;
	if (typeof value !== "string" || value.length === 0) {
		fail(field, "must be a non-empty identity");
	}
	if (value.includes("\0")) fail(field, "must not contain NUL");
	if (byteLength(value) > SEMANTIC_CONTEXT_LIMITS.identityBytes) {
		fail(field, `must not exceed ${SEMANTIC_CONTEXT_LIMITS.identityBytes} UTF-8 bytes`);
	}
	return value;
}

export function numberValue(value: unknown, field: string): number | null {
	if (value === null) return null;
	if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
		fail(field, "must be a non-negative safe integer or null");
	}
	return value;
}

interface NormalizedCursor {
	readonly value: SemanticCursor | null;
	readonly staleReason: string | null;
}

function exactCursorKeys(value: Record<string, unknown>): void {
	const keys = Reflect.ownKeys(value);
	if (
		keys.length !== 2 ||
		keys.some((key) => typeof key !== "string") ||
		keys.map(String).toSorted().join("\u0000") !== "feedId\u0000sequence"
	) {
		fail("cursor", "must contain only feedId and sequence");
	}
}

function normalizeCursor(value: unknown, currentFeedId: string): NormalizedCursor {
	if (value === null) return { value: null, staleReason: null };
	if (typeof value !== "object" || Array.isArray(value)) {
		fail("cursor", "must be null or {feedId, sequence}");
	}
	const record = value as Record<string, unknown>;
	exactCursorKeys(record);
	const feedId = textValue(record.feedId, "cursor.feedId", SEMANTIC_CONTEXT_LIMITS.cursorBytes);
	if (feedId.truncated) {
		fail("cursor.feedId", `must not exceed ${SEMANTIC_CONTEXT_LIMITS.cursorBytes} UTF-8 bytes`);
	}
	const sequence = numberValue(record.sequence, "cursor.sequence");
	if (sequence === null) fail("cursor.sequence", "must be a number");
	const staleReason =
		feedId.value === currentFeedId
			? null
			: `cursor belongs to feed "${feedId.value}"; current feed is "${currentFeedId}"`;
	return {
		value: deepFreeze({ feedId: feedId.value, sequence }),
		staleReason,
	};
}

export function uniqueSorted(values: readonly string[]): string[] {
	return [...new Set(values)].toSorted((left, right) => (left < right ? -1 : left > right ? 1 : 0));
}

export function deepFreeze<Value>(value: Value): Value {
	if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
		return value;
	}
	Object.freeze(value);
	for (const child of Object.values(value as Record<string, unknown>)) {
		deepFreeze(child);
	}
	return value;
}

function claimHolder(value: unknown): SemanticClaimHolder {
	if (value === "human" || value === "agent" || value === "none") return value;
	fail("claim.holder", "must be human, agent, or none");
}

function threadLinkState(value: unknown): "executable" | "inspect_only" | "unbound" {
	if (value === "executable" || value === "inspect_only" || value === "unbound") {
		return value;
	}
	fail("threadLink.state", "must be executable, inspect_only, or unbound");
}

function booleanValue(value: unknown, field: string): boolean {
	if (typeof value !== "boolean") fail(field, "must be a boolean");
	return value;
}

export function boundedReasons(values: readonly unknown[], field: string): BoundedValue<string[]> {
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

export function normalizeContext(
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
	const boardKey = textValue(input.board?.key, "board.key", SEMANTIC_CONTEXT_LIMITS.boardKeyBytes);
	const note = textValue(input.board?.note, "board.note", SEMANTIC_CONTEXT_LIMITS.noteBytes);
	const version = numberValue(input.board?.version, "board.version");
	const paneId = textValue(input.pane?.paneId, "pane.paneId", SEMANTIC_CONTEXT_LIMITS.paneIdBytes);
	const focused = booleanValue(input.pane?.focused, "pane.focused");
	const description = textValue(
		input.description,
		"description",
		SEMANTIC_CONTEXT_LIMITS.descriptionBytes,
		false,
	);
	const claimInput = input.claim ?? { holder: "none" as const, doing: null };
	const holder = claimHolder(claimInput.holder);
	const claimDoing = nullableTextValue(
		claimInput.doing,
		"claim.doing",
		SEMANTIC_CONTEXT_LIMITS.doingBytes,
	);
	const doing = nullableTextValue(input.doing, "doing", SEMANTIC_CONTEXT_LIMITS.doingBytes);
	const child = deepFreeze({
		id: identityValue(input.child?.id, "child.id"),
		epoch: identityValue(input.child?.epoch, "child.epoch"),
	});
	const threadLinkReason = nullableTextValue(
		input.threadLink?.reason ?? null,
		"threadLink.reason",
		SEMANTIC_CONTEXT_LIMITS.reasonBytes,
	);
	const threadLink = deepFreeze({
		state: threadLinkState(input.threadLink?.state ?? "unbound"),
		reason: threadLinkReason.value,
	});
	const workhorse = deepFreeze({
		threadId: identityValue(input.workhorse?.threadId, "workhorse.threadId"),
		turnId: identityValue(input.workhorse?.turnId, "workhorse.turnId"),
	});
	const coordinator = deepFreeze({
		threadId: identityValue(input.coordinator?.threadId, "coordinator.threadId"),
		realtimeSessionId: identityValue(
			input.coordinator?.realtimeSessionId,
			"coordinator.realtimeSessionId",
		),
	});
	const cursor = normalizeCursor(
		cursorOverride === undefined ? input.cursor : cursorOverride,
		currentFeedId,
	);
	const cursorReasons = cursor.staleReason === null ? [] : [cursor.staleReason];
	if (!Array.isArray(input.selection)) fail("selection", "must be an array");
	const selectionEntries = input.selection.map((id, index) =>
		textValue(id, `selection[${index}]`, SEMANTIC_CONTEXT_LIMITS.selectionIdBytes),
	);
	const selection = uniqueSorted(selectionEntries.map((entry) => entry.value));
	const ambiguityInput = input.ambiguity ?? [];
	if (!Array.isArray(ambiguityInput)) fail("ambiguity", "must be an array");
	const ambiguity = boundedReasons([...ambiguityInput, ...cursorReasons], "ambiguity");
	if (!Array.isArray(input.staleReasons ?? [])) {
		fail("staleReasons", "must be an array");
	}
	const staleReasons = boundedReasons(
		[
			...(input.stale === true ? ["source marked this context stale"] : []),
			...(input.staleReasons ?? []),
			...cursorReasons,
			...additionalStaleReasons,
		],
		"staleReasons",
	);
	const truncated =
		repository.truncated ||
		boardKey.truncated ||
		note.truncated ||
		paneId.truncated ||
		threadLinkReason.truncated ||
		description.truncated ||
		claimDoing.truncated ||
		doing.truncated ||
		selectionEntries.some((entry) => entry.truncated) ||
		selection.length > SEMANTIC_CONTEXT_LIMITS.selectionEntries ||
		ambiguity.truncated ||
		staleReasons.truncated;
	return {
		repository: repository.value,
		child,
		threadLink,
		workhorse,
		coordinator,
		board: deepFreeze({ key: boardKey.value, note: note.value, version }),
		pane: deepFreeze({ paneId: paneId.value, focused }),
		selection: deepFreeze(selection),
		claim: deepFreeze({
			holder,
			doing: claimDoing.value,
		}),
		doing: doing.value,
		cursor: cursor.value,
		description: description.value,
		ambiguity: deepFreeze(ambiguity.value),
		staleReasons: deepFreeze(staleReasons.value),
		truncated,
	};
}
