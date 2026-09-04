import type { BrowserSnapshot, DeliveryOutcome } from "../../codex-browser-model/index.js";
import type { BrowserCommandId } from "../../codex-workbench-identity/index.js";
import type { AnswerSdp } from "../../codex-realtime-host/index.js";

/**
 * The wire envelope the Codex workbench gateway speaks: the request actions it
 * accepts, the refusal codes it can answer with, and the snapshot, delta, and
 * result shapes it publishes. It lives in `shared` because both ends of that
 * wire are real modules — the server gateway that produces it and the browser
 * transport that consumes it — and `ui` may never import `server`. Copying it
 * into the browser instead is how the two ends drift without a compiler error.
 */
export const BROWSER_GATEWAY_ACTIONS = [
	"connect",
	"snapshot",
	"claimLease",
	"renewLease",
	"releaseLease",
	"mediaReady",
	"accountRead",
	"command",
	"subscribe",
	"close",
] as const;

export type BrowserGatewayAction = (typeof BROWSER_GATEWAY_ACTIONS)[number];

export const BROWSER_GATEWAY_ERROR_CODES = [
	"disposed",
	"invalid_input",
	"invalid_command",
	"invalid_projection",
	"not_ready",
	"thread_capability_required",
	"link_required",
	"link_changed",
	"lease_required",
	"lease_expired",
	"lease_released",
	"lease_transferred",
	"child_disconnected",
	"approval_not_pending",
	"dynamic_approval_not_pending",
	"unsupported_command",
	"command_failed",
	"outcome_unknown",
] as const;

export type BrowserGatewayErrorCode = (typeof BROWSER_GATEWAY_ERROR_CODES)[number];

export interface BrowserGatewaySnapshotMessage {
	readonly kind: "snapshot";
	readonly sequence: number;
	readonly snapshot: BrowserSnapshot;
}

export type BrowserSnapshotDelta = Partial<Omit<BrowserSnapshot, "kind" | "version">>;

export interface BrowserGatewayDeltaMessage {
	readonly kind: "delta";
	readonly sequence: number;
	readonly delta: BrowserSnapshotDelta;
}

export type BrowserGatewayMessage = BrowserGatewaySnapshotMessage | BrowserGatewayDeltaMessage;

/** Every snapshot field a delta may carry, in snapshot order. */
export const BROWSER_SNAPSHOT_DELTA_KEYS = [
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
] as const satisfies readonly (keyof BrowserSnapshotDelta)[];

export type BrowserSnapshotDeltaKey = (typeof BROWSER_SNAPSHOT_DELTA_KEYS)[number];

/**
 * Adding a field to BrowserSnapshot without listing it above is a type error
 * here, so a new field cannot compile on both sides while the browser rejects
 * every delta that carries it.
 */
type Unlisted = Exclude<keyof BrowserSnapshotDelta, BrowserSnapshotDeltaKey>;
type AssertNoUnlistedKey<Key extends never> = Key;
export type BrowserSnapshotDeltaKeysAreExhaustive = AssertNoUnlistedKey<Unlisted>;

export interface BrowserGatewayCommandResult {
	readonly kind: "command_result";
	readonly commandId: BrowserCommandId | null;
	readonly outcome: DeliveryOutcome;
	readonly code: BrowserGatewayErrorCode | null;
	readonly message: string | null;
	readonly snapshot: BrowserSnapshot;
	readonly realtimeAnswer?: AnswerSdp;
	readonly realtimeSessionHandle?: string;
}

export interface BrowserGatewayAccountReadResult {
	readonly kind: "account_read";
	readonly outcome: DeliveryOutcome;
	readonly code: BrowserGatewayErrorCode | null;
	readonly message: string | null;
	readonly snapshot: BrowserSnapshot;
}
