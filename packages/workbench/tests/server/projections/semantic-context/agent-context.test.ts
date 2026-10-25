// What an agent is actually told about a board, and what it is told to do next.
//
// Two things are proved here and nothing else. A question asked about something
// on a screen reaches the agent as identities the board answers to — the same
// ids an edit or a resolution takes — rather than as anything that was drawn.
// And an edit that landed and left a proposal in disagreement reaches the agent
// as the store's own repair instruction, so it settles the disagreement instead
// of replaying an edit that has already been applied (ADR 0023, TASK-179).

import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canonicalContextFromBrief } from "#server/projections/semantic-context/semantic-input.ts";
import { semanticBoardContext } from "#server/projections/semantic-context/board-context.ts";
import {
	writeSemanticBoard,
	createBoardTransition,
	branchVariantTransition,
	editVariantTransition,
} from "@archboard/board/store-write";
import { readSemanticBoard } from "@archboard/board/store-read";
import { semanticBoardAddress } from "@archboard/board/address";
import {
	BoardCreateInputSchema,
	BoardBranchInputSchema,
	VariantEditInputSchema,
} from "@archboard/board/commands";
import { type SemanticBoard, findVariant, currentVariant } from "@archboard/board/document";
import { findView } from "@archboard/board/views";
import type { SemanticPaneContextSchema } from "@archboard/board/pane-context";
import type { z } from "zod";

type SemanticPaneContext = z.infer<typeof SemanticPaneContextSchema>;

const vault = mkdtempSync(join(tmpdir(), "archboard-agent-context-"));

const writer = { kind: "agent" as const };
const BOARD = "Ingest pipeline";
const PROPOSAL = "Queued ingest";
/** How many reports the fixture pane has sent, so each one is later than the last. */
let reported = 0;

beforeAll(async () => {
	await writeSemanticBoard({
		vault,
		board: BOARD,
		writer,
		transition: createBoardTransition(
			BoardCreateInputSchema.parse({
				name: BOARD,
				level: "system",
				nodes: [
					{ name: "Gateway", kind: "service", responsibility: "Takes the request" },
					{ name: "Orders", kind: "service" },
				],
				edges: [{ from: "Gateway", to: "Orders", kind: "http", label: "places" }],
				views: [
					{
						name: "Gateway only",
						grammar: "architecture",
						scope: { kind: "selection", nodes: ["Gateway"] },
					},
				],
			}),
		),
	});
});
afterAll(() => {
	rmSync(vault, { recursive: true, force: true });
});

/**
 * The board as it now stands.
 * @returns The board.
 */
function board(): SemanticBoard {
	const answer = readSemanticBoard(vault, BOARD);
	if (!answer.ok) {
		throw new Error(answer.problem);
	}
	return answer.board;
}

/**
 * A pane report naming one variant and one selection.
 * @param variant The variant the pane says it is showing, or null when it has
 * not drawn yet — which is a different thing from the current one.
 * @param selection The ids the person picked out.
 * @returns The report.
 */
function reading(
	variant: string | null,
	selection: readonly string[],
	viewId: string | null = null,
): SemanticPaneContext {
	const found = variant === null ? null : findVariant(board(), variant);
	const view = viewId === null ? undefined : findView(board(), viewId);
	reported += 1;
	return {
		paneId: "pane-a",
		clientId: "client-a",
		board: semanticBoardAddress(BOARD),
		variant:
			found === undefined || found === null
				? null
				: { id: found.id, name: found.name, lifecycle: found.lifecycle },
		view: view === undefined ? null : { id: view.id, name: view.name, grammar: view.grammar },
		selection: selection.map((id) => ({ id })),
		version: board().version,
		at: new Date().toISOString(),
		sequence: reported,
	};
}

/**
 * The name of the variant a pane is showing when it is showing the current one.
 * @returns The variant name.
 */
function showing(): string {
	const current = currentVariant(board());
	if (current === undefined) {
		throw new Error("the board has no current variant");
	}
	return current.name;
}

/**
 * The id of one node of the current variant, by name.
 * @param name The node's name.
 * @returns Its id.
 */
function nodeId(name: string): string {
	const variant = currentVariant(board());
	const node = variant?.content.nodes.find((candidate) => candidate.name === name);
	if (node === undefined) {
		throw new Error(`no node called ${name}`);
	}
	return node.id;
}

test("a selected id reaches the agent as the subject the board answers to", () => {
	const gateway = nodeId("Gateway");
	const context = semanticBoardContext(board(), reading(showing(), [gateway]));

	expect(context.architecture.selection).toEqual({
		count: 1,
		subjects: [{ kind: "node", id: gateway, name: "Gateway" }],
	});
	expect(context.architecture.variant?.lifecycle).toBe("current");
	expect(context.ambiguity).toEqual([]);
	// Nothing about the picture reaches the agent: the whole context is names,
	// identities and counts, and a coordinate could not survive a round trip
	// through it even if something upstream produced one.
	expect(JSON.stringify(context)).not.toContain('"x"');
	expect(JSON.stringify(context)).not.toContain('"width"');
});

test("the pane's own idea of what an id is never overrules the board", () => {
	const gateway = nodeId("Gateway");
	const misreported: SemanticPaneContext = {
		...reading(showing(), []),
		selection: [{ id: gateway, kind: "flow", name: "Something else entirely" }],
	};

	const context = semanticBoardContext(board(), misreported);

	expect(context.architecture.selection).toEqual({
		count: 1,
		subjects: [{ kind: "node", id: gateway, name: "Gateway" }],
	});
});

test("an id the variant no longer holds is reported rather than passed on", () => {
	const context = semanticBoardContext(board(), reading(showing(), ["ZZZZ"]));

	expect(context.architecture.selection.subjects).toEqual([]);
	expect(context.ambiguity).toHaveLength(1);
	expect(context.ambiguity[0]).toContain("ZZZZ");
});

test("a joined line picked in the overview reaches the agent as every relationship it joins", async () => {
	const joined = "Joined pipeline";
	await writeSemanticBoard({
		vault,
		board: joined,
		writer,
		transition: createBoardTransition(
			BoardCreateInputSchema.parse({
				name: joined,
				level: "system",
				nodes: [
					{ name: "Platform", kind: "service" },
					{ name: "Router", kind: "module", parent: "Platform" },
					{ name: "Audit", kind: "module", parent: "Platform" },
					{ name: "Orders", kind: "service" },
				],
				edges: [
					{ from: "Router", to: "Orders", kind: "call", label: "places" },
					{ from: "Audit", to: "Orders", kind: "call", label: "records" },
				],
			}),
		),
	});
	const read = readSemanticBoard(vault, joined);
	if (!read.ok) throw new Error(read.problem);
	const variant = currentVariant(read.board)!;
	const [places, records] = variant.content.edges;
	const pane = (view: string | null): SemanticPaneContext => ({
		...reading(null, [places!.id]),
		board: semanticBoardAddress(joined),
		variant: { id: variant.id, name: variant.name, lifecycle: variant.lifecycle },
		view: view === null ? null : { id: view, name: view, grammar: "architecture" },
		version: read.board.version,
	});

	expect(semanticBoardContext(read.board, pane(null)).architecture.selection).toEqual({
		count: 2,
		subjects: [
			{ kind: "edge", id: places!.id, name: "places" },
			{ kind: "edge", id: records!.id, name: "records" },
		],
	});
	// Everything draws each relationship, so the same id is the one relationship.
	expect(semanticBoardContext(read.board, pane("Everything")).architecture.selection).toEqual({
		count: 1,
		subjects: [{ kind: "edge", id: places!.id, name: "places" }],
	});
});

test("a proposal reaches the agent with its differences derived, not authored", async () => {
	await writeSemanticBoard({
		vault,
		board: BOARD,
		writer,
		expectedVersion: board().version,
		transition: branchVariantTransition(
			BoardBranchInputSchema.parse({
				from: currentVariant(board())?.name ?? "",
				name: PROPOSAL,
			}),
		),
	});
	await writeSemanticBoard({
		vault,
		board: BOARD,
		writer,
		expectedVersion: board().version,
		transition: editVariantTransition(
			VariantEditInputSchema.parse({
				variant: PROPOSAL,
				nodes: [{ name: "Queue", kind: "queue" }],
			}),
		),
	});

	const context = semanticBoardContext(board(), reading(PROPOSAL, []));
	const differences = context.architecture.differences;

	expect(context.architecture.variant?.name).toBe(PROPOSAL);
	expect(context.architecture.variant?.against).toBe(currentVariant(board())?.id);
	expect(differences?.added).toBe(1);
	expect(differences?.subjects).toContainEqual({
		change: "added",
		kind: "node",
		id: expect.any(String),
		name: "Queue",
	});

	const shared = board().views[0];
	if (shared === undefined) throw new Error("Expected the shared Gateway only view");
	const throughView = semanticBoardContext(board(), reading(PROPOSAL, [], shared.id));
	expect(throughView.architecture.view).toEqual({
		id: shared.id,
		name: "Gateway only",
		grammar: "architecture",
	});
});

test("an edit that landed and left a proposal in disagreement carries its repair", async () => {
	const gateway = nodeId("Gateway");
	// The proposal renames the node one way and the state it came from renames
	// it another. The second write is the one that lands and leaves work behind.
	await writeSemanticBoard({
		vault,
		board: BOARD,
		writer,
		expectedVersion: board().version,
		transition: editVariantTransition(
			VariantEditInputSchema.parse({
				variant: PROPOSAL,
				nodes: [{ id: gateway, name: "Public API", kind: "service" }],
			}),
		),
	});
	const landed = await writeSemanticBoard({
		vault,
		board: BOARD,
		writer,
		expectedVersion: board().version,
		transition: editVariantTransition(
			VariantEditInputSchema.parse({
				variant: currentVariant(board())?.name ?? "",
				nodes: [{ id: gateway, name: "Front door", kind: "service" }],
			}),
		),
	});

	expect(landed.outcome).toBe("applied");
	const conflicted =
		landed.outcome === "applied"
			? landed.descendants.filter((descendant) => descendant.outcome === "conflicted")
			: [];
	expect(conflicted).toHaveLength(1);

	const context = semanticBoardContext(board(), reading(PROPOSAL, [gateway]));
	const issue = context.architecture.reconciliation.issues[0];

	expect(context.architecture.reconciliation.required).toBe(true);
	expect(context.architecture.reconciliation.count).toBe(1);
	expect(context.architecture.reconciliation.issues).toHaveLength(1);
	expect(issue?.subject).toBe(gateway);
	expect(issue?.field).toBe("name");
	expect(issue?.kind).toBe("competing-field");
	// The store's own sentence, carried rather than reworded: it is what says
	// that answering this is a decision and not a retry.
	expect(issue?.repair).toBe(conflicted[0]?.issues[0]?.repair);
	expect(issue?.repair).toContain("name");
});

test("the context an operation delivers is the board's grounding, not a summary of it", async () => {
	const { createIdentityAuthority } = await import("@archboard/codex-app-server/identity");
	const { createSemanticContextPublisher } =
		await import("#runtime/operations/semantic-context-publisher.ts");
	const authority = createIdentityAuthority();
	const gateway = nodeId("Front door");
	const read = semanticBoardContext(board(), reading(PROPOSAL, [gateway]));
	const input = {
		repository: vault,
		child: { id: authority.validator.childId, epoch: authority.validator.epoch },
		threadLink: { state: "executable" as const, reason: null },
		workhorse: { threadId: authority.decoder.adoptThreadId("workhorse"), turnId: null },
		coordinator: { threadId: null, realtimeSessionId: null },
		board: {
			key: BOARD.toLowerCase(),
			name: BOARD,
			vault,
			file: join(vault, `${BOARD}.semantic.json`),
			version: board().version,
		},
		pane: { paneId: "pane-a", focused: true },
		architecture: read.architecture,
		claim: { holder: "agent" as const, doing: "settling the rename" },
		doing: "settling the rename",
		cursor: null,
		description: read.description,
		ambiguity: read.ambiguity,
	};
	const publisher = createSemanticContextPublisher({
		feed: { onChange: () => () => undefined },
		feedId: "feed-a",
		fresh: { read: () => input },
		contextForChange: () => input,
	});

	const context = canonicalContextFromBrief(publisher.freshBrief(), "pane-a", {
		id: null,
		kind: null,
		rpc: null,
		outcome: null,
	});
	publisher.dispose();

	expect(context.board.name).toBe(BOARD);
	expect(context.variant?.name).toBe(PROPOSAL);
	expect(context.selection.subjects).toEqual([{ kind: "node", id: gateway, name: "Public API" }]);
	expect(context.selection.count).toBe(1);
	// The agent is told there is something to settle and what settling it means,
	// in the same breath as what is selected. It never has to parse the brief to
	// find either, and neither of them is a thing that was drawn.
	expect(context.reconciliation.required).toBe(true);
	expect(context.reconciliation.issues[0]?.subject).toBe(gateway);
	expect(context.reconciliation.issues[0]?.field).toBe("name");
});

test("the description reads as sentences, because a coordinator says it out loud", async () => {
	const unterminated = "What the pipeline becomes once a board is meaning rather than a drawing";
	await writeSemanticBoard({
		vault,
		board: BOARD,
		writer,
		expectedVersion: board().version,
		transition: branchVariantTransition(
			BoardBranchInputSchema.parse({
				from: currentVariant(board())?.name ?? "",
				name: "Narrated",
				summary: unterminated,
			}),
		),
	});

	const context = semanticBoardContext(board(), reading("Narrated", []));

	expect(context.description).toContain(`${unterminated}. Its nodes are`);
	expect(context.description).not.toContain(`${unterminated} Its nodes`);
});

test("a report about the board the pane just left grounds nothing", async () => {
	const gateway = nodeId("Front door");
	const elsewhere: SemanticPaneContext = {
		...reading(showing(), [gateway]),
		board: { name: "Another board", key: "another board" },
	};

	const context = semanticBoardContext(board(), elsewhere);

	// The ids might well resolve against this board and mean something else, so
	// none of them is used: what a person pointed at in one architecture is not
	// a fact about another.
	expect(context.architecture.selection.subjects).toEqual([]);
	// What is left is the board's own truth. A session is told about every board
	// it has been told about, whatever anybody is looking at, so a pane reading
	// something else cannot leave the news contentless — it means there is no
	// presentation to report, which is what the words say.
	expect(context.architecture.variant?.name).toBe(showing());
	expect(context.description).toContain("Nothing on screen is reading");
	expect(context.ambiguity.join(" ")).toContain("different architecture");
	await Promise.resolve();
});

test("a board nobody is looking at is described without a selection being invented", () => {
	// The case the delivery rule turns on. A session hears every board update
	// except its own writes, so a change arrives whether or not a pane is
	// showing that board — and when none is, there is no presentation to report.
	// What must not happen is the context borrowing one: a selection is a person
	// pointing at something in one architecture, and it is not a fact about
	// another.
	const context = semanticBoardContext(board(), null);

	expect(context.architecture.selection).toEqual({ count: 0, subjects: [] });
	expect(context.architecture.variant?.lifecycle).toBe("current");
	expect(context.ambiguity).toEqual([]);
	// And the board itself is still described, because that is what the change
	// was about: the agent is told what it says now, with nothing attributed to
	// a pane that was looking elsewhere or had been closed.
	expect(context.description).toContain("Nothing on screen is reading");
	expect(context.architecture.variant?.name).toBe(showing());
});
