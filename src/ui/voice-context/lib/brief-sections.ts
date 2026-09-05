// Section parsers for the canonical semantic brief. Each accepts unknown JSON
// and yields the frozen section or null; the brief parser composes them.

import type { VoiceContextCanonicalBrief } from "@/ui/voice-context/contract";

type JsonRecord = Readonly<Record<string, unknown>>;

/**
 * Whether a value is a plain JSON object.
 * @param value The value.
 * @returns True for a non-null, non-array object.
 */
function isRecord(value: unknown): value is JsonRecord {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Whether a record has exactly the given keys.
 * @param value The record.
 * @param keys The expected keys.
 * @returns True when the key sets match.
 */
function exactKeys(value: JsonRecord, keys: readonly string[]): boolean {
	const actual = Object.keys(value);
	return actual.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

/**
 * Whether a value is a string.
 * @param value The value.
 * @returns True for a string.
 */
function isString(value: unknown): value is string {
	return typeof value === "string";
}

/**
 * Whether a value is a string or null.
 * @param value The value.
 * @returns True for a string or null.
 */
function isNullableString(value: unknown): value is string | null {
	return value === null || isString(value);
}

/**
 * Whether a value is a finite number.
 * @param value The value.
 * @returns True for a finite number.
 */
function isFinite(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

/**
 * Whether a value is a non-negative safe integer.
 * @param value The value.
 * @returns True for such an integer.
 */
function isIndex(value: unknown): value is number {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/**
 * Whether a value is a version: a non-negative safe integer or null.
 * @param value The value.
 * @returns True for a version.
 */
function isVersion(value: unknown): value is number | null {
	return value === null || isIndex(value);
}

/**
 * Whether a value is an array of strings.
 * @param value The value.
 * @returns True for a string array.
 */
function isStrings(value: unknown): value is readonly string[] {
	return Array.isArray(value) && value.every(isString);
}

/**
 * Whether a value is one of the given literals.
 * @param value The value.
 * @param values The literals.
 * @returns True when the value is one of them.
 */
function isOneOf<const Values extends readonly string[]>(
	value: unknown,
	values: Values,
): value is Values[number] {
	return isString(value) && values.includes(value);
}

/**
 * A record with exactly the given keys, or null.
 * @param value The value.
 * @param keys The expected keys.
 * @returns The record, or null.
 */
function shaped(value: unknown, keys: readonly string[]): JsonRecord | null {
	return isRecord(value) && exactKeys(value, keys) ? value : null;
}

/**
 * Parses the workhorse section.
 * @param value The section.
 * @returns The section, or null.
 */
function parseWorkhorse(value: unknown): VoiceContextCanonicalBrief["workhorse"] | null {
	const parsed = shaped(value, ["threadId", "turnId"]);
	if (
		parsed === null ||
		!isNullableString(parsed["threadId"]) ||
		!isNullableString(parsed["turnId"])
	) {
		return null;
	}
	return Object.freeze({ threadId: parsed["threadId"], turnId: parsed["turnId"] });
}

/**
 * Parses the coordinator section.
 * @param value The section.
 * @returns The section, or null.
 */
function parseCoordinator(value: unknown): VoiceContextCanonicalBrief["coordinator"] | null {
	const parsed = shaped(value, ["threadId", "realtimeSessionId"]);
	if (
		parsed === null ||
		!isNullableString(parsed["threadId"]) ||
		!isNullableString(parsed["realtimeSessionId"])
	) {
		return null;
	}
	return Object.freeze({
		threadId: parsed["threadId"],
		realtimeSessionId: parsed["realtimeSessionId"],
	});
}

/**
 * Parses the board section.
 * @param value The section.
 * @returns The section, or null.
 */
function parseBoard(value: unknown): VoiceContextCanonicalBrief["board"] | null {
	const parsed = shaped(value, ["key", "note", "version"]);
	if (
		parsed === null ||
		!isString(parsed["key"]) ||
		!isString(parsed["note"]) ||
		!isVersion(parsed["version"])
	) {
		return null;
	}
	return Object.freeze({ key: parsed["key"], note: parsed["note"], version: parsed["version"] });
}

/**
 * Parses the pane section.
 * @param value The section.
 * @returns The section, or null.
 */
function parsePane(value: unknown): VoiceContextCanonicalBrief["pane"] | null {
	const parsed = shaped(value, ["paneId", "focused"]);
	if (parsed === null || !isString(parsed["paneId"]) || typeof parsed["focused"] !== "boolean") {
		return null;
	}
	return Object.freeze({ paneId: parsed["paneId"], focused: parsed["focused"] });
}

/**
 * Parses the claim section.
 * @param value The section.
 * @returns The section, or null.
 */
function parseClaim(value: unknown): VoiceContextCanonicalBrief["claim"] | null {
	const parsed = shaped(value, ["holder", "doing"]);
	if (
		parsed === null ||
		!isOneOf(parsed["holder"], ["human", "agent", "none"] as const) ||
		!isNullableString(parsed["doing"])
	) {
		return null;
	}
	return Object.freeze({ holder: parsed["holder"], doing: parsed["doing"] });
}

/**
 * Parses the cursor section; null is a valid cursor, undefined a refusal.
 * @param value The section.
 * @returns The cursor, null, or undefined when malformed.
 */
function parseCursor(value: unknown): VoiceContextCanonicalBrief["cursor"] | undefined {
	if (value === null) {
		return null;
	}
	const parsed = shaped(value, ["feedId", "sequence"]);
	if (parsed === null || !isString(parsed["feedId"]) || !isIndex(parsed["sequence"])) {
		return undefined;
	}
	return Object.freeze({ feedId: parsed["feedId"], sequence: parsed["sequence"] });
}

/**
 * Parses the freshness section.
 * @param value The section.
 * @returns The section, or null.
 */
function parseFreshness(value: unknown): VoiceContextCanonicalBrief["freshness"] | null {
	const parsed = shaped(value, ["capturedAtMs", "freshUntilMs", "state"]);
	if (
		parsed === null ||
		!isFinite(parsed["capturedAtMs"]) ||
		!isFinite(parsed["freshUntilMs"]) ||
		parsed["freshUntilMs"] < parsed["capturedAtMs"] ||
		!isOneOf(parsed["state"], ["fresh", "stale"] as const)
	) {
		return null;
	}
	return Object.freeze({
		capturedAtMs: parsed["capturedAtMs"],
		freshUntilMs: parsed["freshUntilMs"],
		state: parsed["state"],
	});
}

/**
 * Parses the staleness section.
 * @param value The section.
 * @returns The section, or null.
 */
function parseStaleness(value: unknown): VoiceContextCanonicalBrief["staleness"] | null {
	const parsed = shaped(value, ["state", "reasons"]);
	if (
		parsed === null ||
		!isOneOf(parsed["state"], ["current", "stale"] as const) ||
		!isStrings(parsed["reasons"])
	) {
		return null;
	}
	return Object.freeze({ state: parsed["state"], reasons: Object.freeze([...parsed["reasons"]]) });
}

/**
 * Parses the child section.
 * @param value The section.
 * @returns The section, or null.
 */
function parseChild(value: unknown): VoiceContextCanonicalBrief["child"] | null {
	const parsed = shaped(value, ["id", "epoch"]);
	if (parsed === null || !isNullableString(parsed["id"]) || !isNullableString(parsed["epoch"])) {
		return null;
	}
	return Object.freeze({ id: parsed["id"], epoch: parsed["epoch"] });
}

/**
 * Parses the thread link section.
 * @param value The section.
 * @returns The section, or null.
 */
function parseThreadLink(value: unknown): VoiceContextCanonicalBrief["threadLink"] | null {
	const parsed = shaped(value, ["state", "reason"]);
	if (
		parsed === null ||
		!isOneOf(parsed["state"], ["executable", "inspect_only", "unbound"] as const) ||
		!isNullableString(parsed["reason"])
	) {
		return null;
	}
	return Object.freeze({ state: parsed["state"], reason: parsed["reason"] });
}

export {
	exactKeys,
	isNullableString,
	isRecord,
	isString,
	isStrings,
	isVersion,
	parseBoard,
	parseChild,
	parseClaim,
	parseCoordinator,
	parseCursor,
	parseFreshness,
	parsePane,
	parseStaleness,
	parseThreadLink,
	parseWorkhorse,
	type JsonRecord,
};
