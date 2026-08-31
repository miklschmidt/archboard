import { z } from "zod";

import type { CodexBrowserModel } from "../../../shared/codex-browser-model/index.js";
import type {
	BrowserGatewayApplyResult,
	BrowserGatewayClientState,
	BrowserGatewayMessage,
	BrowserSnapshotDelta,
} from "./contract.js";
import { assertBrowserDeltaBounded, assertBrowserSnapshotBounded } from "./projection.js";

const DELTA_KEYS = new Set([
	"readiness",
	"account",
	"login",
	"threadLink",
	"timeline",
	"queue",
	"settings",
	"approvals",
	"dynamicApprovals",
	"semantic",
	"coordinator",
	"voice",
	"lease",
	"operation",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertSequence(value: unknown): asserts value is number {
	if (!Number.isSafeInteger(value) || (value as number) < 0)
		throw new Error("browser gateway sequence must be a non-negative safe integer");
}

function parseDeltaValue(model: CodexBrowserModel, key: string, value: unknown): unknown {
	switch (key) {
		case "readiness":
			return model.BrowserReadinessSchema.parse(value);
		case "account":
			return model.BrowserAccountSchema.parse(value);
		case "login":
			return model.BrowserLoginSchema.parse(value);
		case "threadLink":
			return model.BrowserThreadLinkSchema.parse(value);
		case "timeline":
			return model.BrowserTimelineSchema.nullable().parse(value);
		case "queue":
			return model.BrowserQueueSchema.parse(value);
		case "settings":
			return z.array(model.BrowserSettingsSchema).parse(value);
		case "approvals":
			return z.array(model.BrowserApprovalSchema).parse(value);
		case "dynamicApprovals":
			return z.array(model.BrowserDynamicApprovalSchema).parse(value);
		case "semantic":
			return model.BrowserSemanticDeliverySchema.nullable().parse(value);
		case "coordinator":
			return model.BrowserCoordinatorSchema.parse(value);
		case "voice":
			return model.BrowserVoiceSchema.parse(value);
		case "lease":
			return model.BrowserCommandLeaseSchema.nullable().parse(value);
		case "operation":
			return model.BrowserOperationOutcomeSchema.nullable().parse(value);
		default:
			throw new Error(`browser gateway delta key ${JSON.stringify(key)} is invalid`);
	}
}

function parseMessage(model: CodexBrowserModel, value: unknown): BrowserGatewayMessage {
	if (!isRecord(value) || (value.kind !== "snapshot" && value.kind !== "delta"))
		throw new Error("browser gateway message kind is invalid");
	assertSequence(value.sequence);
	if (value.kind === "snapshot") {
		const snapshot = model.BrowserSnapshotSchema.parse(value.snapshot);
		assertBrowserSnapshotBounded(snapshot);
		return Object.freeze({ kind: "snapshot", sequence: value.sequence, snapshot });
	}
	if (!isRecord(value.delta)) throw new Error("browser gateway delta must be an object");
	const parsedDelta: Record<string, unknown> = {};
	for (const key of Object.keys(value.delta)) {
		if (!DELTA_KEYS.has(key))
			throw new Error(`browser gateway delta key ${JSON.stringify(key)} is invalid`);
		if (value.delta[key] === undefined)
			throw new Error("browser gateway delta cannot contain undefined");
		parsedDelta[key] = parseDeltaValue(model, key, value.delta[key]);
	}
	const delta = parsedDelta as BrowserSnapshotDelta;
	assertBrowserDeltaBounded(delta);
	return Object.freeze({ kind: "delta", sequence: value.sequence, delta });
}

function sameWireValue(left: unknown, right: unknown): boolean {
	return JSON.stringify(left) === JSON.stringify(right);
}

function unchanged(state: BrowserGatewayClientState, status: "duplicate" | "stale" | "gap") {
	return { status, state } satisfies BrowserGatewayApplyResult;
}

export function applyBrowserGatewayMessage(
	model: CodexBrowserModel,
	value: unknown,
	state: BrowserGatewayClientState | null,
): BrowserGatewayApplyResult {
	const message = parseMessage(model, value);
	if (message.kind === "snapshot") {
		if (state === null)
			return {
				status: "applied",
				state: { sequence: message.sequence, snapshot: message.snapshot },
			};
		if (message.sequence < state.sequence) return unchanged(state, "stale");
		if (message.sequence === state.sequence)
			return unchanged(
				state,
				sameWireValue(message.snapshot, state.snapshot) ? "duplicate" : "stale",
			);
		return {
			status: "applied",
			state: { sequence: message.sequence, snapshot: message.snapshot },
		};
	}

	if (state === null) return { status: "gap", state: null };
	if (message.sequence > state.sequence + 1) return unchanged(state, "gap");
	const candidate = model.BrowserSnapshotSchema.parse({
		...state.snapshot,
		...message.delta,
	});
	assertBrowserSnapshotBounded(candidate);
	if (message.sequence < state.sequence) return unchanged(state, "stale");
	if (message.sequence === state.sequence) {
		return unchanged(state, sameWireValue(candidate, state.snapshot) ? "duplicate" : "stale");
	}
	return { status: "applied", state: { sequence: message.sequence, snapshot: candidate } };
}

export function browserGatewayMessageSchema(model: CodexBrowserModel) {
	return {
		parse: (value: unknown): BrowserGatewayMessage => parseMessage(model, value),
	};
}
