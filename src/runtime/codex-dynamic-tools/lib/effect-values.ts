import type { LogicalToolCallCorrelation } from "@/shared/codex-workbench-identity";
import {
	canonicalDynamicApprovalJson,
	dynamicApprovalHashForCanonicalJson,
	type DynamicApprovalCanonicalEffect,
} from "@/shared/codex-browser-model";
import {
	CodexDynamicToolsError,
	type DynamicApprovalIdentity,
	type DynamicImmutableEffect,
	type DynamicMutationToolName,
} from "@/runtime/codex-dynamic-tools/lib/contract";

/** The longest visual summary an approval request carries. */
const SUMMARY_MAX_UTF8_BYTES = 512;

/** One mutation's arguments, as the effect holds them. */
type EffectArguments = DynamicImmutableEffect["arguments"];

/**
 * Freeze a value and everything inside it, so an effect a person approved cannot be changed
 * under them between the approval and the mutation it authorizes.
 * @param value The value.
 * @returns The same value, frozen through.
 */
function freezeDeep<T>(value: T): T {
	if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
		return value;
	}
	for (const child of Object.values(value)) {
		freezeDeep(child);
	}
	return Object.freeze(value);
}

/**
 * Whether a value carries exactly the named keys and nothing else, which is how the boundary
 * refuses a shape that smuggles extra fields past what was reviewed.
 * @param value The value.
 * @param keys The keys it must carry.
 * @returns Whether the keys match exactly.
 */
function hasExactKeys(value: object, keys: readonly string[]): boolean {
	return (
		Reflect.ownKeys(value).every((key) => typeof key === "string" && keys.includes(key)) &&
		keys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
	);
}

/**
 * Cut a string to fit a byte budget, marking what was cut with an ellipsis.
 * @param value The text.
 * @param maximum The byte budget.
 * @returns The text that fits.
 */
function truncateUtf8(value: string, maximum: number): string {
	if (Buffer.byteLength(value, "utf8") <= maximum) {
		return value;
	}
	const ellipsis = "…";
	const budget = maximum - Buffer.byteLength(ellipsis, "utf8");
	let result = "";
	for (const character of value) {
		if (Buffer.byteLength(result + character, "utf8") > budget) {
			break;
		}
		result += character;
	}
	return `${result}${ellipsis}`;
}

/**
 * The identity one approval is asked and answered under: which call it belongs to, and which
 * operation identity the mutation will be carried out under.
 * @param call The logical call.
 * @param operationId The mutation's operation identity, as it goes on the wire.
 * @returns The frozen identity.
 */
function identityFor(
	call: LogicalToolCallCorrelation,
	operationId: string,
): DynamicApprovalIdentity {
	return freezeDeep({
		child: call.child,
		epoch: call.epoch,
		threadId: call.threadId,
		turnId: call.turnId,
		callId: call.callId,
		namespace: call.namespace,
		tool: call.tool,
		manifestHash: call.manifestHash,
		operationId,
	});
}

/** What each mutation tool's refusal says when its arguments do not read. */
const ARGUMENT_REFUSALS = {
	create_thread: "The create effect prompt is invalid.",
	fork_thread: "The fork effect arguments are invalid.",
	send_message_to_thread: "The send effect arguments are invalid.",
} as const;

/**
 * Refuse an effect whose arguments do not read, naming the tool they were meant for.
 * @param tool The mutation tool.
 */
function refuseArguments(tool: DynamicMutationToolName): never {
	throw new CodexDynamicToolsError("invalid_call", ARGUMENT_REFUSALS[tool]);
}

/**
 * The prompt a create effect carries.
 * @param value The raw arguments.
 * @returns The prompt.
 */
function createPrompt(value: EffectArguments): string {
	const prompt = Reflect.get(value, "prompt");
	if (!Object.prototype.hasOwnProperty.call(value, "prompt") || typeof prompt !== "string") {
		refuseArguments("create_thread");
	}
	return prompt;
}

/** The thread, turn boundary and prompt a fork effect carries. */
interface ForkArguments {
	readonly threadId: string;
	readonly beforeTurnId: string | null;
	readonly prompt: string | null;
}

/**
 * The arguments a fork effect carries.
 * @param value The raw arguments.
 * @returns The fork's thread, boundary and prompt.
 */
function forkArguments(value: EffectArguments): ForkArguments {
	const threadId = Reflect.get(value, "threadId");
	const beforeTurnId = Reflect.get(value, "beforeTurnId");
	const prompt = Reflect.get(value, "prompt");
	const named = "threadId" in value && "beforeTurnId" in value && typeof threadId === "string";
	if (!named || !nullableString(beforeTurnId) || !nullableString(prompt)) {
		refuseArguments("fork_thread");
	}
	return { threadId, beforeTurnId, prompt };
}

/** The thread and prompt a send effect carries. */
interface SendArguments {
	readonly threadId: string;
	readonly prompt: string;
}

/**
 * The arguments a send effect carries.
 * @param value The raw arguments.
 * @returns The send's thread and prompt.
 */
function sendArguments(value: EffectArguments): SendArguments {
	const threadId = Reflect.get(value, "threadId");
	const prompt = Reflect.get(value, "prompt");
	if (!("threadId" in value) || typeof threadId !== "string" || typeof prompt !== "string") {
		refuseArguments("send_message_to_thread");
	}
	return { threadId, prompt };
}

/**
 * Whether a value is a string or explicitly absent, which is what an optional effect field is.
 * @param value The value.
 * @returns Whether it reads.
 */
function nullableString(value: unknown): value is string | null {
	return value === null || typeof value === "string";
}

/**
 * What a person is shown when they are asked to approve one mutation. The summary is bounded,
 * because the approval is read on a canvas and not in a log.
 * @param tool The mutation tool.
 * @param argumentsValue The effect's arguments.
 * @returns The summary.
 */
function summaryFor(tool: DynamicMutationToolName, argumentsValue: EffectArguments): string {
	return truncateUtf8(summaryText(tool, argumentsValue), SUMMARY_MAX_UTF8_BYTES);
}

/**
 * The summary before it is cut to fit.
 * @param tool The mutation tool.
 * @param argumentsValue The effect's arguments.
 * @returns The summary.
 */
function summaryText(tool: DynamicMutationToolName, argumentsValue: EffectArguments): string {
	if (tool === "create_thread") {
		return `Create thread: ${createPrompt(argumentsValue)}`;
	}
	if (tool === "fork_thread") {
		const fork = forkArguments(argumentsValue);
		return `Fork thread ${fork.threadId}${fork.prompt === null ? "" : `: ${fork.prompt}`}`;
	}
	const send = sendArguments(argumentsValue);
	return `Send message to thread ${send.threadId}: ${send.prompt}`;
}

/**
 * One mutation's arguments as the effect will hold them: exactly the fields the tool takes,
 * frozen, so nothing else the caller sent can travel with the approved effect.
 * @param tool The mutation tool.
 * @param value The raw arguments.
 * @returns The normalized arguments.
 */
function normalizedArguments(
	tool: DynamicMutationToolName,
	value: EffectArguments,
): EffectArguments {
	if (tool === "create_thread") {
		return freezeDeep({ prompt: createPrompt(value) });
	}
	if (tool === "send_message_to_thread") {
		return freezeDeep({ ...sendArguments(value) });
	}
	return freezeDeep({ ...forkArguments(value) });
}

/**
 * The canonical form of a fork's boundary, which is what the approval hash is taken over. A
 * self fork has to name the executing turn, because a fork of one's own thread with no boundary
 * would fork a thread that is still being written.
 * @param effect The fork effect.
 * @returns The canonical effect.
 */
function canonicalFork(
	effect: DynamicImmutableEffect & { tool: "fork_thread" },
): DynamicApprovalCanonicalEffect {
	const boundary = effect.effectiveBoundary;
	if (boundary.relation !== "self") {
		return {
			...effect,
			effectiveBoundary: { relation: "other", beforeTurnId: boundary.beforeTurnId },
		};
	}
	if (boundary.beforeTurnId === null) {
		throw new TypeError("a self fork needs the executing turn as its boundary");
	}
	return {
		...effect,
		effectiveBoundary: { relation: "self", beforeTurnId: boundary.beforeTurnId },
	};
}

/**
 * The hash a person's approval is bound to. Two effects that differ in anything a person would
 * have weighed hash differently, so an approval cannot be carried across to another effect.
 * @param identity The approval identity.
 * @param effect The effect.
 * @returns The hash.
 */
function dynamicEffectHash(
	identity: DynamicApprovalIdentity,
	effect: DynamicImmutableEffect,
): string {
	let canonicalEffect: DynamicApprovalCanonicalEffect;
	if (effect.tool === "fork_thread") {
		canonicalEffect = canonicalFork(effect);
	} else {
		canonicalEffect = effect;
	}
	return dynamicApprovalHashForCanonicalJson(
		canonicalDynamicApprovalJson({ identity, effect: canonicalEffect }),
	);
}

export {
	type EffectArguments,
	type ForkArguments,
	type SendArguments,
	createPrompt,
	dynamicEffectHash,
	forkArguments,
	freezeDeep,
	hasExactKeys,
	identityFor,
	normalizedArguments,
	sendArguments,
	summaryFor,
};
