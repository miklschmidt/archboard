import { describe, expect, test } from "bun:test";

import { CODEX_SEMANTIC_FRESHNESS_MS } from "../../../shared/timing/timing.ts";
import {
	SemanticContextLifecycleError,
	SEMANTIC_CONTEXT_LIMITS,
	type SemanticContextInput,
	type SemanticCursor,
	type SettledSemanticChangeEvent,
} from "../index.ts";
import { context, change, sourceHarness, harness, utf8 } from "./publisher-harness.ts";
describe("semantic context publisher", () => {
	test("publishes focus and selection immediately without a settle path", () => {
		const h = harness();
		const focus: string[] = [];
		const selection: string[][] = [];
		const settled: unknown[] = [];
		h.publisher.subscribePaneFocus((event) => focus.push(event.pane.paneId));
		h.publisher.subscribePaneSelection((event) => selection.push([...event.selection]));
		h.publisher.subscribeSettledChange((event) => settled.push(event));

		h.emitFocus(context(h.ids, { pane: { paneId: "pane-b", focused: false } }));
		h.emitSelection(context(h.ids, { selection: ["selected-now"] }));
		h.emitFocus(context(h.ids, { pane: { paneId: "pane-c", focused: true } }));

		expect(focus).toEqual(["pane-b", "pane-c"]);
		expect(selection).toEqual([["selected-now"]]);
		expect(settled).toHaveLength(0);
		expect(h.state.feedSubscriptions).toBe(1);
	});

	test("filters agent-only and cosmetic feed events while accepting human and mixed changes", () => {
		const h = harness();
		const settled: Array<{ origin: string; cursor: SemanticCursor | null }> = [];
		h.publisher.subscribeSettledChange((event) =>
			settled.push({ origin: event.origin ?? "none", cursor: event.cursor }),
		);

		h.emitFeed(change(h.state.now));
		h.emitFeed(change(h.state.now, { origin: "mixed" }));
		h.emitFeed(change(h.state.now, { origin: "agent" }));
		h.emitFeed(change(h.state.now, { significance: "cosmetic" }));

		expect(settled).toEqual([
			{ origin: "human", cursor: { feedId: "feed-1", sequence: 3 } },
			{ origin: "mixed", cursor: { feedId: "feed-1", sequence: 3 } },
		]);
		expect(h.state.changeReads).toBe(2);
	});

	test("includes identity fields and freezes the exact current-feed cursor", () => {
		const h = harness();
		h.state.changeContext = context(h.ids, {
			cursor: { feedId: "prior-feed", sequence: 99 },
		});
		let published: ReturnType<typeof h.publisher.publishPaneFocus> | undefined;
		h.publisher.subscribePaneFocus((event) => {
			published = event;
		});

		h.emitFeed(change(h.state.now, { cursor: 42 }));
		const settled = published;
		expect(settled).toBeUndefined();
		const event = h.publisher.publishPaneFocus(context(h.ids));

		expect(event).toMatchObject({
			kind: "pane_focus",
			source: "pane_focus",
			feedId: "feed-1",
			repository: "archboard",
			board: { key: "payments", note: "boards/payments.excalidraw.md" },
			version: 7,
			pane: { paneId: "pane-a", focused: true },
			cursor: { feedId: "feed-1", sequence: 3 },
			freshness: { state: "fresh", capturedAtMs: h.state.now },
			child: { id: h.ids.child, epoch: h.ids.epoch },
			claim: { holder: "agent", doing: "mapping the board" },
			doing: "mapping the board",
		});
		expect(Object.isFrozen(event)).toBe(true);
		expect(Object.isFrozen(event.cursor)).toBe(true);
		expect(Object.isFrozen(event.selection)).toBe(true);
		expect(() => (event.selection as string[]).push("not-published")).toThrow();
		expect(event.brief).toContain('"description":"Payments board');
	});

	test("settled publication derives one cursor from the source event", () => {
		const h = harness();
		h.state.changeContext = context(h.ids, {
			cursor: { feedId: "prior-feed", sequence: 99 },
		});
		let event: SettledSemanticChangeEvent | undefined;
		h.publisher.subscribeSettledChange((published) => {
			event = published;
		});
		h.emitFeed(
			change(h.state.now, {
				cursor: 44,
			}),
		);

		if (event === undefined) {
			throw new Error("expected a settled event");
		}
		if (event.cursor === null) {
			throw new Error("expected a settled cursor");
		}
		expect(event.cursor).toEqual({ feedId: "feed-1", sequence: 44 });
		expect(event.change.cursor).toBe(event.cursor);
		expect(event.staleness).toEqual({ state: "current", reasons: [] });
	});

	test("reads fresh context only on demand and renders the same bytes deterministically", () => {
		const h = harness();
		expect(h.state.freshReads).toBe(0);
		const first = h.publisher.freshBrief();
		const second = h.publisher.freshBrief();

		expect(h.state.freshReads).toBe(2);
		expect(first.kind).toBe("fresh_brief");
		expect(first.brief).toBe(second.brief);
		expect(first.bytes).toBe(utf8(first.brief));
	});

	test("builds an operation brief from the exact supplied pane instead of focused state", () => {
		const h = harness();
		const exact = context(h.ids, {
			board: { key: "ledger", note: "boards/ledger.excalidraw.md", version: 11 },
			pane: { paneId: "pane-b", focused: false },
			selection: ["ledger-node"],
		});
		const operationBrief = h.publisher.freshBriefFor(exact);
		const focusedBrief = h.publisher.freshBrief();
		expect(operationBrief).toMatchObject({
			board: { key: "ledger", note: "boards/ledger.excalidraw.md" },
			pane: { paneId: "pane-b", focused: false },
			selection: ["ledger-node"],
		});
		expect(focusedBrief).toMatchObject({
			board: { key: "payments" },
			pane: { paneId: "pane-a", focused: true },
		});
		expect([operationBrief.version, h.state.freshReads]).toEqual([11, 1]);
	});

	test("fits hostile valid maxima into one deterministic UTF-8 budget", () => {
		const h = harness();
		const selection = Array.from(
			{ length: SEMANTIC_CONTEXT_LIMITS.selectionEntries },
			(_, index) => `${String(index).padStart(3, "0")}${"界".repeat(20)}`,
		);
		const ambiguity = Array.from(
			{ length: SEMANTIC_CONTEXT_LIMITS.ambiguityEntries },
			(_, index) => `${String(index).padStart(2, "0")}${"界".repeat(84)}`,
		);
		const staleReasons = ambiguity.map((reason) => `stale:${reason}`);
		const hostile = context(h.ids, {
			repository: "r".repeat(SEMANTIC_CONTEXT_LIMITS.repositoryBytes),
			threadLink: { state: "inspect_only", reason: "界".repeat(170) },
			board: {
				key: "b".repeat(SEMANTIC_CONTEXT_LIMITS.boardKeyBytes),
				note: "界".repeat(1_365),
				version: 7,
			},
			pane: { paneId: "p".repeat(SEMANTIC_CONTEXT_LIMITS.paneIdBytes), focused: true },
			selection,
			claim: { holder: "agent", doing: "界".repeat(170) },
			doing: "界".repeat(170),
			description: "界".repeat(2_730),
			ambiguity,
			stale: true,
			staleReasons,
		});

		const first = h.publisher.publishPaneSelection(hostile);
		const second = h.publisher.publishPaneSelection(hostile);

		expect(first.brief).toBe(second.brief);
		expect(first.truncated).toBe(true);
		expect(JSON.parse(first.brief).truncated).toBe(true);
		expect(utf8(first.brief)).toBeLessThanOrEqual(SEMANTIC_CONTEXT_LIMITS.briefBytes);
		expect(first.brief).toContain("…");
		expect(first.repository).not.toBe("");
		expect(first.board.key).not.toBe("");
		expect(first.board.note).not.toBe("");
		expect(first.pane.paneId).not.toBe("");
		expect(
			first.selection.every((id) => utf8(id) <= SEMANTIC_CONTEXT_LIMITS.selectionIdBytes),
		).toBe(true);
		expect(
			first.ambiguity.every((reason) => utf8(reason) <= SEMANTIC_CONTEXT_LIMITS.ambiguityBytes),
		).toBe(true);
		expect(utf8(first.description)).toBeLessThanOrEqual(SEMANTIC_CONTEXT_LIMITS.descriptionBytes);
	});

	test("marks prior-feed cursors stale and rejects malformed cursor shapes", () => {
		const h = harness();
		const prior = h.publisher.publishPaneSelection(
			context(h.ids, { cursor: { feedId: "prior-feed", sequence: 7 } }),
		);
		expect(prior.cursor).toEqual({ feedId: "prior-feed", sequence: 7 });
		expect(prior.staleness.state).toBe("stale");
		expect(prior.ambiguity.join(" ")).toContain("cursor belongs to feed");

		const malformed = {
			...context(h.ids),
			cursor: "feed-1:7",
		} as unknown as SemanticContextInput;
		expect(() => h.publisher.publishPaneSelection(malformed)).toThrow(/cursor/);
		const extraKey = {
			feedId: "feed-1",
			sequence: 7,
			extra: true,
		};
		expect(() =>
			h.publisher.publishPaneSelection({
				...context(h.ids),
				cursor: extraKey as never,
			}),
		).toThrow(/feedId and sequence/);
		const numeric = {
			...context(h.ids),
			cursor: 7,
		} as unknown as SemanticContextInput;
		expect(() => h.publisher.publishPaneSelection(numeric)).toThrow(/cursor/);
	});

	test("keeps cursors qualified across a publisher restart", () => {
		const h = sourceHarness();
		const first = h.createPublisher("feed-1");
		first.dispose();
		const restarted = h.createPublisher("feed-2");

		const current = restarted.publishPaneSelection(
			context(h.ids, { cursor: { feedId: "feed-2", sequence: 8 } }),
		);
		const prior = restarted.publishPaneSelection(
			context(h.ids, { cursor: { feedId: "feed-1", sequence: 9 } }),
		);

		expect(current.cursor).toEqual({ feedId: "feed-2", sequence: 8 });
		expect(current.staleness.state).toBe("current");
		expect(prior.cursor).toEqual({ feedId: "feed-1", sequence: 9 });
		expect(prior.staleness.state).toBe("stale");
		restarted.dispose();
	});

	test("marks stale timestamps and board disagreement instead of hiding ambiguity", () => {
		const h = harness();
		h.state.now += CODEX_SEMANTIC_FRESHNESS_MS + 1;
		const stale: Array<{
			freshness: string;
			reasons: readonly string[];
			ambiguity: readonly string[];
		}> = [];
		h.publisher.subscribeSettledChange((event) =>
			stale.push({
				freshness: event.freshness.state,
				reasons: event.staleness.reasons,
				ambiguity: event.ambiguity,
			}),
		);
		h.emitFeed(change(h.state.now - CODEX_SEMANTIC_FRESHNESS_MS - 1));
		h.emitFeed(change(h.state.now, { board: "other-board", at: "not-a-date" }));

		expect(stale[0]?.freshness).toBe("stale");
		expect(stale[0]?.reasons).toContain("semantic freshness window expired");
		expect(stale[1]?.reasons.join(" ")).toContain("settled event names board");
		expect(stale[1]?.ambiguity.join(" ")).toContain("settled event names board");
	});

	test("rolls back every acquired source when registration fails at each step", () => {
		for (const failure of ["feed", "focus", "selection"] as const) {
			const h = sourceHarness({ registrationFailure: failure });
			expect(() => h.createPublisher()).toThrow(`${failure} registration failed`);
			expect(h.activeSources()).toEqual({ feed: 0, focus: 0, selection: 0 });
			if (failure === "feed") {
				expect(h.state.feedUnsubscriptions).toBe(0);
			} else if (failure === "focus") {
				expect(h.state.feedUnsubscriptions).toBe(1);
				expect(h.state.focusUnsubscriptions).toBe(0);
			} else {
				expect(h.state.feedUnsubscriptions).toBe(1);
				expect(h.state.focusUnsubscriptions).toBe(1);
				expect(h.state.selectionUnsubscriptions).toBe(0);
			}
		}
	});

	test("reports cleanup errors after attempting every source cleanup", () => {
		const h = sourceHarness({ cleanupFailures: ["feed", "focus", "selection"] });
		const publisher = h.createPublisher();
		expect(() => publisher.dispose()).toThrow(SemanticContextLifecycleError);
		expect(h.activeSources()).toEqual({ feed: 0, focus: 0, selection: 0 });
		expect(h.state).toMatchObject({
			feedUnsubscriptions: 1,
			focusUnsubscriptions: 1,
			selectionUnsubscriptions: 1,
		});
		publisher.dispose();
		expect(h.state.feedUnsubscriptions).toBe(1);
	});

	test("replacement creates one live binding and no second settle timer", () => {
		const h = sourceHarness();
		const first = h.createPublisher();
		first.dispose();
		const second = h.createPublisher();
		const seen: string[] = [];
		second.subscribePaneFocus((event) => seen.push(event.pane.paneId));

		expect(h.activeSources()).toEqual({ feed: 1, focus: 1, selection: 1 });
		expect(h.state).toMatchObject({
			feedSubscriptions: 2,
			feedUnsubscriptions: 1,
			focusSubscriptions: 2,
			selectionSubscriptions: 2,
		});
		h.emitFocus(context(h.ids, { pane: { paneId: "replacement", focused: true } }));
		expect(seen).toEqual(["replacement"]);
		second.dispose();
	});
});
