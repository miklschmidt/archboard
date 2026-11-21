import { createCodexBrowserModel } from "@archboard/codex-realtime-voice/contract";

/** The browser's own model: every identity is a validated wire string, as the browser holds it. */
const model = createCodexBrowserModel();

/** A schema that brands one identity domain. */
interface IdentitySchema<Identity> {
	readonly parse: (value: unknown) => Identity;
}

let issued = 0;

/**
 * A wire token no other fixture identity uses.
 * @returns The token.
 */
function token(): string {
	issued += 1;
	return `h${issued.toString(16).padStart(32, "0")}`;
}

/**
 * Brands a raw id the way the browser brands one the server sent.
 * @param schema The domain's schema in the browser model.
 * @returns The brander.
 */
function branded<Identity>(schema: IdentitySchema<Identity>): (raw: string) => Identity {
	return (raw) => schema.parse(raw);
}

/**
 * Brands a fresh id, spelled the way the server spells one it mints.
 * @param schema The domain's schema in the browser model.
 * @param spell Spells the id around a fresh token.
 * @returns A function that brands a fresh id each call.
 */
function fresh<Identity>(
	schema: IdentitySchema<Identity>,
	spell: (fixtureToken: string) => string,
): () => Identity {
	return () => schema.parse(spell(token()));
}

/**
 * Identities of one child epoch for a browser-side test, branded through the browser model the
 * way the browser brands what the server sends it.
 * @param prefix The host's record prefix.
 * @returns The child, its epoch, and one brander per identity domain.
 */
function browserIdentities(prefix = "codex") {
	const childToken = token();
	return {
		child: model.ChildIdSchema.parse(`${prefix}:child:${childToken}`),
		epoch: model.ChildEpochSchema.parse(`${prefix}:epoch:${childToken}.${token()}`),
		/** Another epoch of the same child, as a restarted child would name it. */
		otherEpoch: fresh(model.ChildEpochSchema, (next) => `${prefix}:epoch:${childToken}.${next}`),
		thread: branded(model.ThreadIdSchema),
		turn: branded(model.TurnIdSchema),
		item: branded(model.ItemIdSchema),
		queuedSubmission: branded(model.QueuedSubmissionIdSchema),
		login: branded(model.LoginIdSchema),
		approval: branded(model.ApprovalIdSchema),
		dynamicToolCall: branded(model.DynamicToolCallIdSchema),
		jsonRpcRequest: branded(model.JsonRpcRequestIdSchema),
		nextJsonRpcRequest: fresh(model.JsonRpcRequestIdSchema, (next) => next),
		browserCommand: fresh(
			model.BrowserCommandIdSchema,
			(next) => `${prefix}:browser-command:${next}`,
		),
		realtimeSession: fresh(
			model.RealtimeSessionIdSchema,
			(next) => `${prefix}:realtime-session:${next}`,
		),
		operation: fresh(
			model.OperationIdSchema,
			(next) => `${prefix}:operation:${childToken}.${token()}.${next}`,
		),
	};
}

/** The identities `browserIdentities` hands out. */
type BrowserIdentities = ReturnType<typeof browserIdentities>;

export { browserIdentities, type BrowserIdentities };
