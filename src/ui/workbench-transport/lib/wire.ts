// The wire parsers for snapshots, deltas and leases: every DTO the browser
// reads is validated by the shared browser model under the inert wire
// identity context, then frozen in place. Nothing here decides workbench
// state; it only refuses what the contract does not describe.

import { z } from "zod";

import {
	createCodexBrowserModel,
	type BrowserCommand,
	type BrowserCommandLease,
	type BrowserSnapshot,
} from "@/shared/codex-browser-model";
import type {
	BrowserWorkbenchDeltaMessage,
	BrowserWorkbenchGatewayMessage,
	BrowserWorkbenchSnapshotDelta,
	BrowserWorkbenchSnapshotMessage,
} from "@/ui/workbench-transport/contract";
import {
	BrowserWorkbenchWireError,
	wireIdentityContext,
} from "@/ui/workbench-transport/lib/wire-identity";

const WIRE_VALUE_MAX_BYTES = 16_384;

type DynamicApprovalResponseCommand = Extract<
	BrowserCommand,
	{ readonly command: "dynamicApprovalRespond" }
>;

/**
 * Refuse a wire value.
 * @param message Why.
 */
function fail(message: string): never {
	throw new BrowserWorkbenchWireError(message);
}

/**
 * Whether a value is a plain object.
 * @param value The value.
 * @returns True for a non-array object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * A wire value that must be a plain object.
 * @param value The value.
 * @param message The refusal when it is not.
 * @returns The object.
 */
function record(value: unknown, message: string): Record<string, unknown> {
	if (!isRecord(value)) {
		fail(message);
	}
	return value;
}

/**
 * A wire value that must be a non-empty string.
 * @param value The value.
 * @param message The refusal when it is not.
 * @returns The string.
 */
function nonEmptyString(value: unknown, message: string): string {
	if (typeof value !== "string" || value.length === 0) {
		fail(message);
	}
	return value;
}

/**
 * Whether a string is trimmed, NUL-free and within the wire bound.
 * @param value The string.
 * @returns True when it is a valid wire string.
 */
function isBoundedWireText(value: string): boolean {
	return (
		!value.includes("\0") &&
		value.trim() === value &&
		new TextEncoder().encode(value).byteLength <= WIRE_VALUE_MAX_BYTES
	);
}

/**
 * A wire value that must be a bounded, trimmed, NUL-free string.
 * @param value The value.
 * @param message The refusal when it is not.
 * @param allowEmpty Whether the empty string is accepted.
 * @returns The string.
 */
function boundedString(value: unknown, message: string, allowEmpty = false): string {
	if (typeof value !== "string" || (!allowEmpty && value.length === 0)) {
		fail(message);
	}
	if (!isBoundedWireText(value)) {
		fail(`${message} (the value is not a valid wire string)`);
	}
	return value;
}

/**
 * A wire value that must be a non-negative safe integer.
 * @param value The value.
 * @param message The refusal when it is not.
 * @returns The integer.
 */
function nonNegativeSafeInteger(value: unknown, message: string): number {
	if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
		fail(message);
	}
	return value;
}

/**
 * Refuse an object whose keys are not exactly the ones named.
 * @param value The object.
 * @param keys The keys it must have.
 * @param message The refusal.
 */
function assertExactKeys(
	value: Record<string, unknown>,
	keys: readonly string[],
	message: string,
): void {
	const actual = Object.keys(value);
	if (actual.length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) {
		fail(message);
	}
}

/**
 * Refuse an object carrying a key outside the ones named.
 * @param value The object.
 * @param keys The keys it may have.
 * @param message The refusal.
 */
function assertOptionalKeys(
	value: Record<string, unknown>,
	keys: readonly string[],
	message: string,
): void {
	for (const key of Object.keys(value)) {
		if (!keys.includes(key)) {
			fail(message);
		}
	}
}

/**
 * Freeze a parsed wire value and everything it holds, in place. The model
 * returns fresh objects, so nothing the caller holds is frozen with it.
 * @param value The parsed value.
 * @returns The same value, frozen.
 */
function freezeDeep<Value>(value: Value): Value {
	if (Array.isArray(value)) {
		for (const entry of value) {
			freezeDeep(entry);
		}
	} else if (isRecord(value)) {
		for (const entry of Object.values(value)) {
			freezeDeep(entry);
		}
	}
	return Object.freeze(value);
}

/**
 * Run a model parser, naming the DTO in any refusal.
 * @param description What was being parsed.
 * @param parse The parser.
 * @returns The parsed, frozen value.
 */
function parseModel<Value>(description: string, parse: () => Value): Value {
	try {
		return freezeDeep(parse());
	} catch (error) {
		if (error instanceof BrowserWorkbenchWireError) {
			throw error;
		}
		const detail = error instanceof Error ? error.message : "the value failed validation";
		return fail(`${description}: ${detail}`);
	}
}

const browserModel = createCodexBrowserModel(wireIdentityContext);

/**
 * Parse a full snapshot.
 * @param value The wire value.
 * @returns The frozen snapshot.
 */
function parseBrowserSnapshot(value: unknown): BrowserSnapshot {
	return parseModel("The Codex workbench snapshot is malformed", () =>
		browserModel.BrowserSnapshotSchema.parse(value),
	);
}

/**
 * Parse a nullable lease.
 * @param value The wire value.
 * @returns The frozen lease, or null.
 */
function parseBrowserCommandLease(value: unknown): BrowserCommandLease | null {
	if (value === null) {
		return null;
	}
	return parseModel("The Codex workbench lease is malformed", () =>
		browserModel.BrowserCommandLeaseSchema.parse(value),
	);
}

/**
 * Parse a lease that must be present.
 * @param value The wire value.
 * @returns The frozen lease.
 */
function parseRequiredBrowserCommandLease(value: unknown): BrowserCommandLease {
	const parsed = parseBrowserCommandLease(value);
	if (parsed === null) {
		fail("The Codex workbench returned no command lease.");
	}
	return parsed;
}

/**
 * Parse a dynamic approval response against the approval it answers.
 * @param pending The pending approval.
 * @param value The response command.
 * @returns The validated, frozen command.
 */
function parseBrowserDynamicApprovalResponse(
	pending: unknown,
	value: unknown,
): DynamicApprovalResponseCommand {
	return parseModel(
		"The Codex workbench dynamic approval response is malformed or no longer pending",
		() => browserModel.parseDynamicApprovalResponse(pending, value),
	);
}

type DeltaKey = keyof Required<BrowserWorkbenchSnapshotDelta>;
type DeltaParsers = {
	readonly [Key in DeltaKey]: (value: unknown) => Required<BrowserWorkbenchSnapshotDelta>[Key];
};
type MutableDelta = { -readonly [Key in DeltaKey]?: Required<BrowserWorkbenchSnapshotDelta>[Key] };

/**
 * A parser over one schema.
 * @param schema The schema.
 * @returns The parser.
 */
function parserFor<Value>(schema: z.ZodType<Value>): (value: unknown) => Value {
	return (value) => schema.parse(value);
}

/**
 * One parser per snapshot field a delta may carry. Keyed by the delta type
 * itself, so adding a field to the shared snapshot is a compile error here
 * rather than a delta the browser silently rejects at runtime.
 */
const DELTA_PARSERS: DeltaParsers = {
	readiness: parserFor(browserModel.BrowserReadinessSchema),
	account: parserFor(browserModel.BrowserAccountSchema),
	login: parserFor(browserModel.BrowserLoginSchema),
	threadLink: parserFor(browserModel.BrowserThreadLinkSchema),
	threadCandidates: parserFor(browserModel.BrowserThreadCandidatesSchema),
	timeline: parserFor(browserModel.BrowserTimelineSchema.nullable()),
	queue: parserFor(browserModel.BrowserQueueSchema),
	settings: parserFor(z.array(browserModel.BrowserSettingsSchema)),
	approvals: parserFor(z.array(browserModel.BrowserApprovalSchema)),
	dynamicApprovals: parserFor(z.array(browserModel.BrowserDynamicApprovalSchema)),
	semantic: parserFor(browserModel.BrowserSemanticDeliverySchema.nullable()),
	coordinator: parserFor(browserModel.BrowserCoordinatorSchema),
	voice: parserFor(browserModel.BrowserVoiceSchema),
	spokenApproval: parserFor(browserModel.BrowserSpokenApprovalSchema),
	voiceContext: parserFor(browserModel.BrowserVoiceContextSchema.nullable()),
	lease: parserFor(browserModel.BrowserCommandLeaseSchema.nullable()),
	operation: parserFor(browserModel.BrowserOperationOutcomeSchema.nullable()),
};

/**
 * Whether a wire key names a delta field.
 * @param key The key.
 * @returns True for a known field.
 */
function isDeltaKey(key: string): key is DeltaKey {
	return Object.hasOwn(DELTA_PARSERS, key);
}

/**
 * Parse one delta field into the delta being built.
 * @param delta The delta under construction.
 * @param key The field.
 * @param value The wire value.
 * @param parser The field's parser.
 */
function assignDeltaField<Key extends DeltaKey>(
	delta: MutableDelta,
	key: Key,
	value: unknown,
	parser: DeltaParsers[Key],
): void {
	delta[key] = parseModel(`The Codex workbench ${key} delta is malformed`, () => parser(value));
}

/**
 * Parse the fields of a delta.
 * @param value The wire delta.
 * @returns The typed delta.
 */
function parseDelta(value: unknown): BrowserWorkbenchSnapshotDelta {
	const deltaRecord = record(value, "The Codex workbench delta is malformed.");
	const delta: MutableDelta = {};
	for (const key of Object.keys(deltaRecord)) {
		if (!isDeltaKey(key)) {
			fail(`The Codex workbench delta key ${JSON.stringify(key)} is invalid.`);
		}
		if (deltaRecord[key] === undefined) {
			fail("The Codex workbench delta cannot contain undefined.");
		}
		assignDeltaField(delta, key, deltaRecord[key], DELTA_PARSERS[key]);
	}
	return delta;
}

/**
 * Parse a snapshot message body.
 * @param parsed The message record.
 * @param sequence Its sequence.
 * @returns The frozen message.
 */
function parseSnapshotMessage(
	parsed: Record<string, unknown>,
	sequence: number,
): BrowserWorkbenchSnapshotMessage {
	assertExactKeys(
		parsed,
		["kind", "sequence", "snapshot"],
		"The Codex workbench snapshot message fields are invalid.",
	);
	const message: BrowserWorkbenchSnapshotMessage = {
		kind: "snapshot",
		sequence,
		snapshot: parseBrowserSnapshot(parsed["snapshot"]),
	};
	return freezeDeep(message);
}

/**
 * Parse a delta message body.
 * @param parsed The message record.
 * @param sequence Its sequence.
 * @returns The frozen message.
 */
function parseDeltaMessage(
	parsed: Record<string, unknown>,
	sequence: number,
): BrowserWorkbenchDeltaMessage {
	assertExactKeys(
		parsed,
		["kind", "sequence", "delta"],
		"The Codex workbench delta message fields are invalid.",
	);
	const message: BrowserWorkbenchDeltaMessage = {
		kind: "delta",
		sequence,
		delta: parseDelta(parsed["delta"]),
	};
	return freezeDeep(message);
}

/**
 * Parse a snapshot or delta message.
 * @param value The wire value.
 * @returns The frozen message.
 */
function parseBrowserGatewayMessage(value: unknown): BrowserWorkbenchGatewayMessage {
	const parsed = record(value, "The Codex workbench event message is malformed.");
	const kind = parsed["kind"];
	if (kind !== "snapshot" && kind !== "delta") {
		fail("The Codex workbench event message kind is invalid.");
	}
	const sequence = nonNegativeSafeInteger(
		parsed["sequence"],
		"The Codex workbench sequence is invalid.",
	);
	return kind === "snapshot"
		? parseSnapshotMessage(parsed, sequence)
		: parseDeltaMessage(parsed, sequence);
}

/**
 * Parse a message that must be a full snapshot.
 * @param value The wire value.
 * @returns The frozen snapshot message.
 */
function parseBrowserSnapshotMessage(value: unknown): BrowserWorkbenchSnapshotMessage {
	const parsed = parseBrowserGatewayMessage(value);
	if (parsed.kind !== "snapshot") {
		fail("The Codex workbench response is not a snapshot.");
	}
	return parsed;
}

export {
	WIRE_VALUE_MAX_BYTES,
	assertExactKeys,
	assertOptionalKeys,
	boundedString,
	fail,
	freezeDeep,
	isRecord,
	nonEmptyString,
	parseBrowserCommandLease,
	parseBrowserDynamicApprovalResponse,
	parseBrowserGatewayMessage,
	parseBrowserSnapshot,
	parseBrowserSnapshotMessage,
	parseRequiredBrowserCommandLease,
	record,
};
