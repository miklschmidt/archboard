import type { VoiceContextCanonicalBrief } from "../contract.js";

type JsonRecord = Readonly<Record<string, unknown>>;

const TOP_LEVEL_KEYS = Object.freeze([
	"source",
	"feedId",
	"repository",
	"workhorse",
	"coordinator",
	"board",
	"pane",
	"version",
	"selection",
	"claim",
	"doing",
	"cursor",
	"description",
	"freshness",
	"truncated",
	"ambiguity",
	"staleness",
	"child",
	"threadLink",
]);

function record(value: unknown): JsonRecord | null {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as JsonRecord)
		: null;
}

function exactKeys(value: JsonRecord, keys: readonly string[]): boolean {
	const actual = Object.keys(value);
	return actual.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function string(value: unknown): value is string {
	return typeof value === "string";
}

function nullableString(value: unknown): value is string | null {
	return value === null || string(value);
}

function finite(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

function version(value: unknown): value is number | null {
	return value === null || (Number.isSafeInteger(value) && (value as number) >= 0);
}

function strings(value: unknown): value is readonly string[] {
	return Array.isArray(value) && value.every(string);
}

function oneOf<const Values extends readonly string[]>(
	value: unknown,
	values: Values,
): value is Values[number] {
	return string(value) && values.includes(value);
}

function pair(value: unknown, keys: readonly [string, string]): JsonRecord | null {
	const parsed = record(value);
	return parsed !== null && exactKeys(parsed, keys) ? parsed : null;
}

function parseWorkhorse(value: unknown): VoiceContextCanonicalBrief["workhorse"] | null {
	const parsed = pair(value, ["threadId", "turnId"]);
	if (parsed === null || !nullableString(parsed.threadId) || !nullableString(parsed.turnId))
		return null;
	return Object.freeze({ threadId: parsed.threadId, turnId: parsed.turnId });
}

function parseCoordinator(value: unknown): VoiceContextCanonicalBrief["coordinator"] | null {
	const parsed = pair(value, ["threadId", "realtimeSessionId"]);
	if (
		parsed === null ||
		!nullableString(parsed.threadId) ||
		!nullableString(parsed.realtimeSessionId)
	)
		return null;
	return Object.freeze({
		threadId: parsed.threadId,
		realtimeSessionId: parsed.realtimeSessionId,
	});
}

function parseBoard(value: unknown): VoiceContextCanonicalBrief["board"] | null {
	const parsed = record(value);
	if (
		parsed === null ||
		!exactKeys(parsed, ["key", "note", "version"]) ||
		!string(parsed.key) ||
		!string(parsed.note) ||
		!version(parsed.version)
	)
		return null;
	return Object.freeze({ key: parsed.key, note: parsed.note, version: parsed.version });
}

function parsePane(value: unknown): VoiceContextCanonicalBrief["pane"] | null {
	const parsed = pair(value, ["paneId", "focused"]);
	if (parsed === null || !string(parsed.paneId) || typeof parsed.focused !== "boolean") return null;
	return Object.freeze({ paneId: parsed.paneId, focused: parsed.focused });
}

function parseClaim(value: unknown): VoiceContextCanonicalBrief["claim"] | null {
	const parsed = pair(value, ["holder", "doing"]);
	if (
		parsed === null ||
		!oneOf(parsed.holder, ["human", "agent", "none"] as const) ||
		!nullableString(parsed.doing)
	)
		return null;
	return Object.freeze({ holder: parsed.holder, doing: parsed.doing });
}

function parseCursor(value: unknown): VoiceContextCanonicalBrief["cursor"] | undefined {
	if (value === null) return null;
	const parsed = pair(value, ["feedId", "sequence"]);
	if (
		parsed === null ||
		!string(parsed.feedId) ||
		!Number.isSafeInteger(parsed.sequence) ||
		(parsed.sequence as number) < 0
	)
		return undefined;
	return Object.freeze({ feedId: parsed.feedId, sequence: parsed.sequence as number });
}

function parseFreshness(value: unknown): VoiceContextCanonicalBrief["freshness"] | null {
	const parsed = record(value);
	if (
		parsed === null ||
		!exactKeys(parsed, ["capturedAtMs", "freshUntilMs", "state"]) ||
		!finite(parsed.capturedAtMs) ||
		!finite(parsed.freshUntilMs) ||
		parsed.freshUntilMs < parsed.capturedAtMs ||
		!oneOf(parsed.state, ["fresh", "stale"] as const)
	)
		return null;
	return Object.freeze({
		capturedAtMs: parsed.capturedAtMs,
		freshUntilMs: parsed.freshUntilMs,
		state: parsed.state,
	});
}

function parseStaleness(value: unknown): VoiceContextCanonicalBrief["staleness"] | null {
	const parsed = pair(value, ["state", "reasons"]);
	if (
		parsed === null ||
		!oneOf(parsed.state, ["current", "stale"] as const) ||
		!strings(parsed.reasons)
	)
		return null;
	return Object.freeze({ state: parsed.state, reasons: Object.freeze([...parsed.reasons]) });
}

function parseChild(value: unknown): VoiceContextCanonicalBrief["child"] | null {
	const parsed = pair(value, ["id", "epoch"]);
	if (parsed === null || !nullableString(parsed.id) || !nullableString(parsed.epoch)) return null;
	return Object.freeze({ id: parsed.id, epoch: parsed.epoch });
}

function parseThreadLink(value: unknown): VoiceContextCanonicalBrief["threadLink"] | null {
	const parsed = pair(value, ["state", "reason"]);
	if (
		parsed === null ||
		!oneOf(parsed.state, ["executable", "inspect_only", "unbound"] as const) ||
		!nullableString(parsed.reason)
	)
		return null;
	return Object.freeze({ state: parsed.state, reason: parsed.reason });
}

/** Parse the exact canonical semantic_context JSON without importing its runtime owner. */
export function parseCanonicalBrief(text: string): VoiceContextCanonicalBrief | null {
	let unknown: unknown;
	try {
		unknown = JSON.parse(text) as unknown;
	} catch {
		return null;
	}
	const value = record(unknown);
	if (value === null || !exactKeys(value, TOP_LEVEL_KEYS)) return null;
	const workhorse = parseWorkhorse(value.workhorse);
	const coordinator = parseCoordinator(value.coordinator);
	const board = parseBoard(value.board);
	const pane = parsePane(value.pane);
	const claim = parseClaim(value.claim);
	const cursor = parseCursor(value.cursor);
	const freshness = parseFreshness(value.freshness);
	const staleness = parseStaleness(value.staleness);
	const child = parseChild(value.child);
	const threadLink = parseThreadLink(value.threadLink);
	if (
		value.source !== "semantic_context" ||
		!string(value.feedId) ||
		!string(value.repository) ||
		workhorse === null ||
		coordinator === null ||
		board === null ||
		pane === null ||
		!version(value.version) ||
		value.version !== board.version ||
		!strings(value.selection) ||
		claim === null ||
		!nullableString(value.doing) ||
		cursor === undefined ||
		!string(value.description) ||
		freshness === null ||
		typeof value.truncated !== "boolean" ||
		!strings(value.ambiguity) ||
		staleness === null ||
		child === null ||
		threadLink === null
	)
		return null;
	return Object.freeze({
		source: "semantic_context",
		feedId: value.feedId,
		repository: value.repository,
		workhorse,
		coordinator,
		board,
		pane,
		version: value.version,
		selection: Object.freeze([...value.selection]),
		claim,
		doing: value.doing,
		cursor,
		description: value.description,
		freshness,
		truncated: value.truncated,
		ambiguity: Object.freeze([...value.ambiguity]),
		staleness,
		child,
		threadLink,
	});
}
