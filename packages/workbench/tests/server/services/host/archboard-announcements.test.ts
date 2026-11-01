import { describe, expect, test } from "bun:test";

import {
	createSemanticContextPublisher,
	type SemanticContextInput,
	type SettledChangeSourceEvent,
	type SettledSemanticChangeEvent,
} from "#runtime/api/semantic-context.ts";
import { encodeCanonicalContext } from "#runtime/rules/instructions/context.ts";
import { ARCHBOARD_CONTEXT_CODEC, workbenchContextOf } from "#runtime/services/host/archboard.ts";
import { canonicalContextFromBrief } from "#server/projections/semantic-context/semantic-input.ts";
import {
	boardChangeAnnouncement,
	paneAnnouncement,
} from "#server/services/host/archboard-announcements.ts";
import { parseTabSessionId } from "@archboard/codex-realtime-voice/server";
import { createIdentityAuthorities } from "@archboard/codex-app-server/identity";
import type { CoordinatorCallbackCanvas } from "#runtime/protocol/coordinator-callbacks/contract.ts";

// What Archboard announces of a board change and of a pane report (TASK-293, TASK-293.06,
// TASK-530.05): the words each model is told, whether a board is on screen, whether a narration
// stops for it, and the context a workhorse reads. How the voice agent delivers it is its own.

const TAB = parseTabSessionId("tab-1")!;
const NULL_OPERATION = { id: null, kind: null, rpc: null, outcome: null } as const;

const { identity } = createIdentityAuthorities();

/** One board, one pane, read under one workhorse. */
const INPUT: SemanticContextInput = {
	repository: "archboard",
	child: { id: identity.validator.childId, epoch: identity.validator.epoch },
	threadLink: { state: "executable", reason: null },
	workhorse: { threadId: identity.decoder.adoptThreadId("workhorse-1"), turnId: null },
	coordinator: {
		threadId: identity.decoder.adoptThreadId("coordinator-1"),
		realtimeSessionId: null,
	},
	board: {
		key: "architecture",
		name: "Architecture",
		vault: "/work/.archboard/vault",
		file: "boards/architecture.semantic.json",
		version: 7,
	},
	pane: { paneId: "pane-a", focused: true },
	architecture: {
		variant: { id: "v1", name: "Current", lifecycle: "current", against: null },
		view: null,
		selection: {
			count: 2,
			subjects: [
				{ kind: "node", id: "element-a", name: "Gateway" },
				{ kind: "edge", id: "element-b", name: null },
			],
		},
		differences: null,
		reconciliation: { required: false, count: 0, blockedBy: null, issues: [] },
	},
	claim: { holder: "agent", doing: "campaign: payments redesign" },
	doing: "mapping",
	cursor: null,
	description: "Architecture board",
};

/**
 * A publisher over INPUT, and the settled change it publishes for a write.
 * @param by The thread the write names, or null.
 * @param board The board it wrote.
 * @returns The publisher and the change.
 */
function sources(by: string | null = null, board = "architecture") {
	const listeners = new Set<(event: SettledChangeSourceEvent) => void>();
	const publisher = createSemanticContextPublisher({
		feed: {
			onChange(listener) {
				listeners.add(listener);
				return () => listeners.delete(listener);
			},
		},
		feedId: "feed-1",
		fresh: { read: () => INPUT },
		contextForChange: () => INPUT,
		now: () => 1_700_000_000_000,
	});
	let change: SettledSemanticChangeEvent | null = null;
	publisher.subscribeSettledChange((event) => {
		change = event;
	});
	for (const listener of listeners) {
		listener({
			cursor: 7,
			vault: INPUT.board.vault,
			board,
			at: "2023-11-14T22:13:20.000Z",
			origin: "agent",
			significance: "structural",
			text: "A structural change.",
			by,
		});
	}
	if (change === null) throw new Error("The settled change fixture failed.");
	return { publisher, change: change as SettledSemanticChangeEvent };
}

/**
 * A canvas that shows these boards, narrating one or none.
 * @param narrated The narrated board, or null.
 * @param boards The boards its panes show.
 * @returns The tab and its canvas.
 */
function tab(
	narrated: string | null = null,
	boards: readonly string[] = ["architecture"],
): { readonly id: typeof TAB; readonly canvas: CoordinatorCallbackCanvas } {
	return { id: TAB, canvas: { boards, narrated } };
}

/**
 * A reading report of INPUT that names what the user changed by hand.
 * @param userChanged What the pane marks as the user's own.
 * @param architecture What differs from the fixture's architecture.
 * @returns The report.
 */
function reading(
	userChanged: NonNullable<SemanticContextInput["pane"]["userChanged"]>,
	architecture: Partial<SemanticContextInput["architecture"]> = {},
) {
	return sources().publisher.publishPaneSelection({
		...INPUT,
		pane: { ...INPUT.pane, userChanged },
		architecture: { ...INPUT.architecture, ...architecture },
	});
}

/**
 * The words the voice is told of a change, or why nothing.
 * @param change The announced change.
 * @returns The words, or the withholding.
 */
function voiceOf(change: ReturnType<typeof paneAnnouncement>) {
	return change.voice;
}

/**
 * The words the voice is told of a change.
 * @param change The announced change.
 * @returns The words, or the empty string when it is told none.
 */
function voiceText(change: ReturnType<typeof paneAnnouncement>): string {
	return change.voice !== undefined && "text" in change.voice ? change.voice.text : "";
}

describe("a pane report", () => {
	test("a pick by hand tells the voice one quiet sentence of names, and the coordinator nothing", () => {
		const change = paneAnnouncement(reading(["selection"]), tab(), 1);

		expect(change).toMatchObject({ feed: expect.any(String), sequence: 1, topic: "selection" });
		expect(change.coordinator).toBeUndefined();
		const voice = voiceOf(change);
		if (voice === undefined || !("text" in voice)) throw new Error("The voice was told nothing.");
		expect(voice.speech).toBe(false);
		// Both the named and the unnamed subject are said, by name and by kind, never by id.
		expect(voice.text).toContain("Gateway");
		expect(voice.text).toContain("Architecture");
		expect(voice.text).not.toContain("element-");
		expect(voice.text).not.toContain("{");
	});

	test("a report nobody's hand caused tells nobody, and says it was an agent's", () => {
		const { publisher } = sources();
		const selection = paneAnnouncement(publisher.publishPaneSelection(INPUT), tab(), 1);
		const focus = paneAnnouncement(publisher.publishPaneFocus(INPUT), tab(), 2);

		for (const change of [selection, focus]) {
			expect(change.voice).toEqual({ withheld: "agent" });
			expect(change.coordinator).toBeUndefined();
		}
	});

	test("only the parts the user changed are said, and the board always is", () => {
		const view = { id: "w1", name: "Data flow", grammar: "sequence" as const };
		const text = voiceText(paneAnnouncement(reading(["view"], { view }), tab(), 1));

		expect(text).toContain("Data flow");
		expect(text).toContain("Architecture");
		expect(text).not.toContain("Gateway");
	});

	test("more subjects than can be said are counted, and an emptied selection is said too", () => {
		const subjects = ["Gateway", "Writer", "Ledger", "Queue", "Cache"].map((name, index) => ({
			kind: "node" as const,
			id: `n${index}`,
			name,
		}));
		const counted = voiceText(
			paneAnnouncement(reading(["selection"], { selection: { count: 5, subjects } }), tab(), 1),
		);
		const emptied = voiceText(
			paneAnnouncement(reading(["selection"], { selection: { count: 0, subjects: [] } }), tab(), 2),
		);

		expect(counted).toContain("Ledger");
		expect(counted).not.toContain("Queue");
		// How many were left unnamed is the fact; how it is worded is not held here.
		expect(counted).toMatch(/\b2\b/u);
		expect(emptied).toContain("Architecture");
		expect(emptied).not.toContain("Gateway");
	});

	test("the pane the user moved into is said, under its own topic", () => {
		const moved = sources().publisher.publishPaneFocus({
			...INPUT,
			pane: { ...INPUT.pane, userChanged: ["focus"] },
		});
		const change = paneAnnouncement(moved, tab(), 1);

		expect(change.topic).toBe("focus");
		expect(voiceText(change)).toContain("Architecture");
	});

	// A narration (TASK-293.05): a user who picks something out mid-talk is saying the talk did not
	// cover it, so the voice is asked to stop and check in.
	test("during a narration a pick, a view or a variant chosen by hand is speech, and outside one it is quiet", () => {
		const view = { id: "w1", name: "Data flow", grammar: "sequence" as const };
		const variant = { id: "v2", name: "Proposal", lifecycle: "draft" as const, against: null };
		const narrating = tab("architecture");
		const spoken = [
			reading(["selection"]),
			reading(["view"], { view }),
			reading(["variant"], { variant }),
		].map((event, sequence) => voiceOf(paneAnnouncement(event, narrating, sequence)));
		const quiet = voiceOf(paneAnnouncement(reading(["selection"]), tab(), 4));

		for (const voice of spoken) expect(voice).toMatchObject({ speech: true });
		expect(quiet).toMatchObject({ speech: false });
	});

	test("during a narration an emptied selection and a move between panes stay quiet", () => {
		const narrating = tab("architecture");
		const emptied = reading(["selection"], { selection: { count: 0, subjects: [] } });
		const moved = sources().publisher.publishPaneFocus({
			...INPUT,
			pane: { ...INPUT.pane, userChanged: ["focus"] },
		});

		expect(voiceOf(paneAnnouncement(emptied, narrating, 1))).toMatchObject({ speech: false });
		expect(voiceOf(paneAnnouncement(moved, narrating, 2))).toMatchObject({ speech: false });
	});

	test("an agent's show tells both models in words that do not credit the user, and is told once", () => {
		const shown = sources().publisher.publishPaneFocus({
			...INPUT,
			pane: { ...INPUT.pane, agentSwitch: { from: "Payments", by: "outside-thread" } },
		});
		const change = paneAnnouncement(shown, tab(), 1);

		expect(change.author).toBe("outside-thread");
		// What an agent did is never replaced by the next report.
		expect(change.topic).toBeUndefined();
		const sentence =
			change.coordinator !== undefined && "text" in change.coordinator
				? change.coordinator.text
				: "";
		expect(change.voice).toMatchObject({ text: sentence });
		expect(sentence).toContain("Payments");
		expect(sentence).toContain("Architecture");
		expect(sentence).not.toMatch(/\buser\b/u);
	});
});

describe("a settled board change", () => {
	test("both models are told another agent's write as one quiet sentence, under its writer", () => {
		const { change: event } = sources("another-agent-thread");
		const change = boardChangeAnnouncement(event, tab());

		expect(change).toMatchObject({ feed: "feed-1", sequence: 7, author: "another-agent-thread" });
		// Nothing an agent did is folded into the next.
		expect(change.topic).toBeUndefined();
		const sentence =
			change.coordinator !== undefined && "text" in change.coordinator
				? change.coordinator.text
				: "";
		expect(change.voice).toEqual({ text: sentence, speech: false });
		// The board by name and what the writer said it was doing; never an id, the envelope, or
		// the user as the one who did it.
		expect(sentence).toContain("Architecture");
		expect(sentence).toContain("mapping");
		expect(sentence).not.toContain("another-agent-thread");
		expect(sentence).not.toContain("{");
		expect(sentence).not.toMatch(/\buser\b/u);
	});

	test("a write to a board no pane of the canvas shows tells neither model", () => {
		const change = boardChangeAnnouncement(sources(null, "payments").change, tab());

		expect(change.voice).toEqual({ withheld: "not_shown" });
		expect(change.coordinator).toBeUndefined();
	});

	test("live writes stay quiet during captured narration, including the narrated model", () => {
		const narrating = tab("architecture", ["architecture", "ledger"]);

		expect(boardChangeAnnouncement(sources().change, narrating).voice).toMatchObject({
			speech: false,
		});
		expect(boardChangeAnnouncement(sources(null, "ledger").change, narrating).voice).toMatchObject({
			speech: false,
		});
	});

	test("an external edit updates both models without fabricated agent attribution", () => {
		const { change: original } = sources();
		const event: SettledSemanticChangeEvent = {
			...original,
			doing: null,
			origin: "external",
			change: { ...original.change, origin: "external", by: null },
		};
		const change = boardChangeAnnouncement(event, tab("architecture"));

		expect(change.author).toBeNull();
		expect(change.voice).toMatchObject({ speech: false });
		expect(change.coordinator).toEqual({ text: voiceText(change) });
		expect(voiceText(change)).toContain("Architecture");
		expect(voiceText(change)).not.toMatch(/\bagent\b/u);
		expect(voiceText(change)).not.toContain("mapping");
	});

	test("the workhorse of the board's checkout reads the same Archboard context bytes it always did", () => {
		const { change: event } = sources();
		const change = boardChangeAnnouncement(event, tab());
		const workhorse = change.workhorse;
		if (workhorse === undefined || !("text" in workhorse))
			throw new Error("The workhorse was told nothing.");
		const expected = canonicalContextFromBrief(event, event.pane.paneId, NULL_OPERATION);
		const { threadLink, child, coordinator } = workbenchContextOf(expected);
		const captured = {
			...workhorse.payload,
			threadLink,
			child,
			workhorse: expected.workhorse,
			coordinator,
			brief: {
				text: workhorse.text,
				capturedAtMs: change.capturedAtMs ?? 0,
				freshUntilMs: expected.semantic.freshUntilMs,
			},
			operation: NULL_OPERATION,
		};

		expect(workhorse.checkouts).toEqual(["/work"]);
		expect(ARCHBOARD_CONTEXT_CODEC.encode(captured)).toBe(encodeCanonicalContext(expected));
		// The focused pane, and the claim's campaign apart from this write's step.
		expect(expected.focus.paneId).toBe("pane-a");
		expect(expected.claim.doing).toBe("campaign: payments redesign");
	});

	test("a brief that went stale is withheld from the workhorse", () => {
		const { change: event } = sources();
		const stale = { ...event, staleness: { state: "stale" as const, reasons: ["board changed"] } };

		expect(boardChangeAnnouncement(stale, tab()).workhorse).toEqual({
			checkouts: ["/work"],
			withheld: "stale",
		});
	});
});
