import type { DynamicServerRequest } from "../server-requests.js";

type DynamicParams = DynamicServerRequest["params"];

declare const request: DynamicServerRequest;
declare const arrayArguments: Extract<DynamicParams["arguments"], readonly unknown[]>;
declare const nestedArrayArguments: Extract<(typeof arrayArguments)[number], readonly unknown[]>;
declare const objectArguments: Extract<
	DynamicParams["arguments"],
	Readonly<Record<string, unknown>>
>;
declare const objectNestedArray: Extract<(typeof objectArguments)[string], readonly unknown[]>;

const knownFields = [request.params.threadId, request.params.turnId, request.params.callId];
void knownFields;

// @ts-expect-error Retained dynamic arguments cannot be replaced through the transport contract.
request.params.arguments = [];

// @ts-expect-error Retained dynamic argument arrays cannot be mutated.
arrayArguments[0] = null;

// @ts-expect-error Nested dynamic argument arrays are recursively readonly.
nestedArrayArguments[0] = null;

// @ts-expect-error Arrays nested in dynamic argument objects are recursively readonly.
objectNestedArray[0] = null;

const decodedMutablePayload = {
	threadId: "thread",
	turnId: "turn",
	callId: "call",
	namespace: "archboard_app",
	tool: "list_threads",
	arguments: [{ nested: [1, 2, 3] }],
};

const acceptedReadonlyPayload: DynamicParams = decodedMutablePayload;
void acceptedReadonlyPayload;
