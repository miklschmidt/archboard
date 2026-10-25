import { describe, expect, test } from "bun:test";
import { createIdentityAuthorities } from "@archboard/codex-app-server/identity";
import { announceContextChange } from "#server/services/announce/announce.ts";
import { parseTabSessionId } from "#server/rules/tab-session/tab-session.ts";
import type { ContextChange } from "#server/protocol/announce/contract.ts";
import type { ContextAnnouncementSource } from "#runtime/protocol/coordinator-callbacks/contract.ts";
import type { WorkhorseContextEvent } from "#runtime/services/thread-context/contract.ts";
import type { CodexWorkbenchDomainScope } from "#server/protocol/generation/domain.ts";

// Who `announce` tells, and the receipts it gives. What each audience does with a change it is
// told is owned by the thread-context delivery and the callback queue.

const CHECKOUT = "/work/shop";

/**
 * One live tab session with a workhorse in CHECKOUT, a ready coordinator and, when asked, live
 * voice; every delivery it is asked for is recorded and settles as delivered.
 * @param voiceLive Whether a voice generation is running.
 * @returns The scope and what was delivered.
 */
function tab(voiceLive = true) {
	const ids = createIdentityAuthorities().identity;
	const { childId, epoch } = ids.validator;
	const threadId = ids.decoder.adoptThreadId("workhorse");
	const coordinatorId = ids.decoder.adoptThreadId("coordinator");
	const id = parseTabSessionId("tab-1");
	if (id === null) throw new Error("The test tab session is invalid.");
	const told: WorkhorseContextEvent[] = [];
	const queued: ContextAnnouncementSource[] = [];
	const workhorse = {
		key: "workhorse-key",
		components: {
			contextDelivery: {
				deliver: async (event: WorkhorseContextEvent) => {
					told.push(event);
					return { outcome: "delivered", reason: null };
				},
			},
		},
	};
	const session = {
		id,
		state: { phase: "live" },
		workhorses: new Map([[CHECKOUT, workhorse]]),
		voiceWorkhorse: () => workhorse,
		components: {
			coordinator: { snapshot: () => ({ state: "ready", threadId: coordinatorId }) },
			realtime: {
				generation: () =>
					voiceLive ? { wireSessionId: ids.issuer.mintRealtimeSessionId() } : null,
			},
			callbacks: {
				enqueue: async (source: ContextAnnouncementSource) => {
					queued.push(source);
					return { outcome: "delivered", reason: null };
				},
			},
		},
	};
	const scope = {
		identity: { identity: ids },
		assertCurrent: () => undefined,
		sessions: { list: () => [session] },
		threadLink: {
			read: () => ({
				link: { state: "executable", reason: null, childId, epoch, threadId },
			}),
		},
	} as unknown as CodexWorkbenchDomainScope;
	/**
	 * Announce one change in this tab.
	 * @param change The change.
	 * @returns Its receipts.
	 */
	const announce = (change: ContextChange) =>
		announceContextChange({ scope: () => scope, resolveCheckout: (named) => named }, change);
	return { id, threadId, coordinatorId, told, queued, announce };
}

describe("announcing a context change", () => {
	test("a workhorse alone is told the words, the host's data, the author and the time", async () => {
		const t = tab();
		const receipts = await t.announce({
			feed: "editor",
			sequence: 4,
			author: "outside",
			capturedAtMs: 1_000,
			workhorse: {
				checkouts: [CHECKOUT, CHECKOUT, "/work/none"],
				text: "File saved.",
				payload: { file: "a" },
			},
		});

		expect(receipts).toEqual([
			{
				tabSessionId: t.id,
				audience: "workhorse",
				checkout: CHECKOUT,
				outcome: "delivered",
				reason: null,
			},
			{
				tabSessionId: t.id,
				audience: "workhorse",
				checkout: "/work/none",
				outcome: "not_delivered",
				reason: "no_workhorse",
			},
		]);
		expect(t.told).toHaveLength(1);
		expect(t.told[0]).toMatchObject({
			feedId: "editor",
			sequence: 4,
			author: "outside",
			capturedAtMs: 1_000,
			text: "File saved.",
			withheld: null,
			payload: { file: "a" },
			workhorse: { threadId: t.threadId },
			threadLink: { state: "executable", reason: null },
		});
		expect(t.queued).toHaveLength(0);
	});

	test("the coordinator alone is told through the tab's queue, and only while voice is live", async () => {
		const live = tab(true);
		const idle = tab(false);
		const change: ContextChange = {
			feed: "editor",
			sequence: 1,
			coordinator: { text: "File saved." },
		};
		const [told] = await live.announce(change);
		const [untold] = await idle.announce(change);

		expect(told).toMatchObject({ audience: "coordinator", outcome: "delivered" });
		expect(live.queued).toMatchObject([
			{ kind: "context", audience: "coordinator", context: { text: "File saved.", topic: null } },
		]);
		expect(untold).toMatchObject({ outcome: "not_delivered", reason: "voice_inactive" });
		expect([...idle.queued, ...live.told]).toHaveLength(0);
	});

	test("the voice alone is told as speech or quietly, with its topic, or why nothing", async () => {
		const t = tab();
		await t.announce({
			feed: "editor",
			sequence: 1,
			topic: "cursor",
			voice: { text: "The cursor moved.", speech: true },
		});
		await t.announce({ feed: "editor", sequence: 2, voice: { withheld: "hidden" } });

		expect(t.queued.map(({ audience, context }) => [audience, context])).toEqual([
			[
				"voice",
				expect.objectContaining({ topic: "cursor", text: "The cursor moved.", speech: true }),
			],
			["voice", expect.objectContaining({ topic: null, text: null, withheld: "hidden" })],
		]);
		expect(t.told).toHaveLength(0);
	});

	test("every named audience of every named tab gives one receipt", async () => {
		const t = tab();
		const absent = parseTabSessionId("tab-gone");
		if (absent === null) throw new Error("The test tab session is invalid.");
		const receipts = await t.announce({
			feed: "editor",
			sequence: 1,
			tabSessions: [t.id, absent],
			workhorse: { checkouts: [CHECKOUT], text: "File saved." },
			coordinator: { text: "File saved." },
			voice: { text: "File saved." },
		});

		expect(
			receipts.map(({ tabSessionId, audience, reason }) => [tabSessionId, audience, reason]),
		).toEqual([
			[t.id, "workhorse", null],
			[t.id, "coordinator", null],
			[t.id, "voice", null],
			[absent, "workhorse", "no_tab_session"],
			[absent, "coordinator", "no_tab_session"],
			[absent, "voice", "no_tab_session"],
		]);
		expect(t.told).toHaveLength(1);
		expect(t.queued.map(({ audience }) => audience)).toEqual(["coordinator", "voice"]);
	});

	test("a change it cannot announce is refused before anybody is told", async () => {
		const t = tab();
		const malformed: unknown[] = [
			{ feed: "editor", sequence: 1 },
			{ feed: "", sequence: 1, voice: { text: "x" } },
			{ feed: "editor", sequence: -1, voice: { text: "x" } },
			{ feed: "editor", sequence: 1, workhorse: { checkouts: [], text: "x" } },
			{
				feed: "editor",
				sequence: 1,
				workhorse: { checkouts: [CHECKOUT], text: "x", payload: { brief: 1 } },
			},
			{
				feed: "editor",
				sequence: 1,
				workhorse: { checkouts: [CHECKOUT], text: "x", payload: { open: () => "file" } },
				voice: { text: "x" },
			},
			{ feed: "editor", sequence: 1, voice: { text: "x", withheld: "y" } },
			{ feed: "editor", sequence: 1, capturedAtMs: Date.now() + 60_000, voice: { text: "x" } },
		];
		for (const change of malformed) {
			await expect(t.announce(change as ContextChange)).rejects.toBeInstanceOf(TypeError);
		}
		expect([...t.told, ...t.queued]).toHaveLength(0);
	});
});
