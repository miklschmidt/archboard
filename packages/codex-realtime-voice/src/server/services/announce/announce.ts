// Tell the agents of the tab sessions what changed: a checkout's workhorse, the coordinator and the
// live voice, in any combination (`VoiceAgent.announce`). The host says what changed and to whom;
// the agent reads every identity itself when the change is announced, and each audience keeps its
// own guarantees: a workhorse hears a feed's sequence once, quietly, and the coordinator and the
// voice hear it through the tab's one ordered callback queue, only while voice is live.

import { z } from "zod";
import { CODEX_REALTIME_MS } from "@archboard/timing";
import { EXECUTION_CONTEXT_KEYS } from "#runtime/rules/host/context.ts";
import { BROWSER_VOICE_CONTEXT_TOPIC_MAX_UTF8_BYTES } from "#shared/schemas/browser/vocabulary.ts";
import type {
	AnnouncedContext,
	ContextAnnouncementSource,
} from "#runtime/protocol/coordinator-callbacks/contract.ts";
import type { WorkhorseContextEvent } from "#runtime/services/thread-context/contract.ts";
import type { CodexWorkbenchDomainScope } from "#server/protocol/generation/domain.ts";
import type {
	ContextChange,
	ContextReceipt,
	ContextReceiptReason,
} from "#server/protocol/announce/contract.ts";
import type { CodexWorkbenchTabSession } from "#server/services/sessions/sessions.ts";
import type { TabSessionId } from "#server/rules/tab-session/tab-session.ts";

/** What announcing reads: the live generation, and how a host's checkout name resolves. */
interface AnnounceScope {
	readonly scope: CodexWorkbenchDomainScope;
	readonly resolveCheckout: (named: string) => string | null;
}

/** Where announcing finds the live generation, which it asks for once a change is valid. */
interface AnnounceTarget {
	/** The live generation; throws while the agent is not ready. */
	readonly scope: () => CodexWorkbenchDomainScope;
	readonly resolveCheckout: (named: string) => string | null;
}

const Text = z.string();
const Withheld = z.strictObject({ withheld: z.string().min(1) });
const Topic = z
	.string()
	.min(1)
	.refine((value) => !value.includes("\0"), "NUL is not allowed")
	.refine(
		(value) =>
			new TextEncoder().encode(value).byteLength <= BROWSER_VOICE_CONTEXT_TOPIC_MAX_UTF8_BYTES,
		`a topic is at most ${BROWSER_VOICE_CONTEXT_TOPIC_MAX_UTF8_BYTES} UTF-8 bytes`,
	);
const Checkouts = z.array(z.string().min(1)).min(1);

/**
 * Whether the context codec writes a value as itself, as `JSON.stringify` does.
 * @param value A value of the host's payload.
 * @param path The containers that hold it, so a cycle is refused.
 * @returns False for a function, a symbol, a bigint, a number that is not finite, a class
 * instance or a cycle.
 */
function isJsonValue(value: unknown, path: readonly object[]): boolean {
	if (typeof value === "number") return Number.isFinite(value);
	if (typeof value === "object" && value !== null) return isJsonContainer(value, path);
	return value === null || typeof value === "string" || typeof value === "boolean";
}

/**
 * Whether an array or a plain object holds only JSON values. An absent entry is left out, or
 * written as null in an array, as `JSON.stringify` does.
 * @param value The container.
 * @param path The containers that hold it.
 * @returns True when the codec writes it as itself.
 */
function isJsonContainer(value: object, path: readonly object[]): boolean {
	const prototype: unknown = Object.getPrototypeOf(value);
	const plain = Array.isArray(value) || prototype === Object.prototype || prototype === null;
	if (!plain || path.includes(value)) return false;
	const inside = [...path, value];
	return Object.values(value).every((entry) => entry === undefined || isJsonValue(entry, inside));
}

const Payload = z
	.record(z.string(), z.unknown())
	.refine(
		(payload) => Object.keys(payload).every((key) => !EXECUTION_CONTEXT_KEYS.includes(key)),
		`a payload cannot use the keys ${EXECUTION_CONTEXT_KEYS.join(", ")}`,
	)
	.refine(
		(payload) => isJsonContainer(payload, []),
		"a payload is JSON data: no function, symbol, bigint, number that is not finite, class instance or cycle",
	);
const ContextChangeSchema = z
	.strictObject({
		feed: z.string().min(1),
		sequence: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
		tabSessions: z.array(z.string().min(1)).optional(),
		author: z.string().nullable().optional(),
		capturedAtMs: z.number().int().nonnegative().optional(),
		topic: Topic.optional(),
		workhorse: z
			.union([
				z.strictObject({ checkouts: Checkouts, text: Text, payload: Payload.optional() }),
				Withheld.extend({ checkouts: Checkouts }),
			])
			.optional(),
		coordinator: z.union([z.strictObject({ text: Text }), Withheld]).optional(),
		voice: z
			.union([z.strictObject({ text: Text, speech: z.boolean().optional() }), Withheld])
			.optional(),
	})
	.refine(
		(change) =>
			change.workhorse !== undefined ||
			change.coordinator !== undefined ||
			change.voice !== undefined,
		"name at least one audience: workhorse, coordinator or voice",
	);

/** A validated change with its defaults filled in. */
interface Announced {
	readonly change: ContextChange;
	readonly author: string | null;
	readonly capturedAtMs: number;
	readonly freshUntilMs: number;
}

/**
 * Refuse a change the agent cannot announce, and fill in its defaults.
 * @param change What the host passed, which a caller without types can get wrong.
 * @returns The change with its author and freshness.
 * @throws {TypeError} When the change is malformed.
 */
function parseChange(change: ContextChange): Announced {
	const parsed = ContextChangeSchema.safeParse(change);
	if (!parsed.success) {
		throw new TypeError(
			`This context change cannot be announced: ${z.prettifyError(parsed.error)}`,
		);
	}
	const now = Date.now();
	const capturedAtMs = change.capturedAtMs ?? now;
	// A delivery is attempted after the change happened: the page refuses a record that says otherwise.
	if (capturedAtMs > now) {
		throw new TypeError(
			"This context change cannot be announced: capturedAtMs is later than now. Pass the time the change happened, or omit it.",
		);
	}
	return {
		change,
		author: change.author ?? null,
		capturedAtMs,
		freshUntilMs: capturedAtMs + CODEX_REALTIME_MS.contextFreshness,
	};
}

/**
 * The words one audience is told, or why it is told nothing.
 * @param words The audience's part of the change.
 * @returns The words and the withholding, one of them null.
 */
function wordsOf(words: { readonly text: string } | { readonly withheld: string }): {
	readonly text: string | null;
	readonly withheld: string | null;
} {
	return "text" in words
		? { text: words.text, withheld: null }
		: { text: null, withheld: words.withheld };
}

/**
 * One receipt.
 * @param tabSessionId The tab session.
 * @param audience Who was or was not told.
 * @param checkout The workhorse's checkout, or null.
 * @param result What came of it.
 * @returns The frozen receipt.
 */
function receipt(
	tabSessionId: TabSessionId,
	audience: ContextReceipt["audience"],
	checkout: string | null,
	result: Pick<ContextReceipt, "outcome" | "reason">,
): ContextReceipt {
	return Object.freeze({ tabSessionId, audience, checkout, ...result });
}

/**
 * A receipt for an audience that was never attempted.
 * @param reason Why.
 * @returns The outcome and reason.
 */
function notDelivered(reason: ContextReceiptReason): Pick<ContextReceipt, "outcome" | "reason"> {
	return { outcome: "not_delivered", reason };
}

/** What one workhorse is told: the change's words for workhorses, with the checkouts named. */
type WorkhorsePart = NonNullable<ContextChange["workhorse"]>;
/** What the coordinator or the voice is told. */
type CallbackPart = NonNullable<ContextChange["coordinator" | "voice"]>;

/**
 * The coordinator's thread and the live voice session of a tab session, as a change names them.
 * The thread is named whenever the coordinator has one, also while it starts or can only be
 * inspected: this is who the workhorse is paired with, not what may drive it.
 * @param session The tab session.
 * @returns Both, each null while there is none.
 */
function liveCoordinator(session: CodexWorkbenchTabSession): WorkhorseContextEvent["coordinator"] {
	const coordinator = session.components.coordinator.snapshot();
	return {
		threadId: coordinator.threadId,
		realtimeSessionId: session.components.realtime.generation()?.wireSessionId ?? null,
	};
}

/**
 * The identities a workhorse is told a change under: its link, and while the link is executable
 * the child, thread and coordinator it names. The host supplies none of them.
 * @param scope The live generation.
 * @param session The tab session.
 * @param key The workhorse's link key.
 * @returns The identities.
 */
function workhorseIdentities(
	scope: CodexWorkbenchDomainScope,
	session: CodexWorkbenchTabSession,
	key: string,
): Pick<WorkhorseContextEvent, "threadLink" | "child" | "workhorse" | "coordinator"> {
	const link = scope.threadLink.read(key).link;
	const threadLink = { state: link.state, reason: link.reason };
	if (link.state !== "executable") {
		const { childId, epoch } = scope.identity.identity.validator;
		return {
			threadLink,
			child: { id: childId, epoch },
			workhorse: { threadId: null },
			coordinator: { threadId: null, realtimeSessionId: null },
		};
	}
	return {
		threadLink,
		child: { id: link.childId, epoch: link.epoch },
		workhorse: { threadId: link.threadId },
		coordinator: liveCoordinator(session),
	};
}

/**
 * Tell one workhorse of a tab session, through its own delivery, which keeps the feed's sequences
 * and refuses what is not fresh, not its link's, or its own.
 * @param context The live generation.
 * @param session The tab session.
 * @param announced The change.
 * @param part What workhorses are told.
 * @param named The checkout as the host named it.
 * @returns The receipt.
 */
async function tellWorkhorse(
	context: AnnounceScope,
	session: CodexWorkbenchTabSession,
	announced: Announced,
	part: WorkhorsePart,
	named: string,
): Promise<ContextReceipt> {
	const workhorse = session.workhorses.get(context.resolveCheckout(named) ?? named);
	if (workhorse === undefined) {
		return receipt(session.id, "workhorse", named, notDelivered("no_workhorse"));
	}
	const outcome = await workhorse.components.contextDelivery.deliver({
		feedId: announced.change.feed,
		sequence: announced.change.sequence,
		author: announced.author,
		capturedAtMs: announced.capturedAtMs,
		freshUntilMs: announced.freshUntilMs,
		...wordsOf(part),
		payload: ("payload" in part ? part.payload : undefined) ?? {},
		...workhorseIdentities(context.scope, session, workhorse.key),
	});
	return receipt(session.id, "workhorse", named, outcome);
}

/**
 * The link of the workhorse voice is bound to, which the callback queue correlates a change with.
 * @param context The live generation.
 * @param session The tab session.
 * @returns The executable link, or null while there is none.
 */
function voiceLink(context: AnnounceScope, session: CodexWorkbenchTabSession) {
	const workhorse = session.voiceWorkhorse();
	const link = workhorse === null ? null : context.scope.threadLink.read(workhorse.key).link;
	return link?.state === "executable" ? link : null;
}

/**
 * What the coordinator or the voice is told of a change.
 * @param announced The change.
 * @param part That audience's part of it.
 * @returns The callback's view of the change.
 */
function announcedContextOf(announced: Announced, part: CallbackPart): AnnouncedContext {
	return {
		feedId: announced.change.feed,
		sequence: announced.change.sequence,
		capturedAtMs: announced.capturedAtMs,
		freshUntilMs: announced.freshUntilMs,
		topic: announced.change.topic ?? null,
		...wordsOf(part),
		speech: ("speech" in part ? part.speech : undefined) ?? false,
	};
}

/**
 * Tell the coordinator or the voice of a tab session, through the tab's one callback queue.
 * @param context The live generation.
 * @param session The tab session.
 * @param announced The change.
 * @param audience Which of the two, and what it is told.
 * @returns The receipt.
 */
async function tellThroughCallbacks(
	context: AnnounceScope,
	session: CodexWorkbenchTabSession,
	announced: Announced,
	audience: readonly ["coordinator" | "voice", CallbackPart],
): Promise<ContextReceipt> {
	const [name, part] = audience;
	if (session.components.realtime.generation() === null) {
		return receipt(session.id, name, null, notDelivered("voice_inactive"));
	}
	const link = voiceLink(context, session);
	if (link === null) return receipt(session.id, name, null, notDelivered("not_ready"));
	const source: ContextAnnouncementSource = {
		kind: "context",
		audience: name,
		child: { id: link.childId, epoch: link.epoch },
		coordinator: liveCoordinator(session),
		workhorse: { threadId: link.threadId, turnId: null },
		threadLink: { state: link.state, reason: link.reason },
		context: announcedContextOf(announced, part),
		author: announced.author,
	};
	const delivery = await session.components.callbacks.enqueue(source);
	return receipt(session.id, name, null, delivery);
}

/**
 * The coordinator and the voice, each when the change names it, with what it is told.
 * @param change The change.
 * @returns The audiences, the coordinator first.
 */
function callbackAudiences(
	change: ContextChange,
): readonly (readonly ["coordinator" | "voice", CallbackPart])[] {
	return (["coordinator", "voice"] as const).flatMap((name) => {
		const part = change[name];
		return part === undefined ? [] : [[name, part] as const];
	});
}

/**
 * Every receipt one tab session gives for a change, the audiences told concurrently.
 * @param context The live generation.
 * @param session The tab session, or the id of one that is not live.
 * @param announced The change.
 * @returns Its receipts: one per workhorse checkout, then the coordinator's, then the voice's.
 */
function tellSession(
	context: AnnounceScope,
	session: CodexWorkbenchTabSession | TabSessionId,
	announced: Announced,
): Promise<ContextReceipt>[] {
	const { workhorse } = announced.change;
	const checkouts = [...new Set(workhorse?.checkouts)];
	const audiences = callbackAudiences(announced.change);
	if (typeof session === "string") {
		const missing = notDelivered("no_tab_session");
		return [
			...checkouts.map((named) => receipt(session, "workhorse", named, missing)),
			...audiences.map(([name]) => receipt(session, name, null, missing)),
		].map((value) => Promise.resolve(value));
	}
	const workhorses =
		workhorse === undefined
			? []
			: checkouts.map((named) => tellWorkhorse(context, session, announced, workhorse, named));
	return [
		...workhorses,
		...audiences.map((audience) => tellThroughCallbacks(context, session, announced, audience)),
	];
}

/**
 * Announce one context change to the audiences it names, in the tab sessions it is for.
 * @param target Where the live generation is, and how a checkout name resolves.
 * @param input The change.
 * @returns One receipt per tab session and audience, and per checkout for a workhorse.
 * @throws {TypeError} When the change is malformed.
 */
async function announceContextChange(
	target: AnnounceTarget,
	input: ContextChange,
): Promise<readonly ContextReceipt[]> {
	const announced = parseChange(input);
	const context: AnnounceScope = { scope: target.scope(), resolveCheckout: target.resolveCheckout };
	context.scope.assertCurrent();
	const live = context.scope.sessions.list().filter((session) => session.state.phase === "live");
	const named = announced.change.tabSessions;
	const targets =
		named === undefined
			? live
			: [...new Set(named)].map((id) => live.find((session) => session.id === id) ?? id);
	const receipts = await Promise.all(
		targets.flatMap((session) => tellSession(context, session, announced)),
	);
	return Object.freeze(receipts);
}

export { announceContextChange, type AnnounceTarget };
