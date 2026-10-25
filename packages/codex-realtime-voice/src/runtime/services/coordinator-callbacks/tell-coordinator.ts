// The workhorse's one way to reach the coordinator while it works (TASK-321).
//
// The coordinator hears on its own when a workhorse turn ends or waits on the user. Between those,
// only the workhorse knows it has a question for the user, a milestone they asked about, or
// something that stops it, so it is given tell_coordinator. What it says is workhorse news like
// any other: queued in order with the rest and given to the coordinator at once while voice is
// live. With no voice session nobody is listening, and the workhorse is told so, since the
// coordinator runs no turn without voice.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { z } from "zod";

import type { CodexTransport, DynamicServerRequest } from "@archboard/codex-app-server/transport";
import type {
	CoordinatorCallbackDelivery,
	CoordinatorCallbackSource,
	WorkhorseNewsSource,
} from "#runtime/protocol/coordinator-callbacks/contract.ts";

/** The reviewed bytes of the template whose `{namespace}` and `{product}` the host's names fill. */
const COORDINATOR_CALLBACK_TEMPLATE_SHA256 =
	"1e958724435ccf7010e96f6c57e0d07c3149e95979f04b461b5b276b5bff885c" as const;

/** The response owner the workhorse's calls to the coordinator are registered under. */
const TELL_COORDINATOR_OWNER = "codex-coordinator-callbacks" as const;

const ManifestSchema = z.strictObject({
	type: z.literal("namespace"),
	name: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/u),
	description: z.string().min(1),
	tools: z.tuple([
		z.strictObject({
			type: z.literal("function"),
			name: z.literal("tell_coordinator"),
			description: z.string().min(1),
			inputSchema: z.json(),
			deferLoading: z.literal(false),
		}),
	]),
});

type CoordinatorCallbackNamespace = z.infer<typeof ManifestSchema>;

const TellCoordinatorArgumentsSchema = z.strictObject({
	message: z.string().min(1).max(2048),
});

/**
 * Load the reviewed template, refusing bytes whose digest is not the reviewed one: the tool's
 * description is what the workhorse is told, so changing it is a review like changing its
 * instructions.
 * @returns The template text.
 * @throws {TypeError} When the bytes drifted.
 */
function loadTemplate(): string {
	const bytes = readFileSync(
		new URL(import.meta.resolve("#runtime/services/coordinator-callbacks/coordinator.json")),
	);
	const digest = createHash("sha256").update(bytes).digest("hex");
	if (digest !== COORDINATOR_CALLBACK_TEMPLATE_SHA256) {
		throw new TypeError(
			`The coordinator callback manifest template hash drifted. Expected ${COORDINATOR_CALLBACK_TEMPLATE_SHA256}, received ${digest}. Human re-review is required before updating this digest.`,
		);
	}
	return bytes.toString("utf8");
}

const TEMPLATE = loadTemplate();

/**
 * The workhorse's namespace to reach the coordinator, as a host names it and its product, with
 * the digest of the exact bytes Codex is given.
 * @param names - The host's namespace name and the product the user talks with.
 * @param names.namespace - The namespace name.
 * @param names.productName - The product name, already one plain line.
 * @returns The namespace and its digest; the toolset freezes both.
 * @throws {TypeError} When the filled template is not the manifest's shape.
 */
function renderCoordinatorCallbackNamespace(names: {
	readonly namespace: string;
	readonly productName: string;
}): { readonly namespace: CoordinatorCallbackNamespace; readonly sha256: string } {
	const text = TEMPLATE.replace('"name": "{namespace}"', `"name": "${names.namespace}"`).replace(
		"talk with {product} by voice",
		`talk with ${names.productName} by voice`,
	);
	return {
		namespace: ManifestSchema.parse(JSON.parse(text)),
		sha256: createHash("sha256").update(text, "utf8").digest("hex"),
	};
}

/** What the workhorse is answered, by what became of its message. */
const ANSWERS = Object.freeze({
	invalid: "tell_coordinator takes one message of 1 to 2048 characters. Nothing was sent.",
	otherThread:
		"Only the workhorse the coordinator works with can reach it, and this thread is not that workhorse. Nothing was sent.",
	nobody:
		"Nobody is listening: no voice session is live, so nothing was sent. Say it in your answer instead.",
	delivered: "The coordinator has your message and decides what the user hears.",
	unknown:
		"The message may or may not have reached the coordinator. Do not send it again; say it in your answer instead.",
	notDelivered: "The coordinator did not get the message. Say it in your answer instead.",
});

/**
 * What the workhorse is answered once its message settled.
 * @param delivery - How the message's callback settled.
 * @returns The answer.
 */
function answerFor(delivery: CoordinatorCallbackDelivery): string {
	if (delivery.outcome === "delivered") return ANSWERS.delivered;
	if (delivery.outcome === "outcome_unknown") return ANSWERS.unknown;
	return delivery.reason === "voice_inactive" ? ANSWERS.nobody : ANSWERS.notDelivered;
}

/** What answering the workhorse's call needs of the callbacks module around it. */
interface TellCoordinatorParts {
	readonly transport: Pick<CodexTransport, "respond">;
	/**
	 * The news a message from this call is, or why there is none: the calling thread is not the
	 * linked workhorse, or nobody is there to tell.
	 */
	readonly news: (
		request: DynamicServerRequest,
		message: string,
	) => WorkhorseNewsSource | "other_thread" | "nobody";
	readonly enqueue: (event: CoordinatorCallbackSource) => Promise<CoordinatorCallbackDelivery>;
}

/**
 * What the workhorse is answered for one call: whether the call was valid and what became of it.
 * @param parts - What the answer needs.
 * @param request - The call.
 * @returns The answer and whether the call itself was valid.
 */
async function settle(
	parts: TellCoordinatorParts,
	request: DynamicServerRequest,
): Promise<{ readonly text: string; readonly success: boolean }> {
	const parsed = TellCoordinatorArgumentsSchema.safeParse(request.params.arguments);
	if (request.params.tool !== "tell_coordinator" || !parsed.success) {
		return { text: ANSWERS.invalid, success: false };
	}
	const news = parts.news(request, parsed.data.message);
	if (news === "other_thread") return { text: ANSWERS.otherThread, success: true };
	if (news === "nobody") return { text: ANSWERS.nobody, success: true };
	return { text: answerFor(await parts.enqueue(news)), success: true };
}

/**
 * Build what answers the workhorse's tell_coordinator calls.
 * @param parts - The transport, the news the call is, and the callback queue.
 * @returns The answerer of one call.
 */
function createTellCoordinator(
	parts: TellCoordinatorParts,
): (request: DynamicServerRequest) => Promise<void> {
	return async (request) => {
		const { text, success } = await settle(parts, request);
		await parts.transport.respond(request, TELL_COORDINATOR_OWNER, {
			result: { contentItems: [{ type: "inputText", text }], success },
		});
	};
}

/**
 * Answer a tell_coordinator call that no conversation's callbacks own: the calling thread is not a
 * workhorse any coordinator works with, so nothing is sent, and the call is answered rather than
 * left waiting.
 * @param transport - Where the answer goes.
 * @param request - The call.
 * @returns Resolves once the answer is written.
 */
function answerUnownedTellCoordinator(
	transport: Pick<CodexTransport, "respond">,
	request: DynamicServerRequest,
): Promise<void> {
	return transport.respond(request, TELL_COORDINATOR_OWNER, {
		result: { contentItems: [{ type: "inputText", text: ANSWERS.otherThread }], success: true },
	});
}

export {
	type CoordinatorCallbackNamespace,
	renderCoordinatorCallbackNamespace,
	TELL_COORDINATOR_OWNER,
	answerUnownedTellCoordinator,
	createTellCoordinator,
};
