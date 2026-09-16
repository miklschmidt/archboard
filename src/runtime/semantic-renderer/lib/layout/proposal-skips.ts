// How a proposal attaches the relationships it adds.
//
// A relationship that survives a proposal keeps the faces it was drawn with.
// One the proposal adds has none to keep, and the cards around it are pinned
// where the predecessor put them, so nothing about the drawing says which
// faces it should use. Guessing from ranks or from card positions was a rule
// family that grew one incident at a time (docs/design/layout-rules.md
// section 1). Instead both honest readings are settled and measured: the
// faces the same content gets on a first render, and no fixed face at all,
// the engine's to attach. The drawing with no route through a card is kept,
// then the one with fewer bends, the first when they tie.

import type { VariantContent } from "@/shared/semantic-board/index";
import type {
	ArchitectureDrawing,
	MeasuredArchitecture,
	ReadingDirection,
} from "@/runtime/semantic-renderer/lib/drawing";
import type { FlankRule } from "@/runtime/semantic-renderer/lib/layout/flank-rules";
import type { HeaderSide } from "@/runtime/semantic-renderer/lib/layout/reading";
import {
	bendsPerRoute,
	routesThroughCards,
} from "@/runtime/semantic-renderer/lib/layout/scorecard";

/**
 * One board to lay out, in the solving frame: the content, its measured
 * sizes and its predecessor turned into that frame, and which way the page
 * reads, which says where a frame's title band sits.
 */
interface Problem {
	readonly content: VariantContent;
	readonly measured: MeasuredArchitecture;
	readonly predecessor: ArchitectureDrawing | undefined;
	readonly direction: ReadingDirection;
	/** Whether the layers fold toward the pane's shape. */
	readonly wrapped: boolean;
	readonly header: HeaderSide;
	/** Which flank returns travel and how skips attach. */
	readonly flanks: FlankRule;
	/**
	 * How a proposal's added skips are attached: the first render of the same
	 * content to read their faces from, or null for no fixed face. Absent on a
	 * first render and on a proposal that adds nothing.
	 */
	readonly added?: ArchitectureDrawing | null;
}

/** Settle a problem to a finished drawing. */
type Settle = (problem: Problem) => Promise<ArchitectureDrawing>;

/**
 * Whether a proposal adds a relationship its predecessor did not draw.
 * @param content The proposal.
 * @param predecessor Its predecessor's drawing.
 * @returns True when some relationship is new or has new ends.
 */
function addsRelationships(content: VariantContent, predecessor: ArchitectureDrawing): boolean {
	return content.edges.some(
		(edge) =>
			!predecessor.edges.some(
				(before) =>
					before.edge.id === edge.id &&
					before.edge.from === edge.from &&
					before.edge.to === edge.to,
			),
	);
}

/**
 * The drawing a reader pays less for: no route through a card first, then
 * fewer turns, the first when they tie.
 * @param one A settled drawing.
 * @param other Another settled drawing of the same problem.
 * @returns The cheaper one.
 */
function cheaperOf(one: ArchitectureDrawing, other: ArchitectureDrawing): ArchitectureDrawing {
	const [a, b] = [routesThroughCards(one), routesThroughCards(other)];
	if (a !== b) return a < b ? one : other;
	return bendsPerRoute(other) < bendsPerRoute(one) ? other : one;
}

/**
 * Settle a board, choosing how a proposal attaches the relationships it adds.
 * @param problem The board and its predecessor, in the solving frame.
 * @param firstRender Solves a problem once with no predecessor, for the faces it gives.
 * @param settle Settles a problem to the end.
 * @returns The settled drawing.
 */
async function settleWithAddedSkips(
	problem: Problem,
	firstRender: Settle,
	settle: Settle,
): Promise<ArchitectureDrawing> {
	const { predecessor } = problem;
	if (predecessor === undefined || !addsRelationships(problem.content, predecessor))
		return settle(problem);
	const reference = await firstRender({ ...problem, predecessor: undefined });
	const [drawn, engine] = await Promise.all([
		settle({ ...problem, added: reference }),
		settle({ ...problem, added: null }),
	]);
	return cheaperOf(drawn, engine);
}

export { settleWithAddedSkips, type Problem };
