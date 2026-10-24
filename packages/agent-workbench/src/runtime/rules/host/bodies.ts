import { z } from "zod";
import { cloneAndFreeze } from "#runtime/rules/host/immutability.ts";
import type { SessionParams } from "@archboard/codex-app-server/session";
import type {
	WorkbenchContextCodec,
	WorkbenchExecutionContext,
} from "#runtime/protocol/host/context.ts";
import { captureExecutionContext } from "#runtime/rules/host/context.ts";
import { createTextUserInput } from "#runtime/rules/host/text-input.ts";

/**
 * Encode host data after independently validating and freezing its execution evidence.
 * @param context The captured execution facts and host payload.
 * @param codec The host application key and wire encoder.
 * @returns The frozen application context slot.
 */
function createWorkbenchAdditionalContext(
	context: WorkbenchExecutionContext,
	codec: WorkbenchContextCodec,
) {
	const captured = captureExecutionContext(context);
	if (!codec.key || !codec.turnTrigger)
		throw new TypeError("The host context key and turn trigger are required.");
	const value = codec.encode(captured);
	if (typeof value !== "string") throw new TypeError("The host context codec returned no text.");
	return cloneAndFreeze({ [codec.key]: cloneAndFreeze({ kind: "application" as const, value }) });
}

const NamedIdentitySchema = z.string().min(1);

interface WorkbenchTurnInput {
	readonly threadId: string;
	readonly clientUserMessageId: string;
	readonly prompt: string;
	readonly context: WorkbenchExecutionContext;
}

/**
 * Build a turn start with host context under its application key.
 * @param input The captured input and its operation identity.
 * @param codec The host application key and wire encoder.
 * @returns The immutable turn/start parameters.
 */
function createWorkbenchTurnStartParams(input: WorkbenchTurnInput, codec: WorkbenchContextCodec) {
	return cloneAndFreeze({
		threadId: NamedIdentitySchema.parse(input.threadId),
		clientUserMessageId: NamedIdentitySchema.parse(input.clientUserMessageId),
		input: [createTextUserInput(input.prompt)],
		turnTrigger: codec.turnTrigger,
		additionalContext: createWorkbenchAdditionalContext(input.context, codec),
	}) satisfies Omit<SessionParams<"turn/start">, "threadId"> & { readonly threadId: string };
}

/**
 * Build a steer for the exact expected turn with host context.
 * @param input The captured input and its operation identity.
 * @param codec The host application key and wire encoder.
 * @returns The immutable turn/steer parameters.
 */
function createWorkbenchTurnSteerParams(
	input: WorkbenchTurnInput & { readonly expectedTurnId: string },
	codec: WorkbenchContextCodec,
) {
	return cloneAndFreeze({
		threadId: NamedIdentitySchema.parse(input.threadId),
		clientUserMessageId: NamedIdentitySchema.parse(input.clientUserMessageId),
		input: [createTextUserInput(input.prompt)],
		expectedTurnId: NamedIdentitySchema.parse(input.expectedTurnId),
		additionalContext: createWorkbenchAdditionalContext(input.context, codec),
	});
}

export {
	createWorkbenchAdditionalContext,
	createWorkbenchTurnStartParams,
	createWorkbenchTurnSteerParams,
};

/**
 * Build one developer item from immutable host context without starting a turn.
 * @param input The captured input and its operation identity.
 * @param input.threadId The threadId value.
 * @param input.context The context value.
 * @param codec The host application key and wire encoder.
 * @returns The immutable developer-item parameters.
 */
function createWorkbenchThreadInjectItemsParams(
	input: { readonly threadId: string; readonly context: WorkbenchExecutionContext },
	codec: WorkbenchContextCodec,
) {
	const context = captureExecutionContext(input.context);
	const text = codec.encode(context);
	return cloneAndFreeze({
		threadId: NamedIdentitySchema.parse(input.threadId),
		items: [
			{
				type: "message" as const,
				role: "developer" as const,
				content: [{ type: "input_text" as const, text }],
			},
		],
	});
}
type ThreadInjectItemsParams = ReturnType<typeof createWorkbenchThreadInjectItemsParams>;
export { createWorkbenchThreadInjectItemsParams, type ThreadInjectItemsParams };
