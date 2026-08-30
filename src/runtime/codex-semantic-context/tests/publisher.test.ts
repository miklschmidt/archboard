import { describe, expect, test } from "bun:test";

import { CODEX_SEMANTIC_FRESHNESS_MS } from "../../../shared/timing/timing.ts";
import { createIdentityAuthority } from "../../../shared/codex-workbench-identity/index.ts";
import {
	createSemanticContextPublisher,
	SEMANTIC_CONTEXT_LIMITS,
	type SemanticContextInput,
	type SettledChangeSourceEvent,
} from "../index.ts";

function identities() {
	const authority = createIdentityAuthority();
	return {
		child: authority.validator.childId,
		epoch: authority.validator.epoch,
		thread: (raw: string) => authority.decoder.adoptThreadId(raw),
		turn: (raw: string) => authority.decoder.adoptTurnId(raw),
		realtimeSession: authority.issuer.mintRealtimeSessionId(),
	};
}

type Identities = ReturnType<typeof identities>;

function context(
	ids: Identities,
	overrides: Partial<SemanticContextInput> = {},
): SemanticContextInput {
	return {
		repository: "archboard",
		child: { id: ids.child, epoch: ids.epoch },
		threadLink: { state: "executable", reason: null },
		workhorse: { threadId: ids.thread("workhorse"), turnId: ids.turn("turn-1") },
		coordinator: {
			threadId: ids.thread("coordinator"),
			realtimeSessionId: ids.realtimeSession,
		},
		board: { key: "payments", note: "boards/payments.excalidraw.md", version: 7 },
		pane: { paneId: "pane-a", focused: true },
		selection: ["element-b", "element-a"],
		claim: { holder: "agent", doing: "mapping the board" },
		doing: "mapping the board",
		cursor: 3,
		description: "Payments board: checkout, ledger, and settlement boundaries.",
		ambiguity: [],
		...overrides,
	};
}

function change(
	now: number,
	overrides: Partial<SettledChangeSourceEvent> = {},
): SettledChangeSourceEvent {
	return {
		cursor: 3,
		board: "payments",
		at: new Date(now).toISOString(),
		origin: "human",
		significance: "structural",
		text: "A human settled a structural board change.",
		...overrides,
	};
}

function harness() {
	const ids = identities();
	const state = {
		now: 1_700_000_000_000,
		freshContext: context(ids),
		changeContext: context(ids),
		freshReads: 0,
		changeReads: 0,
		feedSubscriptions: 0,
		feedUnsubscriptions: 0,
		focusSubscriptions: 0,
		focusUnsubscriptions: 0,
		selectionSubscriptions: 0,
		selectionUnsubscriptions: 0,
	};
	const feedListeners = new Set<(event: SettledChangeSourceEvent) => void>();
	const focusListeners = new Set<(input: SemanticContextInput) => void>();
	const selectionListeners = new Set<(input: SemanticContextInput) => void>();
	const feed = {
		onChange(listener: (event: SettledChangeSourceEvent) => void) {
			state.feedSubscriptions++;
			feedListeners.add(listener);
			let active = true;
			return () => {
				if (!active) return;
				active = false;
				state.feedUnsubscriptions++;
				feedListeners.delete(listener);
			};
		},
	};
	const pane = {
		onFocus(listener: (input: SemanticContextInput) => void) {
			state.focusSubscriptions++;
			focusListeners.add(listener);
			let active = true;
			return () => {
				if (!active) return;
				active = false;
				state.focusUnsubscriptions++;
				focusListeners.delete(listener);
			};
		},
		onSelection(listener: (input: SemanticContextInput) => void) {
			state.selectionSubscriptions++;
			selectionListeners.add(listener);
			let active = true;
			return () => {
				if (!active) return;
				active = false;
				state.selectionUnsubscriptions++;
				selectionListeners.delete(listener);
			};
		},
	};
	const publisher = createSemanticContextPublisher({
		feed,
		feedId: "feed-1",
		pane,
		fresh: {
			read: () => {
				state.freshReads++;
				return state.freshContext;
			},
		},
		contextForChange: () => {
			state.changeReads++;
			return state.changeContext;
		},
		now: () => state.now,
	});
	return {
		ids,
		state,
		publisher,
		emitFeed: (event: SettledChangeSourceEvent) => {
			for (const listener of feedListeners) listener(event);
		},
		emitFocus: (input: SemanticContextInput) => {
			for (const listener of focusListeners) listener(input);
		},
		emitSelection: (input: SemanticContextInput) => {
			for (const listener of selectionListeners) listener(input);
		},
	};
}

describe("semantic context publisher", () => {
	test("publishes focus and selection immediately through independent ports", () => {
		const h = harness();
		const focus: unknown[] = [];
		const selection: unknown[] = [];
		const settled: unknown[] = [];
		h.publisher.subscribePaneFocus((event) => focus.push(event));
		h.publisher.subscribePaneSelection((event) => selection.push(event));
		h.publisher.subscribeSettledChange((event) => settled.push(event));

		h.emitFocus(context(h.ids, { pane: { paneId: "pane-b", focused: false } }));
		h.emitSelection(context(h.ids, { selection: ["selected-now"] }));
		h.emitFocus(context(h.ids, { pane: { paneId: "pane-c", focused: true } }));

		expect(focus).toHaveLength(2);
		expect(selection).toHaveLength(1);
		expect(settled).toHaveLength(0);
		expect((focus[0] as { kind: string; pane: { paneId: string } }).kind).toBe("pane_focus");
		expect((focus[0] as { pane: { paneId: string } }).pane.paneId).toBe("pane-b");
		expect((selection[0] as { kind: string; selection: string[] }).kind).toBe("pane_selection");
		expect((selection[0] as { selection: string[] }).selection).toEqual(["selected-now"]);
	});

	test("filters agent-only and cosmetic feed events while accepting human and mixed changes", () => {
		const h = harness();
		const settled: Array<{ origin: string; source: string; cursor: string | null }> = [];
		h.publisher.subscribeSettledChange((event) =>
			settled.push({ origin: event.origin ?? "none", source: event.source, cursor: event.cursor }),
		);

		h.emitFeed(change(h.state.now));
		h.emitFeed(change(h.state.now, { origin: "mixed" }));
		h.emitFeed(change(h.state.now, { origin: "agent" }));
		h.emitFeed(change(h.state.now, { significance: "cosmetic" }));

		expect(settled).toEqual([
			{ origin: "human", source: "settled_change", cursor: "feed-1:3" },
			{ origin: "mixed", source: "settled_change", cursor: "feed-1:3" },
		]);
		expect(h.state.changeReads).toBe(2);
	});

	test("includes the canonical identity fields and keeps each published event immutable", () => {
		const h = harness();
		let published: ReturnType<typeof h.publisher.publishPaneFocus> | undefined;
		h.publisher.subscribePaneFocus((event) => {
			published = event;
		});

		const returned = h.publisher.publishPaneFocus(context(h.ids));

		expect(published).toBe(returned);
		expect(returned).toMatchObject({
			kind: "pane_focus",
			source: "pane_focus",
			feedId: "feed-1",
			repository: "archboard",
			board: { key: "payments", note: "boards/payments.excalidraw.md" },
			version: 7,
			pane: { paneId: "pane-a", focused: true },
			cursor: "feed-1:3",
			freshness: { state: "fresh", capturedAtMs: h.state.now },
			child: { id: h.ids.child, epoch: h.ids.epoch },
			workhorse: { threadId: h.ids.thread("workhorse"), turnId: h.ids.turn("turn-1") },
			coordinator: {
				threadId: h.ids.thread("coordinator"),
				realtimeSessionId: h.ids.realtimeSession,
			},
			claim: { holder: "agent", doing: "mapping the board" },
			doing: "mapping the board",
		});
		expect(returned.brief).toContain('"description":"Payments board');
		expect(Object.isFrozen(returned)).toBe(true);
		expect(Object.isFrozen(returned.selection)).toBe(true);
		expect(Object.isFrozen(returned.freshness)).toBe(true);
		expect(Object.isFrozen(returned.staleness)).toBe(true);
		const before = returned.selection;
		expect(() => (before as string[]).push("not-published")).toThrow();
		expect(returned.selection).toEqual(["element-a", "element-b"]);
	});

	test("reads a fresh brief on demand, never on construction, and renders deterministically", () => {
		const h = harness();
		expect(h.state.freshReads).toBe(0);
		const first = h.publisher.freshBrief();
		const second = h.publisher.freshBrief();

		expect(h.state.freshReads).toBe(2);
		expect(first.kind).toBe("fresh_brief");
		expect(first.brief).toBe(second.brief);
		expect(first.bytes).toBe(new TextEncoder().encode(first.brief).byteLength);
	});

	test("bounds selection, ambiguity, description, and the serialized brief with a truncation marker", () => {
		const h = harness();
		const selection = Array.from({ length: 200 }, (_, index) => `${index}-`.repeat(40));
		const ambiguity = Array.from({ length: 20 }, (_, index) => `${index}: `.repeat(100));
		const description = "界".repeat(6_000);
		const originalSelectionLength = selection.length;
		const event = h.publisher.publishPaneSelection(
			context(h.ids, { selection, ambiguity, description }),
		);

		expect(event.truncated).toBe(true);
		expect(event.selection.length).toBeLessThanOrEqual(SEMANTIC_CONTEXT_LIMITS.selectionEntries);
		expect(event.ambiguity.length).toBeLessThanOrEqual(SEMANTIC_CONTEXT_LIMITS.ambiguityEntries);
		expect(
			event.selection.every(
				(id) => new TextEncoder().encode(id).byteLength <= SEMANTIC_CONTEXT_LIMITS.selectionIdBytes,
			),
		).toBe(true);
		expect(
			event.ambiguity.every(
				(reason) =>
					new TextEncoder().encode(reason).byteLength <= SEMANTIC_CONTEXT_LIMITS.ambiguityBytes,
			),
		).toBe(true);
		expect(new TextEncoder().encode(event.description).byteLength).toBeLessThanOrEqual(
			SEMANTIC_CONTEXT_LIMITS.descriptionBytes,
		);
		expect(new TextEncoder().encode(event.brief).byteLength).toBeLessThanOrEqual(
			SEMANTIC_CONTEXT_LIMITS.briefBytes,
		);
		expect(event.brief).toContain("…");
		expect(selection).toHaveLength(originalSelectionLength);
	});

	test("marks stale and ambiguous settled context instead of hiding identity disagreement", () => {
		const h = harness();
		h.state.now += CODEX_SEMANTIC_FRESHNESS_MS + 1;
		const stale: Array<{ freshness: string; staleness: string; reasons: readonly string[] }> = [];
		h.publisher.subscribeSettledChange((event) =>
			stale.push({
				freshness: event.freshness.state,
				staleness: event.staleness.state,
				reasons: event.staleness.reasons,
			}),
		);
		h.emitFeed(change(h.state.now - CODEX_SEMANTIC_FRESHNESS_MS - 1));
		h.emitFeed(change(h.state.now, { board: "other-board", at: "not-a-date" }));

		expect(stale[0]).toMatchObject({ freshness: "stale", staleness: "stale" });
		expect(stale[0]?.reasons).toContain("semantic freshness window expired");
		expect(stale[1]?.reasons.join(" ")).toContain("settled event names board");
	});

	test("deduplicates listeners and removes every source subscription exactly once on dispose", () => {
		const h = harness();
		let calls = 0;
		const listener = () => {
			calls++;
		};
		h.publisher.subscribePaneFocus(listener);
		h.publisher.subscribePaneFocus(listener);
		h.emitFocus(context(h.ids));
		expect(calls).toBe(1);
		expect(h.state).toMatchObject({
			feedSubscriptions: 1,
			focusSubscriptions: 1,
			selectionSubscriptions: 1,
			feedUnsubscriptions: 0,
		});

		h.publisher.dispose();
		h.publisher.dispose();
		expect(h.state).toMatchObject({
			feedUnsubscriptions: 1,
			focusUnsubscriptions: 1,
			selectionUnsubscriptions: 1,
		});
		h.emitFocus(context(h.ids));
		expect(calls).toBe(1);
		expect(() => h.publisher.freshBrief()).toThrow("disposed");
	});
});
