import { describe, expect, test } from "bun:test";

import type { SemanticContextInput } from "@/runtime/codex-semantic-context";
import {
	close,
	harness,
	semanticInput,
	type Harness,
} from "@/runtime/codex-coordinator-callbacks/tests/support";

// Pane news (TASK-293): what the live voice session is appended when a pane reports. What these
// catch is the loop of 2026-09-20 coming back (a report nobody's hand caused reaching the voice
// model) and the machine envelope reaching a speech model at all.

/**
 * A pane report's context, with what the pane says the user changed.
 * @param h - The harness whose identities the context carries.
 * @param changes - What differs from the fixture's context.
 * @returns The context.
 */
function said(h: Harness, changes: Partial<SemanticContextInput>): SemanticContextInput {
	return { ...semanticInput(h.ids, true), ...changes };
}

/**
 * The texts appended to the live voice session so far.
 * @param h - The harness.
 * @returns Each appended text.
 */
function appended(h: Harness): readonly string[] {
	return h.realtimeRequests.map((request) => request.params.text);
}

describe("pane news", () => {
	test("a pick by hand appends one sentence of names and nothing a machine wrote", async () => {
		const h = harness(true);
		const base = semanticInput(h.ids, true);
		const event = h.semantic.publisher.publishPaneSelection(
			said(h, { pane: { ...base.pane, userChanged: ["selection"] } }),
		);
		const delivery = await h.callbacks.enqueue(event);

		expect(delivery.outcome).toBe("delivered");
		expect(delivery.path).toBe("realtime_appendText");
		const [text] = appended(h);
		expect(appended(h)).toHaveLength(1);
		// Both the named and the unnamed subject are said, by name and by kind, never by id.
		expect(text).toContain("Gateway");
		expect(text).toContain("Architecture");
		expect(text).not.toContain("element-");
		expect(text).not.toContain("{");
		expect(h.realtimeRequests[0]?.params.role).toBe("developer");
		expect(h.injections).toHaveLength(0);
		close(h);
	});

	test("a report nobody's hand caused is recorded as an agent's and appended nowhere", async () => {
		const h = harness(true);
		const selection = await h.callbacks.enqueue(h.semantic.selection);
		const focus = await h.callbacks.enqueue(h.semantic.focus);
		const change = await h.callbacks.enqueue(h.semantic.change);

		for (const delivery of [selection, focus, change]) {
			expect(delivery.path).toBe("silent");
			expect(delivery.outcome).toBe("not_delivered");
			expect(delivery.reason).toBe("agent");
		}
		expect(appended(h)).toEqual([]);
		expect(h.injections).toHaveLength(0);
		close(h);
	});

	test("only the parts the user changed are said, and the board always is", async () => {
		const h = harness(true);
		const base = semanticInput(h.ids, true);
		const view = { id: "w1", name: "Data flow", grammar: "data-flow" as const };
		const event = h.semantic.publisher.publishPaneSelection(
			said(h, {
				pane: { ...base.pane, userChanged: ["view"] },
				architecture: { ...base.architecture, view },
			}),
		);
		await h.callbacks.enqueue(event);

		const [text] = appended(h);
		expect(text).toContain("Architecture");
		expect(text).toContain("Data flow");
		// The selection did not change by hand, so it is not part of the news.
		expect(text).not.toContain("Gateway");
		close(h);
	});

	test("more subjects than can be said are counted, and an emptied selection is said too", async () => {
		const h = harness(true);
		const base = semanticInput(h.ids, true);
		const subjects = ["Gateway", "Writer", "Ledger", "Queue", "Cache"].map((name, index) => ({
			kind: "node" as const,
			id: `n${index}`,
			name,
		}));
		const pane = { ...base.pane, userChanged: ["selection" as const] };
		const many = h.semantic.publisher.publishPaneSelection(
			said(h, {
				pane,
				architecture: { ...base.architecture, selection: { count: 5, subjects } },
			}),
		);
		await h.callbacks.enqueue(many);
		const none = h.semantic.publisher.publishPaneSelection(
			said(h, {
				pane,
				architecture: { ...base.architecture, selection: { count: 0, subjects: [] } },
			}),
		);
		await h.callbacks.enqueue(none);

		const [counted, emptied] = appended(h);
		expect(counted).toContain("Ledger");
		expect(counted).not.toContain("Queue");
		// How many were left unnamed is the fact; how it is worded is not held here.
		expect(counted).toMatch(/\b2\b/);
		// Otherwise "this" goes on meaning what was selected before.
		expect(emptied).toContain("Architecture");
		expect(emptied).not.toContain("Gateway");
		close(h);
	});

	test("the pane the user moved into is said, and only when their hand moved the focus", async () => {
		const h = harness(true);
		const base = semanticInput(h.ids, true);
		const moved = h.semantic.publisher.publishPaneFocus(
			said(h, { pane: { ...base.pane, userChanged: ["focus"] } }),
		);
		await h.callbacks.enqueue(moved);
		// A pane an agent pointed at another board publishes a focus event nobody's hand made.
		await h.callbacks.enqueue(h.semantic.publisher.publishPaneFocus(said(h, {})));

		expect(appended(h)).toHaveLength(1);
		expect(appended(h)[0]).toContain("Architecture");
		close(h);
	});

	test("with no voice session nothing is sent anywhere, whoever changed the pane", async () => {
		const h = harness(false);
		const base = semanticInput(h.ids, false);
		const event = h.semantic.publisher.publishPaneSelection({
			...base,
			pane: { ...base.pane, userChanged: ["selection"] },
		});
		const delivery = await h.callbacks.enqueue(event);

		expect(delivery.path).toBe("silent");
		expect(delivery.reason).toBe("voice_inactive");
		expect(h.realtimeRequests).toHaveLength(0);
		expect(h.injections).toHaveLength(0);
		close(h);
	});
});
