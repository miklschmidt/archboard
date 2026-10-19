import { afterAll, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as store from "@/runtime/semantic-board-store/index";
import {
	BoardCreateInputSchema,
	BoardBranchInputSchema,
	VariantEditInputSchema,
} from "@archboard/board/board-input";
import { everyStep, stepWords } from "@archboard/board/flow-steps";
import { type FlowStep } from "@archboard/board/views";
import { type ReconciliationIssue } from "@archboard/board/reconciliation";
import { ResolutionInputSchema } from "@archboard/board/resolution-input";

// Moving a flow's existing steps into a new decision or loop on one variant,
// carried down a chain of drafts (TASK-484). Each draft either ends up telling
// the same steps in the same order and nesting, or holds a competing-order
// disagreement that names the flow: never an order nobody wrote.

const vault = mkdtempSync(join(tmpdir(), "archboard-flow-logic-propagation-"));
const writer = { kind: "agent" as const };

const CHILD = "Cached reads";
const GRANDCHILD = "Cached and audited";
let board = "";
let boards = 0;
let root = "";

beforeEach(async () => {
	boards += 1;
	board = `flow-logic-${boards}`;
	await write(
		store.createBoardTransition(
			BoardCreateInputSchema.parse({
				name: board,
				level: "system",
				nodes: [
					{ name: "API", kind: "service" },
					{ name: "Store", kind: "datastore" },
					{ name: "Clock", kind: "service" },
				],
				flows: [
					{
						name: "Serve a page",
						participants: ["API", "Store"],
						steps: ["open", "read", "parse", "reply"].map(fresh),
					},
				],
			}),
		),
	);
	root = read().variants[0]!.name;
	await branch(root, CHILD);
	await branch(CHILD, GRANDCHILD);
});
afterAll(() => {
	rmSync(vault, { recursive: true, force: true });
});

/**
 * Write one transition at the board's current version.
 * @param transition What to write.
 * @returns What the write did.
 */
async function write(transition: store.SemanticTransition) {
	const existing = store.readSemanticBoard(vault, board);
	return store.writeSemanticBoard({
		vault,
		board,
		writer,
		transition,
		...(existing.ok ? { expectedVersion: existing.board.version } : {}),
	});
}

/**
 * The board as it now stands.
 * @returns The board.
 */
function read() {
	const answer = store.readSemanticBoard(vault, board);
	if (!answer.ok) throw new Error(answer.problem);
	return answer.board;
}

/**
 * One variant, by name.
 * @param name What it is called.
 * @returns The variant.
 */
function variant(name: string) {
	const found = read().variants.find((one) => one.name === name);
	if (found === undefined) throw new Error(`no variant called ${name}`);
	return found;
}

/**
 * Derive a proposal from a variant.
 * @param from The variant to derive from.
 * @param name What to call the proposal.
 */
async function branch(from: string, name: string) {
	await write(store.branchVariantTransition(BoardBranchInputSchema.parse({ from, name })));
}

/**
 * A new message from the API to the store.
 * @param label What it says.
 * @returns The stated step.
 */
function fresh(label: string) {
	return { from: "API", to: "Store", label };
}

/**
 * A message the flow already tells, under its own id.
 * @param label What it says now.
 * @param was What it said when the board was created; the same by default.
 * @returns The stated step.
 */
function kept(label: string, was = label) {
	const step = everyStep(variant(root).content.flows[0]!.steps).find(
		(one) => stepWords(one) === was,
	);
	if (step === undefined) throw new Error(`no step "${was}"`);
	return { ...fresh(label), id: step.id };
}

/**
 * A decision on whether the page is cached.
 * @param yes The steps when it is.
 * @param no The steps when it is not.
 * @returns The stated step.
 */
function cached(yes: readonly unknown[], no: readonly unknown[]) {
	return {
		kind: "decision",
		question: "cached?",
		alternatives: [
			{ label: "yes", steps: yes },
			{ label: "no", steps: no },
		],
	};
}

/**
 * A loop over the pages.
 * @param steps The steps it repeats.
 * @returns The stated step.
 */
function eachPage(steps: readonly unknown[]) {
	return { kind: "loop", condition: "each page", steps };
}

/**
 * Tell the flow again on one variant.
 * @param on The variant.
 * @param steps Its steps.
 */
async function retell(on: string, steps: readonly unknown[]) {
	const flow = variant(on).content.flows[0]!;
	const written = await write(
		store.editVariantTransition(
			VariantEditInputSchema.parse({
				variant: on,
				flows: [{ id: flow.id, name: flow.name, participants: ["API", "Store"], steps }],
			}),
		),
	);
	if (written.outcome === "rejected") throw new Error(written.problem);
}

/** A step tree by its words: a message's label, a holder's words over what it holds. */
type Outline = string | { readonly [words: string]: Outline[] | Record<string, Outline[]> };

/**
 * A flow's steps by their words, nesting and all.
 * @param steps The steps.
 * @returns The outline.
 */
function outline(steps: readonly FlowStep[]): Outline[] {
	return steps.map((step) => {
		if (step.kind === "decision") {
			return {
				[step.question]: Object.fromEntries(
					step.alternatives.map((one) => [one.label, outline(one.steps)]),
				),
			};
		}
		return step.kind === "loop" ? { [step.condition]: outline(step.steps) } : step.label;
	});
}

/**
 * How one variant tells the flow.
 * @param name The variant.
 * @returns The outline of its steps.
 */
function told(name: string): Outline[] {
	return outline(variant(name).content.flows[0]!.steps);
}

test("steps moved into a new decision reach a child and a grandchild in their order", async () => {
	// The child rewords the reply; the grandchild logs right after opening.
	await retell(CHILD, [kept("open"), kept("read"), kept("parse"), kept("answer", "reply")]);
	await retell(GRANDCHILD, [
		kept("open"),
		fresh("log"),
		kept("read"),
		kept("parse"),
		kept("answer", "reply"),
	]);

	await retell(root, [
		kept("open"),
		cached([kept("read"), kept("parse")], [fresh("fetch")]),
		kept("reply"),
	]);

	const decision = { "cached?": { yes: ["read", "parse"], no: ["fetch"] } };
	expect(variant(CHILD).reconciliation).toBeUndefined();
	expect(told(CHILD)).toEqual(["open", decision, "answer"]);
	expect(variant(GRANDCHILD).reconciliation).toBeUndefined();
	expect(told(GRANDCHILD)).toEqual(["open", "log", decision, "answer"]);
}, 30_000);

test("steps moved into a new loop after another step reach the drafts in their order", async () => {
	// The child adds an audit at the end; the grandchild changes nothing.
	await retell(CHILD, [kept("open"), kept("read"), kept("parse"), kept("reply"), fresh("audit")]);

	await retell(root, [kept("open"), kept("parse"), eachPage([kept("read"), kept("reply")])]);

	const after = ["open", "parse", { "each page": ["read", "reply"] }, "audit"];
	expect(variant(CHILD).reconciliation).toBeUndefined();
	expect(told(CHILD)).toEqual(after);
	expect(variant(GRANDCHILD).reconciliation).toBeUndefined();
	expect(told(GRANDCHILD)).toEqual(after);
}, 30_000);

/**
 * Answer one proposal's disagreements with its own side.
 * @param on The proposal.
 * @param which Which of them to answer.
 * @returns What the write did.
 */
async function keepMine(on: string, which: (issue: ReconciliationIssue) => boolean) {
	const issues = (variant(on).reconciliation?.issues ?? []).filter(which);
	return write(
		store.settleVariantTransition(
			ResolutionInputSchema.parse({
				variant: on,
				choices: issues.map((one) => ({ subject: one.subject, field: one.field, side: "mine" })),
			}),
		),
	);
}

/**
 * Rename the clock, the node the flow leaves out, on one variant.
 * @param on The variant.
 * @param to The new name.
 */
async function rename(on: string, to: string) {
	const flow = variant(on).content.flows[0]!;
	const clock = variant(on).content.nodes.find((one) => !flow.participants.includes(one.id))!;
	await write(
		store.editVariantTransition(
			VariantEditInputSchema.parse({
				variant: on,
				nodes: [{ id: clock.id, name: to, kind: "service" }],
			}),
		),
	);
}

test("a step between the moved ones is a competing order that names the flow, and stays answered", async () => {
	// The child checks between reading and parsing, and renames the clock, which
	// the root renames too: two arguments at once.
	const before = [kept("open"), kept("read"), fresh("check"), kept("parse"), kept("reply")];
	await retell(CHILD, before);
	await rename(CHILD, "Timer");
	await rename(root, "Wall clock");
	await keepMine(CHILD, () => true);

	await retell(root, [kept("open"), eachPage([kept("read"), kept("parse")]), kept("reply")]);

	// Whether "check" runs on every page is nobody's guess.
	const flow = variant(CHILD).content.flows[0]!;
	const order = variant(CHILD).reconciliation?.issues.filter(
		(one) => one.kind === "competing-order",
	);
	expect(order?.map((one) => one.subject)).toEqual([flow.id]);
	expect(told(CHILD)).toEqual(["open", "read", "check", "parse", "reply"]);
	expect(variant(GRANDCHILD).reconciliation?.blockedBy).toBe(variant(CHILD).id);

	// This proposal's telling is the one it means, answered while a field
	// argument stays open, and the answer outlasts the next catch-up.
	await rename(root, "System clock");
	const answered = await keepMine(CHILD, (one) => one.kind === "competing-order");
	expect(answered.outcome, answered.outcome === "rejected" ? answered.problem : "").toBe("applied");
	expect(variant(CHILD).reconciliation?.issues.map((one) => one.kind)).toEqual(["competing-field"]);
	await keepMine(CHILD, () => true);
	expect(variant(CHILD).reconciliation).toBeUndefined();
	expect(told(CHILD)).toEqual(["open", "read", "check", "parse", "reply"]);
	expect(told(GRANDCHILD)).toEqual(["open", "read", "check", "parse", "reply"]);
}, 30_000);
