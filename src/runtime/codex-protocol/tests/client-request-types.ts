import type {
	ClientRequestInput,
	ClientRequestParams,
	CodexSessionRequestParams,
	decodeClientRequestParams,
} from "../index.js";
import type {
	LoginId,
	QueuedSubmissionId,
	RealtimeSessionId,
	ThreadId,
	TurnId,
} from "../../../shared/codex-workbench-identity/index.js";

type Equal<Left, Right> = [Left, Right] extends [Right, Left] ? true : false;
type Assert<Value extends true> = Value;

declare const threadId: ThreadId;
declare const turnId: TurnId;
declare const loginId: LoginId;
declare const queuedSubmissionId: QueuedSubmissionId;
declare const realtimeSessionId: RealtimeSessionId;

const validSteer = {
	threadId,
	clientUserMessageId: "message-1",
	input: [{ type: "text", text: "continue", text_elements: [] }],
	additionalContext: { archboard: { kind: "application", value: "{}" } },
	expectedTurnId: turnId,
} satisfies CodexSessionRequestParams<"turn/steer">;

const plainThreadSteer: CodexSessionRequestParams<"turn/steer"> = {
	// @ts-expect-error Session callers cannot supply an unbranded ThreadId.
	threadId: "thread-1",
	clientUserMessageId: "message-1",
	input: [],
	additionalContext: {},
	expectedTurnId: turnId,
};

const plainTurnSteer: CodexSessionRequestParams<"turn/steer"> = {
	threadId,
	clientUserMessageId: "message-1",
	input: [],
	additionalContext: {},
	// @ts-expect-error expectedTurnId must be an issued TurnId.
	expectedTurnId: "turn-1",
};

// @ts-expect-error The authored steer body always carries the active turn precondition.
const missingExpectedTurn: CodexSessionRequestParams<"turn/steer"> = {
	threadId,
	clientUserMessageId: "message-1",
	input: [],
	additionalContext: {},
};

const extraSteerField: CodexSessionRequestParams<"turn/steer"> = {
	threadId,
	clientUserMessageId: "message-1",
	input: [],
	additionalContext: {},
	expectedTurnId: turnId,
	// @ts-expect-error responsesapiClientMetadata is not in the complete authored steer body.
	responsesapiClientMetadata: {},
};

const extraInputField: CodexSessionRequestParams<"turn/steer"> = {
	threadId,
	clientUserMessageId: "message-1",
	input: [
		{
			type: "text",
			text: "continue",
			text_elements: [],
			// @ts-expect-error Generated UserInput records are closed.
			unexpected: true,
		},
	],
	additionalContext: {},
	expectedTurnId: turnId,
};

const brandedRead = {
	threadId,
	includeTurns: false,
} satisfies CodexSessionRequestParams<"thread/read">;
const brandedInterrupt = { threadId, turnId } satisfies CodexSessionRequestParams<"turn/interrupt">;
const brandedCancel = { loginId } satisfies CodexSessionRequestParams<"account/login/cancel">;
const brandedQueue = {
	threadId,
	queuedSubmissionId,
} satisfies CodexSessionRequestParams<"thread/queue/delete">;
const brandedRealtime = {
	threadId,
	outputModality: "audio",
	realtimeSessionId,
} satisfies CodexSessionRequestParams<"thread/realtime/start">;

const plainRead: CodexSessionRequestParams<"thread/read"> = {
	// @ts-expect-error Every session-owned thread input is branded.
	threadId: "thread-1",
};
const plainQueue: CodexSessionRequestParams<"thread/queue/delete"> = {
	threadId,
	// @ts-expect-error Queue mutations require an issued QueuedSubmissionId.
	queuedSubmissionId: "queue-1",
};

const explicitUndefinedMetadataOutput: ClientRequestParams<"turn/start"> = {
	threadId: "thread-1",
	input: [],
	responsesapiClientMetadata: {
		// @ts-expect-error Runtime schemas reject explicit undefined record values.
		invalid: undefined,
	},
};
const explicitUndefinedMetadataInput: ClientRequestInput<"turn/start"> = {
	threadId: "thread-1",
	input: [],
	responsesapiClientMetadata: {
		// @ts-expect-error Accepted schema input also excludes explicit undefined values.
		invalid: undefined,
	},
};

type _SteerFieldsAreComplete = Assert<
	Equal<
		keyof CodexSessionRequestParams<"turn/steer">,
		"threadId" | "clientUserMessageId" | "input" | "additionalContext" | "expectedTurnId"
	>
>;
type _SteerThreadIsBranded = Assert<
	Equal<CodexSessionRequestParams<"turn/steer">["threadId"], ThreadId>
>;
type _SteerTurnIsBranded = Assert<
	Equal<CodexSessionRequestParams<"turn/steer">["expectedTurnId"], TurnId>
>;
type _RawWireTurnRemainsAString = Assert<
	Equal<ClientRequestParams<"turn/steer">["expectedTurnId"], string>
>;
type _DecoderAcceptsUntrustedInput = Assert<
	Equal<Parameters<typeof decodeClientRequestParams>[1], unknown>
>;

export type ClientRequestTypeFixture = [
	typeof validSteer,
	typeof plainThreadSteer,
	typeof plainTurnSteer,
	typeof missingExpectedTurn,
	typeof extraSteerField,
	typeof extraInputField,
	typeof brandedRead,
	typeof brandedInterrupt,
	typeof brandedCancel,
	typeof brandedQueue,
	typeof brandedRealtime,
	typeof plainRead,
	typeof plainQueue,
	typeof explicitUndefinedMetadataOutput,
	typeof explicitUndefinedMetadataInput,
	_SteerFieldsAreComplete,
	_SteerThreadIsBranded,
	_SteerTurnIsBranded,
	_RawWireTurnRemainsAString,
	_DecoderAcceptsUntrustedInput,
];
