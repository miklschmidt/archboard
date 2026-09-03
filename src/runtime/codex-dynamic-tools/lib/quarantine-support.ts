import {
	logicalToolCallKey,
	type JsonRpcRequestId,
} from "../../../shared/codex-workbench-identity/index.js";
import {
	ARCHBOARD_APP_MANIFEST_SHA256,
	ARCHBOARD_APP_NAMESPACE,
	type DynamicToolCallResponse,
} from "../../codex-thread-tools/index.js";
import {
	CODEX_TRANSPORT_PENDING_REVERSE_REQUEST_CAP,
	type DynamicServerRequest,
} from "../../codex-transport/index.js";
import {
	type CodexDynamicToolsOptions,
	type DynamicEpochTeardownProof,
	type DynamicFailClosedShutdownOwner,
	type DynamicMutationQuarantineIdentity,
	type DynamicMutationQuarantineOwner,
	type DynamicMutationQuarantineState,
	type DynamicMutationToolName,
} from "./contract.js";
import type { DynamicOperationSettlement } from "./effects.js";
import { validateDynamicCall } from "./classification.js";
import { invalidDynamicResponse } from "./response.js";

export const DYNAMIC_QUARANTINE_WIRE_CAP = CODEX_TRANSPORT_PENDING_REVERSE_REQUEST_CAP;

export interface Deferred<Value> {
	readonly promise: Promise<Value>;
	readonly resolve: (value: Value) => void;
	readonly reject: (error: unknown) => void;
}

export interface OrdinaryWireOwners {
	readonly get: (key: string) => Promise<DynamicToolCallResponse> | undefined;
	readonly own: (
		key: string,
		run: () => Promise<DynamicToolCallResponse>,
	) => Promise<DynamicToolCallResponse>;
	readonly size: () => number;
	readonly clear: () => void;
}

export interface DispatchCandidate {
	readonly response: DynamicToolCallResponse;
	readonly settlement: DynamicOperationSettlement | null;
}

export interface QuarantineWireOwner {
	readonly key: string;
	readonly requestId: JsonRpcRequestId;
	readonly request: DynamicServerRequest;
	readonly response: DynamicToolCallResponse;
	readonly kind: "logical" | "blocked";
	readonly logicalKey: string | null;
	readonly deferred: Deferred<DynamicToolCallResponse>;
	writeAttempted: boolean;
	settled: boolean;
}

export interface QuarantineLogicalOwner {
	readonly key: string;
	readonly identity: DynamicMutationQuarantineIdentity;
	readonly response: DynamicToolCallResponse;
	readonly settlement: DynamicOperationSettlement;
	readonly wireKeys: Set<string>;
}

export interface EpochQuarantineOwner {
	readonly key: string;
	readonly child: DynamicMutationQuarantineIdentity["child"];
	readonly epoch: DynamicMutationQuarantineIdentity["epoch"];
	readonly logicalOwners: Map<string, QuarantineLogicalOwner>;
	readonly wireOwners: Map<string, QuarantineWireOwner>;
	state: DynamicMutationQuarantineState;
	overflowed: boolean;
	active: boolean;
	shutdownStarted: boolean;
	overflowDeferred: Deferred<DynamicToolCallResponse> | null;
}

export function deferred<Value>(): Deferred<Value> {
	let resolve!: (value: Value) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<Value>((accept, decline) => {
		resolve = accept;
		reject = decline;
	});
	return Object.freeze({ promise, resolve, reject });
}

export function createOrdinaryWireOwners(): OrdinaryWireOwners {
	const owners = new Map<string, Deferred<DynamicToolCallResponse>>();
	const own = (
		key: string,
		run: () => Promise<DynamicToolCallResponse>,
	): Promise<DynamicToolCallResponse> => {
		const existing = owners.get(key);
		if (existing !== undefined) return existing.promise;
		const owner = deferred<DynamicToolCallResponse>();
		owners.set(key, owner);
		let operation: Promise<DynamicToolCallResponse>;
		try {
			operation = run();
		} catch (error) {
			operation = Promise.reject(error);
		}
		void operation.then(
			(response) => {
				if (owners.get(key) === owner) owners.delete(key);
				owner.resolve(response);
				return undefined;
			},
			(error) => {
				if (owners.get(key) === owner) owners.delete(key);
				owner.reject(error);
				return undefined;
			},
		);
		return owner.promise;
	};
	return Object.freeze({
		get: (key: string) => owners.get(key)?.promise,
		own,
		size: () => owners.size,
		clear: () => owners.clear(),
	});
}

function isMutationTool(value: string): value is DynamicMutationToolName {
	return value === "create_thread" || value === "fork_thread" || value === "send_message_to_thread";
}

export function mutationIdentity(
	request: DynamicServerRequest,
	options: CodexDynamicToolsOptions,
): DynamicMutationQuarantineIdentity | null {
	let tool: DynamicMutationToolName;
	try {
		const call = validateDynamicCall(request, options);
		if (!isMutationTool(call.name)) return null;
		tool = call.name;
	} catch {
		return null;
	}
	return Object.freeze({
		child: request.logicalCall.child,
		epoch: request.logicalCall.epoch,
		threadId: request.logicalCall.threadId,
		turnId: request.logicalCall.turnId,
		callId: request.logicalCall.callId,
		namespace: ARCHBOARD_APP_NAMESPACE.name,
		tool,
		manifestHash: ARCHBOARD_APP_MANIFEST_SHA256,
	});
}

export function logicalKey(identity: DynamicMutationQuarantineIdentity): string {
	return logicalToolCallKey(identity);
}

export function epochKey(child: unknown, epoch: unknown): string | null {
	return typeof child === "string" && typeof epoch === "string"
		? JSON.stringify([child, epoch])
		: null;
}

export function requestEpochKey(value: unknown): string | null {
	if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
	if (!("child" in value) || !("epoch" in value)) return null;
	return epochKey(value.child, value.epoch);
}

export function requestWireKey(value: unknown): string | null {
	if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
	if (!("child" in value) || !("epoch" in value) || !("requestId" in value)) return null;
	if (
		typeof value.child !== "string" ||
		typeof value.epoch !== "string" ||
		typeof value.requestId !== "string"
	)
		return null;
	return JSON.stringify([value.child, value.epoch, value.requestId]);
}

export function blockedDynamicResponse(): DynamicToolCallResponse {
	return invalidDynamicResponse(
		"invalid_call",
		"The child epoch cannot accept another dynamic call while mutation recovery is pending.",
	);
}

function exactKeys(value: object, keys: readonly string[]): boolean {
	return Object.keys(value).toSorted().join(",") === [...keys].toSorted().join(",");
}

export function exactPoisonOwner(
	value: DynamicMutationQuarantineOwner,
	identity: DynamicMutationQuarantineIdentity,
): DynamicMutationQuarantineOwner {
	if (
		value === null ||
		typeof value !== "object" ||
		value.child !== identity.child ||
		value.epoch !== identity.epoch ||
		typeof value.poisoned !== "boolean" ||
		!value.poisoned ||
		!(value.childExit instanceof Promise) ||
		!exactKeys(value, ["child", "childExit", "epoch", "poisoned"])
	)
		throw new Error("The lifecycle port did not return the exact poisoned epoch owner.");
	return value;
}

export function exactShutdownOwner(
	value: DynamicFailClosedShutdownOwner,
	epoch: EpochQuarantineOwner,
): DynamicFailClosedShutdownOwner {
	if (
		value === null ||
		typeof value !== "object" ||
		value.child !== epoch.child ||
		value.epoch !== epoch.epoch ||
		typeof value.shutdownInitiated !== "boolean" ||
		!value.shutdownInitiated ||
		!(value.teardown instanceof Promise) ||
		!exactKeys(value, ["child", "epoch", "shutdownInitiated", "teardown"])
	)
		throw new Error("The lifecycle port did not return the exact fail-closed shutdown owner.");
	return value;
}

export function exactTeardownProof(
	value: DynamicEpochTeardownProof,
	epoch: EpochQuarantineOwner,
): boolean {
	return (
		value !== null &&
		typeof value === "object" &&
		value.child === epoch.child &&
		value.epoch === epoch.epoch &&
		typeof value.sessionClosed === "boolean" &&
		value.sessionClosed &&
		typeof value.transportClosed === "boolean" &&
		value.transportClosed &&
		exactKeys(value, ["child", "epoch", "sessionClosed", "transportClosed"])
	);
}
