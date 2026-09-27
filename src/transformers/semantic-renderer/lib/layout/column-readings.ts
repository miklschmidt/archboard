// Whether a board reads better folded into columns. The unfolded reading is
// settled first. Every column count its bands allow is then placed with no
// label reserved, side by side, and the count is chosen on those pages: in
// increasing order, starting from the settled unfolded page, a count replaces
// the page kept so far when it fits the reference pane materially better,
// fewer columns winning ties. Only the chosen count is settled; a count the
// router refuses keeps the unfolded reading (TASK-342). The settled fold is
// weighed as before ADR 0039, where it fits materially better and scores
// higher, and on its reading pick, where it fits materially better and has
// no more defects in the ADR's order (`defectOrder` in track/score.ts); where
// the two disagree, the reading pick is taken only if it is no worse on any
// measure (`takes`). The bends and line of its lines between columns are the
// price of any fold.
//
// A page's size is fixed by placement, and a settled reading's page is its
// placement with the labels it reserved, so a placement ranks a count for one
// solve where settling it takes its label rounds, each placed and routed. It
// is not a bound: reserved labels can change a reading's fit either way
// (docs/design/layout-rules.md section 34), which is why the chosen count is
// held to its settled drawing.
import type { ElkNode } from "@archboard/elk-rs";
import { fitIn } from "@/shared/shell-geometry/index";
import { WRAP_MIN_FIT_GAIN } from "@/transformers/semantic-renderer/config";
import type { ArchitectureDrawing } from "@/transformers/semantic-renderer/lib/drawing";
import { refusedRouting } from "@/transformers/semantic-renderer/lib/layout/checked-routes";
import { foldColumnCounts } from "@/transformers/semantic-renderer/lib/layout/fold-columns";
import { drawingWeighed } from "@/transformers/semantic-renderer/lib/layout/even-pins";
import {
	crossingsOf,
	defectOrder,
	scoreOf,
	takes,
	type Weighed,
} from "@/transformers/semantic-renderer/lib/track/score";

/** The size of a page. */
type Page = Pick<ArchitectureDrawing, "width" | "height">;

/** One column count's reading of the board. */
interface ColumnReading {
	/** Its page placed with no label reserved, routing nothing. */
	readonly page: () => Promise<Page>;
	/** Its complete drawing; throws when the reading cannot be routed. */
	readonly settle: () => Promise<ArchitectureDrawing>;
}

/**
 * Settle the unfolded reading, then the one column count whose placement
 * the material-gain rule chooses, and keep the better of the two.
 * @param readingOf The board read in a column count, asked once per count.
 * @returns The complete reading kept.
 */
async function chooseReading(
	readingOf: (columns: number) => ColumnReading,
): Promise<ArchitectureDrawing> {
	const baseline = await readingOf(1).settle();
	const folds = columnCounts(baseline, requiredFit(baseline)).map((columns) => readingOf(columns));
	const pages = await Promise.all(folds.map((reading) => reading.page()));
	let kept: { page: Page; reading?: ColumnReading } = { page: baseline };
	for (const [index, reading] of folds.entries()) {
		const page = pages[index]!;
		if (better(page, kept.page)) kept = { page, reading };
	}
	if (kept.reading === undefined) return baseline;
	// A count the router refuses keeps the unfolded reading; a fault is thrown.
	const candidate = await kept.reading.settle().catch((error: unknown) => {
		if (refusedRouting(error)) return undefined;
		throw error;
	});
	return candidate !== undefined && readsBetter(candidate, baseline) ? candidate : baseline;
}

/**
 * Whether a settled fold is kept over the unfolded drawing, as ADR 0039's
 * guard takes it ({@link takes}): weighed as before the ADR, it fits the
 * pane materially better and scores higher; read, it fits materially better
 * with no more defects.
 * @param candidate The fold.
 * @param baseline The unfolded drawing.
 * @returns True when the fold is kept.
 */
function readsBetter(candidate: ArchitectureDrawing, baseline: ArchitectureDrawing): boolean {
	const [one, other] = [drawingWeighed(candidate), drawingWeighed(baseline)];
	const earlier =
		better(candidate, baseline) && scoreOf(scored(candidate)) > scoreOf(scored(baseline));
	return takes(one, other, earlier, better(candidate, baseline) && defectOrder(one, other) <= 0);
}

/**
 * What a settled drawing was scored on before ADR 0039: its page and its crossings.
 * @param drawing The drawing.
 * @returns Its size and crossing count.
 */
function scored(drawing: ArchitectureDrawing): Weighed {
	const lines = drawing.edges.map(({ curve }) => [
		curve.from,
		...curve.segments.map(({ to }) => to),
	]);
	return { width: drawing.width, height: drawing.height, crossings: crossingsOf(lines) };
}

/**
 * The fit another column count must reach to replace a reading.
 * @param best The page kept so far.
 * @returns Its fit raised by the material gain a fold must provide.
 */
function requiredFit(best: Page): number {
	return fitIn(best) * (1 + WRAP_MIN_FIT_GAIN);
}

/**
 * Whether a folded page improves pane fit materially over the one kept.
 * @param candidate The folded page.
 * @param best The page kept so far; fewer columns win equal fit.
 * @returns True when it fits better by at least the required gain.
 */
function better(candidate: Page, best: Page): boolean {
	const fit = fitIn(candidate);
	return fit > fitIn(best) && fit >= requiredFit(best);
}

/**
 * Find feasible column counts from the fully settled baseline geometry.
 * Preserve hierarchy so proposed folds move whole frames and side-entry sources.
 * @param drawing The complete downward baseline.
 * @param minimumFit The fit any further candidate must improve.
 * @returns Increasing candidate counts; ties retain the earlier, simpler reading.
 */
function columnCounts(drawing: ArchitectureDrawing, minimumFit: number): number[] {
	const subjects = [...drawing.cards, ...drawing.containers];
	const nodes = new Map<string, ElkNode>(
		subjects.map(({ measured, box }) => [
			measured.node.id,
			{
				id: measured.node.id,
				...box,
				layoutOptions: { "archboard.order": String(measured.node.order) },
			},
		]),
	);
	const children: ElkNode[] = [];
	for (const { measured } of subjects) {
		const node = nodes.get(measured.node.id)!;
		const parent = nodes.get(measured.node.parent ?? "");
		if (parent === undefined) children.push(node);
		else (parent.children ??= []).push(node);
	}
	return foldColumnCounts(
		{
			id: "column-candidates",
			x: 0,
			y: 0,
			width: drawing.width,
			height: drawing.height,
			children,
			edges: drawing.edges.map(({ edge }) => ({
				id: edge.id,
				sources: [edge.from],
				targets: [edge.to],
				layoutOptions: { "archboard.order": String(edge.order) },
			})),
		},
		minimumFit,
	);
}

export { chooseReading, type ColumnReading };
