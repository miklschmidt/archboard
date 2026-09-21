import { SEMANTIC_CONTEXT_LIMITS } from "@/runtime/codex-semantic-context/lib/limits";
import type {
	SemanticArchitecture,
	SemanticContextInput,
	SemanticClaimHolder,
	SemanticChild,
	SemanticClaim,
	SemanticCoordinator,
	SemanticBoard,
	SemanticCursor,
	SemanticCursorInput,
	SemanticPane,
	SemanticUserChange,
	SemanticThreadLink,
	SemanticWorkhorse,
} from "@/runtime/codex-semantic-context/lib/types";
import {
	byteLength,
	clipJsonUtf8,
	clipUtf8,
	fail,
	feedIdValue,
	identityValue,
	jsonStringByteLength,
	nullableTextValue,
	numberValue,
	SemanticContextInputError,
	textValue,
	type BoundedValue,
} from "@/runtime/codex-semantic-context/lib/bounded-text";
import { normalizeArchitecture } from "@/runtime/codex-semantic-context/lib/normalize-architecture";

interface NormalizedContext {
	readonly repository: string;
	readonly child: SemanticChild;
	readonly threadLink: SemanticThreadLink;
	readonly workhorse: SemanticWorkhorse;
	readonly coordinator: SemanticCoordinator;
	readonly board: SemanticBoard & { readonly version: number | null };
	readonly pane: SemanticPane;
	readonly architecture: SemanticArchitecture;
	readonly claim: SemanticClaim;
	readonly doing: string | null;
	readonly cursor: SemanticCursor | null;
	readonly description: string;
	readonly ambiguity: readonly string[];
	readonly staleReasons: readonly string[];
	readonly truncated: boolean;
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
		keys.map(String).toSorted().join(" ") !== "feedId sequence"
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
	const name = textValue(board.name, "board.name", SEMANTIC_CONTEXT_LIMITS.boardKeyBytes);
	const file = textValue(board.file, "board.file", SEMANTIC_CONTEXT_LIMITS.fileBytes);
	const version = numberValue(board.version, "board.version");
	return {
		value: deepFreeze({ key: key.value, name: name.value, file: file.value, version }),
		truncated: key.truncated || name.truncated || file.truncated,
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

const USER_CHANGES: readonly SemanticUserChange[] = [
	"board",
	"variant",
	"view",
	"selection",
	"focus",
];

/**
 * What the user changed by hand, in one order and once each. Anything that is not a reviewed
 * change is refused rather than dropped: a caller that invents one is claiming the user did
 * something, and that claim is what decides whether the voice model is told.
 * @param stated - What the caller said, or nothing.
 * @returns The changes; empty when nothing was the user's.
 * @throws {TypeError} When a value is not one of the reviewed changes.
 */
function userChanges(
	stated: readonly SemanticUserChange[] | undefined,
): readonly SemanticUserChange[] {
	const said = stated ?? [];
	const unknown = said.find((change) => !USER_CHANGES.includes(change));
	if (unknown !== undefined) {
		throw new TypeError(`pane.userChanged names "${unknown}", which is not a change a user makes.`);
	}
	return USER_CHANGES.filter((change) => said.includes(change));
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
	const architecture = normalizeArchitecture(input.architecture);
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
		architecture,
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
		architecture: architecture.value,
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
	userChanges,
	nullableTextValue,
	identityValue,
	numberValue,
	uniqueSorted,
	deepFreeze,
	boundedReasons,
	normalizeContext,
};
