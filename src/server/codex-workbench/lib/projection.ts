import type { CodexBrowserModel } from "../../../shared/codex-browser-model/index.js";
import type {
	BrowserSnapshot,
	BrowserCommandLease,
	BrowserOperationOutcome,
} from "../../../shared/codex-browser-model/index.js";
import type { ThreadLinkBindingSnapshot } from "../../../runtime/codex-thread-link/index.js";
import type {
	BrowserProjection,
	BrowserProjectionContext,
	BrowserSnapshotDelta,
} from "./contract.js";

export const BROWSER_SNAPSHOT_MAX_BYTES = 1_048_576;
export const BROWSER_DELTA_MAX_BYTES = 262_144;

type BrowserSnapshotKey = Exclude<keyof BrowserSnapshot, "kind" | "version">;
const SNAPSHOT_KEYS: readonly BrowserSnapshotKey[] = [
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
];

function deepFreeze<T>(value: T): T {
	if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
		Object.freeze(value);
		for (const child of Object.values(value)) deepFreeze(child);
	}
	return value;
}

function wireBytes(value: unknown): number {
	const encoded = JSON.stringify(value);
	if (encoded === undefined) throw new Error("browser gateway produced a non-JSON value");
	return new TextEncoder().encode(encoded).byteLength;
}

function assertBounded(value: unknown, limit: number, kind: string): void {
	if (wireBytes(value) > limit) throw new Error(`the browser ${kind} exceeds its wire-size bound`);
}

function parseProjection(
	model: CodexBrowserModel,
	projection: BrowserProjection,
	binding: ThreadLinkBindingSnapshot,
	lease: BrowserCommandLease | null,
	operation: BrowserOperationOutcome | null,
): BrowserSnapshot {
	const parsed = model.BrowserSnapshotSchema.parse({
		kind: "snapshot",
		version: 1,
		readiness: projection.readiness,
		account: projection.account,
		login: projection.login,
		threadLink: binding.link,
		timeline: projection.timeline,
		queue: projection.queue,
		settings: projection.settings,
		approvals: projection.approvals,
		dynamicApprovals: projection.dynamicApprovals,
		semantic: projection.semantic,
		coordinator: projection.coordinator,
		voice: projection.voice,
		lease,
		operation,
	});
	assertBounded(parsed, BROWSER_SNAPSHOT_MAX_BYTES, "snapshot");
	return deepFreeze(parsed);
}

export function readBrowserSnapshot(options: {
	readonly model: CodexBrowserModel;
	readonly projection: BrowserProjection;
	readonly binding: ThreadLinkBindingSnapshot;
	readonly lease: BrowserCommandLease | null;
	readonly operation: BrowserOperationOutcome | null;
}): BrowserSnapshot {
	return parseProjection(
		options.model,
		options.projection,
		options.binding,
		options.lease,
		options.operation,
	);
}

export function readBrowserProjection(options: {
	readonly model: CodexBrowserModel;
	readonly projection: BrowserProjection;
	readonly context: BrowserProjectionContext;
	readonly operation: BrowserOperationOutcome | null;
}): BrowserSnapshot {
	return readBrowserSnapshot({
		model: options.model,
		projection: options.projection,
		binding: options.context.binding,
		lease: options.context.lease,
		operation: options.operation,
	});
}

function sameWireValue(left: unknown, right: unknown): boolean {
	return JSON.stringify(left) === JSON.stringify(right);
}

export function diffBrowserSnapshots(
	previous: BrowserSnapshot,
	next: BrowserSnapshot,
): BrowserSnapshotDelta | null {
	const delta: Record<string, unknown> = {};
	for (const key of SNAPSHOT_KEYS) {
		if (!sameWireValue(previous[key], next[key])) delta[key] = next[key];
	}
	if (Object.keys(delta).length === 0) return null;
	assertBounded(delta, BROWSER_DELTA_MAX_BYTES, "delta");
	return deepFreeze(delta) as BrowserSnapshotDelta;
}

export function assertBrowserSnapshotBounded(snapshot: BrowserSnapshot): void {
	assertBounded(snapshot, BROWSER_SNAPSHOT_MAX_BYTES, "snapshot");
}

export function assertBrowserDeltaBounded(delta: BrowserSnapshotDelta): void {
	assertBounded(delta, BROWSER_DELTA_MAX_BYTES, "delta");
}
