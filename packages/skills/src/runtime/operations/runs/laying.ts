// A fixture is the starting vault an author meets, and it teaches the shapes it
// uses. The inherited ones drew relationships onto containers: four S00 runs
// and the S14 runs failed `edge.actual-receiver` over it (TASK-264). This lays
// each fixture through the store's own transitions, the way the harness's CLI
// calls would, and reads the boards the steps leave. A fixture that does not
// lay is refused here, at `eval:skill check`, rather than hours into a batch.

import {
	acceptedBoard,
	adoptVariantTransition,
	branchVariantTransition,
	createBoardTransition,
	editVariantTransition,
	settleVariantTransition,
} from "@archboard/board/store-write";
import type { SemanticBoard } from "@archboard/board/document";
import type { VariantContent } from "@archboard/board/content";
import {
	FixtureStepSchema,
	type Fixture,
	type FixtureStep,
	type RawFixtureStep,
} from "#runtime/schemas/fixture.ts";
import { edgesOnContainers } from "#runtime/rules/outcomes/outcomes-board.ts";
import {
	fixturePolicy,
	resolvePlaceholders,
	targetVariant,
} from "#runtime/operations/runs/vault.ts";
import type { writeSemanticBoard } from "@archboard/board/store-write";

type SemanticTransition = Parameters<typeof writeSemanticBoard>[0]["transition"];

/**
 * The one relationship kind that may end on a part with children.
 *
 * A container is an endpoint only when the relationship means the whole
 * module, and a `dependency` is the kind that does: it says one part needs
 * another module as a whole, as a higher-level view draws it. Every other
 * kind names a receiver — a call, a request over http or rpc, an event or a
 * queue message somebody handles, data somebody reads or writes, a render —
 * and the container drawn around the receiving part receives nothing. That is
 * what `no-edge-to-container-with-children` fails at run time (it allows no
 * kind at all) and what the grader marks down as `edge.actual-receiver`.
 */
const WHOLE_MODULE_KINDS: ReadonlySet<string> = new Set(["dependency"]);

/** The repository a fixture registers, which `$FLASK` stands for. */
const FLASK_REPO = "github.com/pallets/flask";
/** Any instant: laying a board reads no clock a check depends on. */
const LAID_AT = "2026-09-17T00:00:00.000Z";

/**
 * The store transition for a branch step.
 * @param step The resolved step.
 * @returns The transition.
 */
function branchOf(step: Extract<FixtureStep, { op: "branch" }>): SemanticTransition {
	return branchVariantTransition({
		name: step.as,
		...(step.from === undefined ? {} : { from: step.from }),
		...(step.summary === undefined ? {} : { summary: step.summary }),
	});
}

/**
 * The store transition for an adopt step.
 * @param step The resolved step.
 * @returns The transition.
 */
function adoptOf(step: Extract<FixtureStep, { op: "adopt" }>): SemanticTransition {
	return adoptVariantTransition({
		variant: step.variant,
		...(step.reason === undefined ? {} : { reason: step.reason }),
	});
}

/**
 * The store transition one laid fixture step amounts to, exactly as the CLI
 * command the harness sends would build it.
 * @param step The resolved step.
 * @returns The transition.
 */
function transitionOf(step: FixtureStep): SemanticTransition {
	switch (step.op) {
		case "new":
			return createBoardTransition({ name: step.board, ...step.input });
		case "edit":
			return editVariantTransition(step.input);
		case "branch":
			return branchOf(step);
		case "resolve":
			return settleVariantTransition({ variant: step.variant, ...step.input });
		default:
			return adoptOf(step);
	}
}

/**
 * The name of a part on a variant, or its id when nothing holds it.
 * @param content The variant's content.
 * @param id The part's id.
 * @returns The name.
 */
function nameIn(content: VariantContent, id: string): string {
	return content.nodes.find((node) => node.id === id)?.name ?? id;
}

/**
 * Where a laid board has a relationship ending on a part with children, on any
 * of its variants, each relationship named once for the whole fixture.
 * @param where The scenario, step and board, as a line says them.
 * @param board The board the step left.
 * @param reported The relationships already named, by board and id.
 * @returns Problems, one line each.
 */
function landedOn(where: string, board: SemanticBoard, reported: Set<string>): string[] {
	return board.variants.flatMap(({ name, content }) =>
		edgesOnContainers(content, WHOLE_MODULE_KINDS)
			.filter((edge) => !reported.has(`${board.name}\u0000${edge.id}`))
			.map((edge) => {
				reported.add(`${board.name}\u0000${edge.id}`);
				const kids = content.nodes
					.filter((node) => node.parent === edge.to)
					.map((node) => node.name)
					.toSorted();
				const to = nameIn(content, edge.to);
				return `${where}@${name}: ${nameIn(content, edge.from)} -> ${to} lands on ${to}, which ${kids.join(", ")} names as its parent`;
			}),
	);
}

/**
 * One fixture step applied to the board the steps before it left.
 * @param fixture The fixture the step belongs to.
 * @param step The step, before its placeholders resolve.
 * @param before The step's board so far, or null before its creation.
 * @returns The board the step leaves; a placeholder that names nothing or a step the store refuses throws.
 */
function layStep(
	fixture: Fixture,
	step: RawFixtureStep,
	before: SemanticBoard | null,
): SemanticBoard {
	const resolved = FixtureStepSchema.parse(
		resolvePlaceholders(step, {
			repo: fixture.registerRepo ? FLASK_REPO : null,
			board: before,
			variant: targetVariant(step),
		}),
	);
	const applied = transitionOf(resolved).apply(before, LAID_AT);
	if (!applied.ok) throw new Error(applied.problem);
	// The store refuses the same boards on its write, so a fixture it would
	// refuse in a batch is refused here.
	const accepted = acceptedBoard(before, applied.board, LAID_AT, fixturePolicy(fixture.policy));
	if ("problem" in accepted) throw new Error(accepted.problem);
	return accepted.board;
}

/** What laying one fixture left: the boards of the vault, and why the steps failed to lay. */
interface Laid {
	readonly boards: ReadonlyMap<string, SemanticBoard>;
	readonly problems: string[];
}

/**
 * One fixture laid through the store's transitions, step by step.
 *
 * Every step's placeholders resolve against the board the steps before it left
 * and the transition applies to that board. After every step every variant of
 * the board is read, so a child a later step adds under a relationship's
 * target is caught, even if a still later step moves it away again: an author
 * only sees the final vault, but a fixture that ever lands has taught the shape
 * to whoever reads it. Laying stops at the first step that fails, since every
 * later step builds on it.
 * @param id The scenario the fixture belongs to.
 * @param fixture The fixture.
 * @returns The boards it leaves and the problems it has.
 */
function layFixture(id: string, fixture: Fixture): Laid {
	const boards = new Map<string, SemanticBoard>();
	const reported = new Set<string>();
	const problems: string[] = [];
	for (const [index, step] of fixture.steps.entries()) {
		const where = `${id} step ${index} ${step.board}`;
		try {
			const board = layStep(fixture, step, boards.get(step.board) ?? null);
			boards.set(step.board, board);
			problems.push(...landedOn(where, board, reported));
		} catch (error) {
			const reason = error instanceof Error ? error.message : String(error);
			return { boards, problems: [...problems, `${where} (${step.op}) does not lay: ${reason}`] };
		}
	}
	return { boards, problems };
}

/**
 * Every fixture that does not lay, or that teaches a relationship ending on a
 * part with children.
 * @param fixtures The fixtures, by the scenario each belongs to.
 * @returns Problems, one line each.
 */
function layingProblems(fixtures: ReadonlyMap<string, Fixture>): string[] {
	return [...fixtures].flatMap(([id, fixture]) => layFixture(id, fixture).problems);
}

export { layFixture, layingProblems };
