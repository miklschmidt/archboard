// Whether a board reads better folded into columns. The unfolded reading is
// settled first. Every column count its bands allow is then placed with no
// label reserved, side by side, and the count is chosen on those pages: in
// increasing order, starting from the settled unfolded page, a count replaces
// the page kept so far when it fits the reference pane materially better,
// fewer columns winning ties. Only the chosen count is settled; a count the
// router refuses keeps the unfolded reading (TASK-342). The settled fold is
// kept as ADR 0039's guard takes it (`takes` in track/score.ts): weighed as
// before the ADR, it fits materially better and scores higher; read, it fits
// materially better and reads no worse in the ADR's order (`readingOrder`),
// where Graphviz counts crossings seen, then hooks and touching lines. The
// bends and line of its lines between columns are the price of any fold.
//
// The unfolded reading is settled every way its settlement weighs (plain and
// evened pins, reserved labels with and without their full clearance), and
// the fold first only the way the unfolded reading was kept: a fold is read
// as its unfolded reading was. Settled every way, a fold was kept the same way
// as its unfolded reading on every current variant of both vaults that
// settles one (19 drawings, measured 2026-09-27), and the three other ways
// were two fifths of Archboard server's routing. A fold the router refuses
// that way is settled every way, as before: on one draft of the work vault
// the plain-pin fold is refused and the evened one routes.
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
	readingOrder,
	scoreOf,
	takes,
	type Weighed,
} from "@/transformers/semantic-renderer/lib/track/score";

/** The size of a page. */
type Page = Pick<ArchitectureDrawing, "width" | "height">;

/** A reading's complete drawing and the way it was settled. */
interface SettledColumnReading<Way> {
	readonly drawing: ArchitectureDrawing;
	readonly way: Way;
}

/** One column count's reading of the board. */
interface ColumnReading<Way> {
	/** Its page placed with no label reserved, routing nothing. */
	readonly page: () => Promise<Page>;
	/** Its complete drawing, settled every way or the one way asked; throws when the reading cannot be routed. */
	readonly settle: (way?: Way) => Promise<SettledColumnReading<Way>>;
}

/**
 * Settle the unfolded reading, then the one column count whose placement
 * the material-gain rule chooses, the way the unfolded reading was settled
 * or, when the router refuses that, every way, and keep the better of the two.
 * @param readingOf The board read in a column count, asked once per count.
 * @returns The complete reading kept.
 */
async function chooseReading<Way>(
	readingOf: (columns: number) => ColumnReading<Way>,
): Promise<ArchitectureDrawing> {
	const { drawing: baseline, way } = await readingOf(1).settle();
	const folds = columnCounts(baseline, requiredFit(baseline)).map((columns) => readingOf(columns));
	const pages = await Promise.all(folds.map((reading) => reading.page()));
	let kept: { page: Page; reading?: ColumnReading<Way> } = { page: baseline };
	for (const [index, reading] of folds.entries()) {
		const page = pages[index]!;
		if (better(page, kept.page)) kept = { page, reading };
	}
	if (kept.reading === undefined) return baseline;
	const candidate = await settledFold(kept.reading, way);
	return candidate !== undefined && readsBetter(candidate, baseline) ? candidate : baseline;
}

/**
 * A fold settled the way its unfolded reading was kept or, when the router
 * refuses that, every way.
 * @param reading The fold.
 * @param way The way its unfolded reading was kept.
 * @returns Its drawing, or undefined when it cannot be routed any way.
 */
async function settledFold<Way>(
	reading: ColumnReading<Way>,
	way: Way,
): Promise<ArchitectureDrawing | undefined> {
	return (await routed(reading.settle(way))) ?? (await routed(reading.settle()));
}

/**
 * A settled fold's drawing, or nothing when the router refuses it; a fault is thrown.
 * @param settling The fold being settled.
 * @returns The drawing, or undefined when it cannot be routed.
 */
function routed<Way>(
	settling: Promise<SettledColumnReading<Way>>,
): Promise<ArchitectureDrawing | undefined> {
	return settling.then(
		({ drawing }) => drawing,
		(error: unknown) => {
			if (refusedRouting(error)) return undefined;
			throw error;
		},
	);
}

/**
 * Whether a settled fold is kept over the unfolded drawing, as ADR 0039's
 * guard takes it ({@link takes}): weighed as before the ADR, it fits the
 * pane materially better and scores higher; read, it fits materially better
 * and reads no worse.
 * @param candidate The fold.
 * @param baseline The unfolded drawing.
 * @returns True when the fold is kept.
 */
function readsBetter(candidate: ArchitectureDrawing, baseline: ArchitectureDrawing): boolean {
	const [one, other] = [drawingWeighed(candidate), drawingWeighed(baseline)];
	const earlier =
		better(candidate, baseline) && scoreOf(scored(candidate)) > scoreOf(scored(baseline));
	return takes(one, other, earlier, better(candidate, baseline) && readingOrder(one, other) <= 0);
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

export { chooseReading, type ColumnReading, type SettledColumnReading };
