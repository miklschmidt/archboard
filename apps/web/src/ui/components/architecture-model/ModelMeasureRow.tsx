import { useMemo, type CSSProperties, type JSX } from "react";
import { Badge, cn } from "@archboard/ui-kit/components";
import {
	isHistoryMeasure,
	measureOf,
	type Measure,
	type MeasureKey,
	type MeasureRow,
} from "#ui/rules/architecture-model/module-measures.ts";
import type { KindLook } from "#ui/architecture-drawing/canvas/picture/rules/kind-look.ts";
import type { LocalityAnswer } from "@archboard/code-intel/history";

/** Why the lens did not read a module, as a row and the foot of the list say it. */
const NOT_READ: Readonly<Record<LocalityAnswer["skipped"][number]["reason"], string>> = {
	unbound: "no code binding",
	"drill-down": "another module holds its history",
	"repository-unregistered": "repository not registered here",
	"checkout-unavailable": "checkout could not be read",
	"ref-not-checked-out": "its ref is not checked out",
};

/** How wide a count column is, and how many there are. The heads and the rows take this one track. */
const COUNT_COLUMNS = "grid grid-cols-[repeat(var(--measure-columns),30px)]";

/** A count of none and a dash, at the floor of a mark in the dark theme: Lc 37 on the well. */
const QUIET_INK = "text-muted-foreground/80";

/** The room the bar has: the row less the count columns and the room around them. */
const BAR_ROOM = "(100% - var(--measure-columns) * 30px - 26px)";

/** A bar is a slab in the colour of its kind: a lit top edge and a front edge in shade. */
const BAR_SLAB =
	"shadow-[inset_0_1px_0_color-mix(in_oklch,var(--kind)_70%,white),0_2px_0_color-mix(in_oklch,var(--kind)_60%,black)]";

/**
 * A row's counts, each in its own column, and the bar of the sorted count under the name. Every
 * measure keeps its column on every row, so the eye runs down one edge, and the sorted count stands
 * on a slab. An empty cell is a module with no such measure, and a dash is a module the lens did
 * not read, so neither looks like a count of none.
 * @param props The row, the measures on show, what it is sorted by, the most of that measure and how
 * kinds look.
 * @param props.row The row.
 * @param props.measures The measures on show, in the order of the columns.
 * @param props.sorted What it is sorted by.
 * @param props.most The most of that measure in the list.
 * @param props.look How the kinds of the model look.
 * @returns The cells.
 */
function ModelMeasureCells(props: {
	readonly row: MeasureRow;
	readonly measures: readonly Measure[];
	readonly sorted: MeasureKey;
	readonly most: number;
	readonly look: KindLook;
}): JSX.Element {
	const { row, measures, sorted, most, look } = props;
	return (
		<>
			<SortedBar count={measureOf(row, sorted) ?? 0} most={most} color={look.nodeColor(row.kind)} />
			<span data-slot="model-measure-cells" className={COUNT_COLUMNS}>
				{measures.map(({ key }) => (
					<Cell key={key} row={row} measure={key} sorted={key === sorted} />
				))}
			</span>
		</>
	);
}

/**
 * The length of the sorted count, under the name. It draws that one count and no other, in the
 * colour of the module's kind, so it adds nothing up and judges nothing (ADR 0044).
 * @param props The count, the most of its measure and the colour.
 * @param props.count The count.
 * @param props.most The most of its measure in the list.
 * @param props.color The colour of the module's kind, as a CSS colour.
 * @returns The bar, or nothing for a count of none.
 */
function SortedBar(props: {
	readonly count: number;
	readonly most: number;
	readonly color: string;
}): JSX.Element | null {
	const { count, most, color } = props;
	const style = useMemo<CSSProperties>(
		() => ({ "--kind": color, width: `calc(${BAR_ROOM} * ${count / most})` }),
		[color, count, most],
	);
	if (count === 0) return null;
	return (
		<span
			aria-hidden="true"
			data-slot="model-measure-bar"
			style={style}
			className={cn(
				"rounded-chip absolute top-0.5 bottom-1 left-1 -z-10 min-w-0.5 bg-(color:--kind)/55 dark:bg-(color:--kind)/70",
				BAR_SLAB,
			)}
		/>
	);
}

/**
 * One count of a row.
 * @param props The row, the measure and whether the row is sorted by it.
 * @param props.row The row.
 * @param props.measure The measure.
 * @param props.sorted Whether the row is sorted by it.
 * @returns The cell.
 */
function Cell(props: {
	readonly row: MeasureRow;
	readonly measure: MeasureKey;
	readonly sorted: boolean;
}): JSX.Element {
	const { row, measure, sorted } = props;
	const count = measureOf(row, measure);
	if (count === undefined) return <EmptyCell row={row} measure={measure} />;
	if (sorted)
		return (
			<span className="flex justify-end">
				<Badge
					variant="count"
					size="technical"
					data-slot="model-measure-sorted"
					data-measure={measure}
					data-count={count}
				>
					{count}
				</Badge>
			</span>
		);
	return (
		<span
			data-measure={measure}
			data-count={count}
			className={cn("pr-1 text-right", count === 0 ? QUIET_INK : "text-foreground/85")}
		>
			{count}
		</span>
	);
}

/**
 * A cell with no count: a dash for what the lens skipped, which says why to a reader who points at
 * it, and nothing for what the module does not have.
 * @param props The row and the measure.
 * @param props.row The row.
 * @param props.measure The measure.
 * @returns The cell.
 */
function EmptyCell(props: { readonly row: MeasureRow; readonly measure: MeasureKey }): JSX.Element {
	const { history } = props.row;
	if (!isHistoryMeasure(props.measure) || history?.kind !== "skipped") return <span />;
	return (
		<span
			data-not-read={history.reason}
			title={`Not read: ${NOT_READ[history.reason]}`}
			className={cn("pr-1 text-right", QUIET_INK)}
		>
			–
		</span>
	);
}

/**
 * What a row says to assistive technology, because a bare number in a column says nothing.
 * @param row The row.
 * @param measures The measures on show.
 * @returns Its name and each count with what it counts.
 */
function measureRowLabel(row: MeasureRow, measures: readonly Measure[]): string {
	const counts = measures.flatMap(({ key, label }) => {
		const count = measureOf(row, key);
		return count === undefined ? [] : [`${label} ${count}`];
	});
	const { history } = row;
	const skipped = history?.kind === "skipped" ? [`Not read: ${NOT_READ[history.reason]}`] : [];
	return [row.name, ...counts, ...skipped].join(", ");
}

export { COUNT_COLUMNS, ModelMeasureCells, NOT_READ, measureRowLabel };
