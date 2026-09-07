import { logicalToolCallKey, type JsonRpcRequestId } from "@/shared/codex-workbench-identity";
import {
	ARCHBOARD_APP_MANIFEST_SHA256,
	ARCHBOARD_APP_NAMESPACE,
	type DynamicToolCallResponse,
} from "@/runtime/codex-thread-tools";
import {
	CODEX_TRANSPORT_PENDING_REVERSE_REQUEST_CAP,
	type DynamicServerRequest,
} from "@/runtime/codex-transport";
import {
	type CodexDynamicToolsOptions,
	type DynamicEpochTeardownProof,
	type DynamicFailClosedShutdownOwner,
	type DynamicMutationQuarantineIdentity,
	type DynamicMutationQuarantineOwner,
	type DynamicMutationQuarantineState,
	type DynamicMutationToolName,
} from "@/runtime/codex-dynamic-tools/lib/contract";
import type { DynamicOperationSettlement } from "@/runtime/codex-dynamic-tools/lib/effects";
import { validateDynamicCall } from "@/runtime/codex-dynamic-tools/lib/request-validation";
import { invalidDynamicResponse } from "@/runtime/codex-dynamic-tools/lib/response";

const DYNAMIC_QUARANTINE_WIRE_CAP = CODEX_TRANSPORT_PENDING_REVERSE_REQUEST_CAP;

interface Deferred<Value> {
	readonly promise: Promise<Value>;
	readonly resolve: (value: Value) => void;
	readonly reject: (error: unknown) => void;
}

interface OrdinaryWireOwners {
	readonly get: (key: string) => Promise<DynamicToolCallResponse> | undefined;
	readonly own: (
		key: string,
		run: () => Promise<DynamicToolCallResponse>,
	) => Promise<DynamicToolCallResponse>;
	readonly size: () => number;
	readonly clear: () => void;
}

interface DispatchCandidate {
	readonly response: DynamicToolCallResponse;
	readonly settlement: DynamicOperationSettlement | null;
}

interface QuarantineWireOwner {
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

interface QuarantineLogicalOwner {
	readonly key: string;
	readonly identity: DynamicMutationQuarantineIdentity;
	readonly response: DynamicToolCallResponse;
	readonly settlement: DynamicOperationSettlement;
	readonly wireKeys: Set<string>;
}

interface EpochQuarantineOwner {
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

/**
 * A promise with its settlement handed back, so an owner can be registered before whatever
 * settles it has run.
 * @returns The deferred.
 */
function deferred<Value>(): Deferred<Value> {
	let resolve!: (value: Value) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<Value>((accept, decline) => {
		resolve = accept;
		reject = decline;
	});
	return Object.freeze({ promise, resolve, reject });
}

/**
 * The owners of the wire calls that are not in quarantine: one owner per key, so a repeated
 * call joins the operation already running under that key rather than starting a second one.
 * @returns The owner registry.
 */
function createOrdinaryWireOwners(): OrdinaryWireOwners {
	const owners = new Map<string, Deferred<DynamicToolCallResponse>>();
	/**
	 * Run an operation under a key, or join the one already running under it.
	 * @param key The owner key.
	 * @param run What to run when nothing owns the key yet.
	 * @returns The response, whoever ran it.
	 */
	const own = (
		key: string,
		run: () => Promise<DynamicToolCallResponse>,
	): Promise<DynamicToolCallResponse> => {
		const existing = owners.get(key);
		if (existing !== undefined) {
			return existing.promise;
		}
		const owner = deferred<DynamicToolCallResponse>();
		owners.set(key, owner);
		settleOwner(owners, key, owner, startOperation(run));
		return owner.promise;
	};
	return Object.freeze({
		/**
		 * The operation already running under a key, if there is one.
		 * @param key The owner key.
		 * @returns The operation, or undefined.
		 */
		get: (key: string): Promise<DynamicToolCallResponse> | undefined => owners.get(key)?.promise,
		own,
		/**
		 * How many keys are owned right now.
		 * @returns The owner count.
		 */
		size: (): number => owners.size,
		/** Drop every owner, which is what an epoch teardown leaves behind. */
		clear: (): void => {
			owners.clear();
		},
	});
}

/**
 * Start an operation, turning a synchronous throw into a rejection so every path settles the
 * owner rather than leaving it registered with nothing to settle it.
 * @param run What to run.
 * @returns The operation.
 */
function startOperation(
	run: () => Promise<DynamicToolCallResponse>,
): Promise<DynamicToolCallResponse> {
	try {
		return run();
	} catch (error) {
		return Promise.reject(error);
	}
}

/**
 * Settle one owner from its operation and release the key, leaving a key that has since been
 * taken by a newer owner alone.
 * @param owners The owner registry.
 * @param key The owner key.
 * @param owner The owner to settle.
 * @param operation The operation that settles it.
 */
function settleOwner(
	owners: Map<string, Deferred<DynamicToolCallResponse>>,
	key: string,
	owner: Deferred<DynamicToolCallResponse>,
	operation: Promise<DynamicToolCallResponse>,
): void {
	/** Release the key if this owner still holds it. */
	const release = (): void => {
		if (owners.get(key) === owner) {
			owners.delete(key);
		}
	};
	void operation.then(
		(response) => {
			release();
			owner.resolve(response);
			return undefined;
		},
		(error) => {
			release();
			owner.reject(error);
			return undefined;
		},
	);
}

/**
 * Whether a tool name is one of the three that mutate.
 * @param value The tool name.
 * @returns Whether it mutates.
 */
function isMutationTool(value: string): value is DynamicMutationToolName {
	return value === "create_thread" || value === "fork_thread" || value === "send_message_to_thread";
}

/**
 * The quarantine identity of a mutation call, or nothing when the request is not one. A request
 * the boundary cannot validate is not a mutation as far as quarantine is concerned.
 * @param request The server request.
 * @param options The dynamic tools options.
 * @returns The identity, or null.
 */
function mutationIdentity(
	request: DynamicServerRequest,
	options: CodexDynamicToolsOptions,
): DynamicMutationQuarantineIdentity | null {
	let tool: DynamicMutationToolName;
	try {
		const call = validateDynamicCall(request, options);
		if (!isMutationTool(call.name)) {
			return null;
		}
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

/**
 * The key one logical mutation call is owned under.
 * @param identity The quarantine identity.
 * @returns The logical key.
 */
function logicalKey(identity: DynamicMutationQuarantineIdentity): string {
	return logicalToolCallKey(identity);
}

/**
 * The key one child epoch is quarantined under.
 * @param child The child.
 * @param epoch The epoch.
 * @returns The key, or null when either is not a string.
 */
function epochKey(child: unknown, epoch: unknown): string | null {
	return typeof child === "string" && typeof epoch === "string"
		? JSON.stringify([child, epoch])
		: null;
}

/**
 * A value as a plain record of its own fields, which is how the quarantine boundary reads
 * anything it did not itself build.
 * @param value Untrusted value.
 * @returns The fields, or null when the value is not a plain object.
 */
function fieldsOf(value: unknown): Readonly<Record<string, unknown>> | null {
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		return null;
	}
	return Object.fromEntries(Object.entries(value));
}

/**
 * The epoch key a request belongs to.
 * @param value The request's logical call.
 * @returns The key, or null when the call does not name a child epoch.
 */
function requestEpochKey(value: unknown): string | null {
	const fields = fieldsOf(value);
	if (fields === null || !("child" in fields) || !("epoch" in fields)) {
		return null;
	}
	return epochKey(fields["child"], fields["epoch"]);
}

/**
 * The wire key a request is owned under, which is its child epoch plus its own request id.
 * @param value The request.
 * @returns The key, or null when the request does not name all three.
 */
function requestWireKey(value: unknown): string | null {
	const fields = fieldsOf(value);
	if (fields === null) {
		return null;
	}
	const parts = ["child", "epoch", "requestId"].map((name) => fields[name]);
	if (!parts.every((part) => typeof part === "string")) {
		return null;
	}
	return JSON.stringify(parts);
}

/**
 * The response a child gets while its epoch is recovering from a mutation it cannot account for.
 * @returns The refusal response.
 */
function blockedDynamicResponse(): DynamicToolCallResponse {
	return invalidDynamicResponse(
		"invalid_call",
		"The child epoch cannot accept another dynamic call while mutation recovery is pending.",
	);
}

/**
 * Whether a value carries exactly the named keys and nothing else.
 * @param value The record to check.
 * @param keys The keys it must carry.
 * @returns Whether the keys match exactly.
 */
function exactKeys(value: Readonly<Record<string, unknown>>, keys: readonly string[]): boolean {
	return Object.keys(value).toSorted().join(",") === [...keys].toSorted().join(",");
}

/**
 * Whether a value the lifecycle port returned names the child epoch it was asked about.
 * @param fields The value's own fields.
 * @param child The child it must name.
 * @param epoch The epoch it must name.
 * @returns Whether both match.
 */
function namesEpoch(
	fields: Readonly<Record<string, unknown>>,
	child: unknown,
	epoch: unknown,
): boolean {
	return fields["child"] === child && fields["epoch"] === epoch;
}

/**
 * Cross-check the poisoned-epoch owner the lifecycle port returned. The port's declared type
 * says what the owner should be; this reads the value's own fields, so a port that returns
 * something else is refused rather than believed on the strength of the type.
 * @param value What the port returned.
 * @param identity The identity the owner must be for.
 * @returns The owner, when it is the exact one.
 */
function exactPoisonOwner(
	value: DynamicMutationQuarantineOwner,
	identity: DynamicMutationQuarantineIdentity,
): DynamicMutationQuarantineOwner {
	const fields = fieldsOf(value);
	if (fields === null || !exactKeys(fields, ["child", "childExit", "epoch", "poisoned"])) {
		throw new Error("The lifecycle port did not return the exact poisoned epoch owner.");
	}
	if (!namesEpoch(fields, identity.child, identity.epoch)) {
		throw new Error("The lifecycle port did not return the exact poisoned epoch owner.");
	}
	if (fields["poisoned"] !== true || !(fields["childExit"] instanceof Promise)) {
		throw new Error("The lifecycle port did not return the exact poisoned epoch owner.");
	}
	return value;
}

/**
 * Cross-check the fail-closed shutdown owner the lifecycle port returned, reading the value's
 * own fields rather than trusting the port's declared type.
 * @param value What the port returned.
 * @param epoch The epoch the owner must be for.
 * @returns The owner, when it is the exact one.
 */
function exactShutdownOwner(
	value: DynamicFailClosedShutdownOwner,
	epoch: EpochQuarantineOwner,
): DynamicFailClosedShutdownOwner {
	const fields = fieldsOf(value);
	if (fields === null || !exactKeys(fields, ["child", "epoch", "shutdownInitiated", "teardown"])) {
		throw new Error("The lifecycle port did not return the exact fail-closed shutdown owner.");
	}
	if (!namesEpoch(fields, epoch.child, epoch.epoch)) {
		throw new Error("The lifecycle port did not return the exact fail-closed shutdown owner.");
	}
	if (fields["shutdownInitiated"] !== true || !(fields["teardown"] instanceof Promise)) {
		throw new Error("The lifecycle port did not return the exact fail-closed shutdown owner.");
	}
	return value;
}

/**
 * Whether the teardown proof the lifecycle port returned is the exact one for this epoch, with
 * both the session and the transport reported closed.
 * @param value What the port returned.
 * @param epoch The epoch the proof must be for.
 * @returns Whether the proof holds.
 */
function exactTeardownProof(
	value: DynamicEpochTeardownProof,
	epoch: EpochQuarantineOwner,
): boolean {
	const fields = fieldsOf(value);
	if (
		fields === null ||
		!exactKeys(fields, ["child", "epoch", "sessionClosed", "transportClosed"])
	) {
		return false;
	}
	if (!namesEpoch(fields, epoch.child, epoch.epoch)) {
		return false;
	}
	return fields["sessionClosed"] === true && fields["transportClosed"] === true;
}

export {
	DYNAMIC_QUARANTINE_WIRE_CAP,
	type Deferred,
	type OrdinaryWireOwners,
	type DispatchCandidate,
	type QuarantineWireOwner,
	type QuarantineLogicalOwner,
	type EpochQuarantineOwner,
	deferred,
	createOrdinaryWireOwners,
	fieldsOf,
	mutationIdentity,
	logicalKey,
	epochKey,
	requestEpochKey,
	requestWireKey,
	blockedDynamicResponse,
	exactPoisonOwner,
	exactShutdownOwner,
	exactTeardownProof,
};
