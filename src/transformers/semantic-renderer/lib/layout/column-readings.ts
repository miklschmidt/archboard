// Whether a board reads better folded into columns: every column count the
// settled downward reading allows is settled as a reading of its own, and the
// first count that fits the reference pane materially better than the reading
// kept so far replaces it, fewer columns winning ties.
import type { ElkNode } from "@archboard/elk-rs";
import { fitIn } from "@/shared/shell-geometry/index";
import { WRAP_MIN_FIT_GAIN } from "@/transformers/semantic-renderer/config";
import type { ArchitectureDrawing } from "@/transformers/semantic-renderer/lib/drawing";
import { foldColumnCounts } from "@/transformers/semantic-renderer/lib/layout/fold-columns";

/** A folded reading, settled or refused; a refusal keeps the reading before it. */
type Candidate = Promise<ArchitectureDrawing | undefined>;

/**
 * Settles the board folded into a column count, asking no further solve once
 * `unwanted` answers true.
 */
type SettleColumns = (columns: number, unwanted: () => boolean) => Promise<ArchitectureDrawing>;

/**
 * Settle every column count the baseline allows at once, then compare them
 * in increasing order, tightening the width bound after each improvement.
 * The bound only ever tightens, so every count the comparison reaches is
 * among those started: settling them side by side changes which one is kept
 * not at all, only how long the choice waits (TASK-342).
 * @param baseline Original settled geometry used to find indivisible bands.
 * @param settle Settles the board folded into a column count.
 * @returns The best complete reading without solving impossible improvements.
 */
async function chooseReading(
	baseline: ArchitectureDrawing,
	settle: SettleColumns,
): Promise<ArchitectureDrawing> {
	let chosen = false;
	const candidates = new Map<number, Candidate>(
		columnCounts(baseline, requiredFit(baseline)).map((columns) => [
			columns,
			settleCandidate(settle, columns, () => chosen),
		]),
	);
	try {
		return await compareReadings(baseline, candidates, baseline, 2);
	} finally {
		// A count the tightened bound passed over is never compared: stop settling it.
		chosen = true;
	}
}

/**
 * Keep the next column count's reading when it fits materially better, then
 * go on to the counts after it that the tightened bound still allows.
 * @param baseline Original settled geometry used to find indivisible bands.
 * @param candidates The folded readings, by column count.
 * @param best Best complete reading so far.
 * @param columns Next count, in increasing order so fewer columns win ties.
 * @returns The best complete reading.
 */
async function compareReadings(
	baseline: ArchitectureDrawing,
	candidates: ReadonlyMap<number, Candidate>,
	best: ArchitectureDrawing,
	columns: number,
): Promise<ArchitectureDrawing> {
	const count = columnCounts(baseline, requiredFit(best)).find((candidate) => candidate >= columns);
	if (count === undefined) return best;
	const candidate = await candidates.get(count)!;
	const next = candidate !== undefined && better(candidate, best) ? candidate : best;
	return compareReadings(baseline, candidates, next, count + 1);
}

/**
 * The fit another column count must reach to replace a reading.
 * @param best The reading kept so far.
 * @returns Its fit raised by the material gain a fold must provide.
 */
function requiredFit(best: ArchitectureDrawing): number {
	return fitIn(best) * (1 + WRAP_MIN_FIT_GAIN);
}

/**
 * Whether a folded reading improves pane fit materially over the one kept.
 * @param candidate The folded reading.
 * @param best The reading kept so far; fewer columns win equal fit.
 * @returns True when it fits better by at least the required gain.
 */
function better(candidate: ArchitectureDrawing, best: ArchitectureDrawing): boolean {
	const fit = fitIn(candidate);
	return fit > fitIn(best) && fit >= requiredFit(best);
}

/**
 * Settle one folded reading, answering nothing when it cannot route. A
 * refused reading asks no more solves, though settling it had started several
 * side by side; neither does one the choice no longer needs.
 * @param settle Settles the board folded into a column count.
 * @param columns One alternate column count.
 * @param unwanted Whether the choice no longer needs this reading.
 * @returns The complete reading, or nothing.
 */
async function settleCandidate(
	settle: SettleColumns,
	columns: number,
	unwanted: () => boolean,
): Candidate {
	let refused = false;
	try {
		return await settle(columns, () => refused || unwanted());
	} catch {
		refused = true;
		return undefined;
	}
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

export { chooseReading };
