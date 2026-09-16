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
import type { Box, Point } from "@/runtime/semantic-renderer/lib/geometry";
import { segmentStart } from "@/runtime/semantic-renderer/lib/layout/curves";
import type { HeaderSide } from "@/runtime/semantic-renderer/lib/layout/reading";

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
	readonly header: HeaderSide;
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
 * Whether a straight piece of route runs through the inside of a box.
 * @param from Where the piece starts.
 * @param to Where it ends.
 * @param box The box.
 * @returns True when the piece enters the box's interior.
 */
function through(from: Point, to: Point, box: Box): boolean {
	return (
		Math.min(from.x, to.x) < box.x + box.width - 0.5 &&
		Math.max(from.x, to.x) > box.x + 0.5 &&
		Math.min(from.y, to.y) < box.y + box.height - 0.5 &&
		Math.max(from.y, to.y) > box.y + 0.5
	);
}

/**
 * What a reader pays for a drawing: its routes through a card that is
 * neither of their ends, and its turns.
 * @param drawing The settled drawing.
 * @returns The two costs.
 */
function costOf(drawing: ArchitectureDrawing): {
	readonly through: number;
	readonly bends: number;
} {
	let crossed = 0,
		bends = 0;
	for (const { edge, curve } of drawing.edges) {
		curve.segments.forEach((segment, index) => {
			if (segment.kind === "cubic") {
				bends += 1;
				return;
			}
			const from = segmentStart(curve, index);
			crossed += drawing.cards.filter(
				(card) =>
					card.measured.node.id !== edge.from &&
					card.measured.node.id !== edge.to &&
					through(from, segment.to, card.box),
			).length;
		});
	}
	return { through: crossed, bends };
}

/**
 * The drawing a reader pays less for: no route through a card first, then
 * fewer turns, the first when they tie.
 * @param one A settled drawing.
 * @param other Another settled drawing of the same problem.
 * @returns The cheaper one.
 */
function cheaperOf(one: ArchitectureDrawing, other: ArchitectureDrawing): ArchitectureDrawing {
	const [a, b] = [costOf(one), costOf(other)];
	if (a.through !== b.through) return a.through < b.through ? one : other;
	return b.bends < a.bends ? other : one;
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
