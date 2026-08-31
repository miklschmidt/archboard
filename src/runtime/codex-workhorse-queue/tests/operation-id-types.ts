import {
	createCodexWorkhorseQueue,
	type WorkhorseQueueBinding,
	type WorkhorseQueueIdentityPort,
	type WorkhorseQueueOperationIdPort,
	type WorkhorseQueueSessionPort,
} from "../index.ts";

declare const operationIdBrand: unique symbol;

/** Stand-in for the canonical shared OperationId owned by TASK-143.01.20. */
type CanonicalOperationId = string & {
	readonly [operationIdBrand]: "operation";
};

declare const session: WorkhorseQueueSessionPort;
declare const acceptedBinding: WorkhorseQueueBinding;
declare const identity: WorkhorseQueueIdentityPort;
declare const operationId: CanonicalOperationId;

const operationIds = {
	assertCurrent(value: CanonicalOperationId): void {
		void value;
	},
	serialize(value: CanonicalOperationId): string {
		return value;
	},
};

const queue = createCodexWorkhorseQueue({
	session,
	currentBinding: () => acceptedBinding,
	identity,
	operationIds,
});

void queue.add({ operationId, prompt: "valid" });

// @ts-expect-error Queue mutations require the host-issued OperationId brand inferred from the port.
void queue.add({ operationId: "plain-string", prompt: "invalid" });

type Equal<Left, Right> = [Left] extends [Right] ? ([Right] extends [Left] ? true : false) : false;
type Assert<Value extends true> = Value;

export type WorkhorseQueueOperationIdInferenceFixture = [
	Assert<Equal<Parameters<typeof queue.add>[0]["operationId"], CanonicalOperationId>>,
	Assert<Equal<Parameters<typeof queue.update>[0]["operationId"], CanonicalOperationId>>,
	Assert<Equal<Parameters<typeof queue.delete>[0]["operationId"], CanonicalOperationId>>,
	Assert<Equal<Parameters<typeof queue.reorder>[0]["operationId"], CanonicalOperationId>>,
	Assert<Equal<Parameters<typeof queue.start>[0]["operationId"], CanonicalOperationId>>,
];

const explicitlyTypedPort: WorkhorseQueueOperationIdPort<CanonicalOperationId> = operationIds;
void explicitlyTypedPort;
