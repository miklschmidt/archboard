import { describe, expect, test } from "bun:test";

import type { SemanticContextInput } from "#runtime/schemas/semantic-context-types.ts";
import {
	close,
	harness,
	semanticInput,
	type Harness,
} from "#tests/runtime/services/coordinator-callbacks/support.ts";

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
 * A reading report that names what the user changed by hand.
 * @param h - The harness.
 * @param userChanged - What the pane marks as the user's own.
 * @param architecture - What differs from the fixture's architecture.
 * @returns The published event.
 */
function reading(
	h: Harness,
	userChanged: NonNullable<SemanticContextInput["pane"]["userChanged"]>,
	architecture: Partial<SemanticContextInput["architecture"]> = {},
) {
	const base = semanticInput(h.ids, true);
	return h.semantic.publisher.publishPaneSelection(
		said(h, {
			pane: { ...base.pane, userChanged },
			architecture: { ...base.architecture, ...architecture },
		}),
	);
}

/**
 * An architecture with one subject selected.
 * @param id - Its id.
 * @param name - Its name.
 * @returns The part of the architecture that says so.
 */
function only(id: string, name: string): Pick<SemanticContextInput["architecture"], "selection"> {
	return { selection: { count: 1, subjects: [{ kind: "node", id, name }] } };
}

/**
 * The channel each append to the live voice session went down so far.
 * @param h - The harness.
 * @returns Each channel, in order.
 */
function channels(h: Harness): readonly string[] {
	return h.realtimeRequests.map((request) => request.channel);
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
		const [request] = h.realtimeRequests;
		expect(request?.channel === "context" ? request.params.role : null).toBe("developer");
		expect(h.reports).toHaveLength(0);
		close(h);
	});

	test("a report nobody's hand caused is recorded as an agent's and appended nowhere", async () => {
		const h = harness(true);
		const selection = await h.callbacks.enqueue(h.semantic.selection);
		const focus = await h.callbacks.enqueue(h.semantic.focus);

		for (const delivery of [selection, focus]) {
			expect(delivery.path).toBe("silent");
			expect(delivery.outcome).toBe("not_delivered");
			expect(delivery.reason).toBe("agent");
		}
		expect(appended(h)).toEqual([]);
		expect(h.reports).toHaveLength(0);
		close(h);
	});

	test("only the parts the user changed are said, and the board always is", async () => {
		const h = harness(true);
		const base = semanticInput(h.ids, true);
		const view = { id: "w1", name: "Data flow", grammar: "sequence" as const };
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
		expect(h.reports).toHaveLength(0);
		close(h);
	});

	// A narration (TASK-293.05): a user who picks something out mid-talk is saying the talk did not
	// cover it, so the voice is asked to stop and check in. Appended speech does not cut into audio
	// in progress (TASK-251, real voice), so the pause lands after the sentence being said.
	test("during a narration a pick, a view or a variant chosen by hand is speech, and outside one the same news is quiet", async () => {
		const h = harness(true);
		h.state.narrated = "architecture";
		const view = { id: "w1", name: "Data flow", grammar: "sequence" as const };
		const variant = { id: "v2", name: "Proposal", lifecycle: "draft" as const, against: null };
		// The fixture's clock stands still, so each report differs in what is selected to stay a
		// report of its own rather than a repeat of the one before.
		const picked = await h.callbacks.enqueue(reading(h, ["selection"]));
		await h.callbacks.enqueue(reading(h, ["view"], { view, ...only("element-c", "Writer") }));
		await h.callbacks.enqueue(reading(h, ["variant"], { variant, ...only("element-d", "Queue") }));
		h.state.narrated = null;
		const quiet = await h.callbacks.enqueue(reading(h, ["selection"], only("element-e", "Cache")));

		expect(picked.path).toBe("realtime_appendSpeech");
		expect(picked.outcome).toBe("delivered");
		expect(channels(h)).toEqual(["speech", "speech", "speech", "context"]);
		expect(quiet.path).toBe("realtime_appendText");
		const [pick, chosenView, chosenVariant] = appended(h);
		// Speech names the state like quiet news does: never an id, never the envelope.
		expect(pick).toContain("Gateway");
		expect(pick).not.toContain("element-");
		expect(pick).not.toContain("{");
		expect(chosenView).toContain("Data flow");
		expect(chosenVariant).toContain("Proposal");
		expect(h.reports).toHaveLength(0);
		close(h);
	});

	test("during a narration an emptied selection and a move between panes stay quiet, and a driven step appends nothing", async () => {
		const h = harness(true);
		h.state.narrated = "architecture";
		await h.callbacks.enqueue(reading(h, ["selection"], { selection: { count: 0, subjects: [] } }));
		const base = semanticInput(h.ids, true);
		await h.callbacks.enqueue(
			h.semantic.publisher.publishPaneFocus(
				said(h, { pane: { ...base.pane, userChanged: ["focus"] } }),
			),
		);
		// What a step lights up is the walkthrough's doing: the pane marks nothing.
		const driven = await h.callbacks.enqueue(reading(h, []));

		expect(channels(h)).toEqual(["context", "context"]);
		expect(driven.path).toBe("silent");
		expect(driven.reason).toBe("agent");
		close(h);
	});

	test("of several picks queued before the voice is told, only the latest is said", async () => {
		const h = harness(true);
		h.state.narrated = "architecture";
		const first = h.callbacks.enqueue(reading(h, ["selection"], only("element-c", "Writer")));
		const latest = h.callbacks.enqueue(reading(h, ["selection"]));

		expect((await first).reason).toBe("coalesced");
		expect((await latest).path).toBe("realtime_appendSpeech");
		expect(appended(h)).toHaveLength(1);
		expect(appended(h)[0]).toContain("Gateway");
		close(h);
	});
});
