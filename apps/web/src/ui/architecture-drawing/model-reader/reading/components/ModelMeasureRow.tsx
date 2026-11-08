import {
	useCallback,
	useMemo,
	type CSSProperties,
	type JSX,
	type KeyboardEvent,
	type MouseEvent,
} from "react";
import { cn } from "@archboard/ui-kit/components";
import type { LocalityAnswer } from "@archboard/code-intel/history";
import { KindChip } from "#ui/architecture-drawing/canvas/presentation/components/KindMarks.tsx";
import {
	isHistoryMeasure,
	measureOf,
	type Measure,
	type MeasureKey,
	type MeasureRow,
} from "#ui/architecture-drawing/model-reader/reading/rules/module-measures.ts";
import type { KindLook } from "#ui/architecture-drawing/canvas/picture/rules/kind-look.ts";

/** Why the lens did not read a module, as a row and the foot of the table say it. */
const NOT_READ: Readonly<Record<LocalityAnswer["skipped"][number]["reason"], string>> = {
	unbound: "no code binding",
	"drill-down": "another module holds its history",
	"repository-unregistered": "repository not registered here",
	"checkout-unavailable": "checkout could not be read",
	"ref-not-checked-out": "its ref is not checked out",
};

/** A count of none and a dash, at the floor of a mark in the dark theme: Lc 37 on the well. */
const QUIET_INK = "text-muted-foreground/80";

/** A row's cells, with a line of the rule between it and the row above. */
const CELL =
	"h-9 px-3 [tr+tr>&]:shadow-[inset_0_1px_0_color-mix(in_oklch,var(--border)_55%,transparent)]";

/**
 * The bar of a sorted count, as the site draws it: a gold wash from the right edge of its cell, as
 * long as the count is against the most in the table, and an edge of gold as strong.
 */
const SORTED_BAR =
	"bg-[linear-gradient(to_left,color-mix(in_oklch,var(--primary-mark)_16%,transparent)_calc(var(--share)*100%),transparent_0)] shadow-[inset_-2px_0_0_color-mix(in_oklch,var(--primary-mark)_calc(var(--share)*90%),transparent)]";

/** Inputs for one row of the table. */
interface ModelMeasureRowProps {
	readonly row: MeasureRow;
	/** The measures of the table, in the order of its columns. */
	readonly measures: readonly Measure[];
	/** What the table is sorted by. */
	readonly sorted: MeasureKey;
	/** The most of that measure in the table, which a bar is drawn against. */
	readonly most: number;
	readonly look: KindLook;
	/** Whether the module is the one selected on the picture. */
	readonly lit: boolean;
	/** Whether the row holds the table's one tab stop. */
	readonly stop: boolean;
	readonly onChoose: (row: MeasureRow, beside: boolean) => void;
	readonly onFocusRow: (id: string) => void;
	readonly onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
}

/**
 * One module of the table: its kind and name, then each count in its own column. The name is the
 * row's one button, and it covers the whole row, so a press anywhere on the row selects the module
 * on its picture, beside the reading with Alt. An empty cell is a module with no such measure, and
 * a dash is a module the lens did not read, so neither looks like a count of none.
 * @param props The row and what choosing it does.
 * @returns The row.
 */
function ModelMeasureRow(props: ModelMeasureRowProps): JSX.Element {
	const { row, measures, sorted, most, look, lit, stop, onChoose, onFocusRow, onKeyDown } = props;
	const choose = useCallback(
		(event: MouseEvent<HTMLButtonElement>): void => onChoose(row, event.altKey),
		[onChoose, row],
	);
	const focus = useCallback((): void => onFocusRow(row.id), [onFocusRow, row.id]);
	return (
		<tr
			data-measure-row={row.id}
			data-row-id={row.id}
			className={cn(
				"group/row relative transition-colors",
				lit ? "bg-face shadow-[inset_0_-2px_0_var(--primary)]" : "hover:bg-face/50",
			)}
		>
			<th scope="row" className={cn(CELL, "text-left font-normal")}>
				<span className="flex min-w-0 items-center gap-2.5">
					<KindChip kind={row.kind} look={look} />
					<button
						type="button"
						tabIndex={stop ? 0 : -1}
						aria-current={lit ? "true" : undefined}
						title={row.title}
						onClick={choose}
						onFocus={focus}
						onKeyDown={onKeyDown}
						className="text-control focus-visible:after:ring-ring after:rounded-control min-w-0 truncate text-left outline-none after:absolute after:inset-0 after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-inset"
					>
						{row.name}
					</button>
				</span>
			</th>
			{measures.map(({ key }) => (
				<Cell key={key} row={row} measure={key} sorted={key === sorted} most={most} />
			))}
		</tr>
	);
}

/**
 * One count of a row, or the cell that stands where a module has none.
 * @param props The row, the measure, whether the table is sorted by it and the most of it.
 * @param props.row The row.
 * @param props.measure The measure.
 * @param props.sorted Whether the table is sorted by it.
 * @param props.most The most of the measure in the table.
 * @returns The cell.
 */
function Cell(props: {
	readonly row: MeasureRow;
	readonly measure: MeasureKey;
	readonly sorted: boolean;
	readonly most: number;
}): JSX.Element {
	const count = measureOf(props.row, props.measure);
	if (count === undefined) return <EmptyCell row={props.row} measure={props.measure} />;
	return <CountCell {...props} count={count} />;
}

/** The ink of a count: quieter for none, full for the sorted column, and prose ink for the rest. */
const COUNT_INK = { none: QUIET_INK, sorted: "text-foreground", other: "text-body-foreground" };

/**
 * A count. The sorted count stands on its bar, as long as it is against the most in the table.
 * @param props The measure, its count, whether the table is sorted by it and the most of it.
 * @param props.measure The measure.
 * @param props.count The count.
 * @param props.sorted Whether the table is sorted by it.
 * @param props.most The most of the measure in the table.
 * @returns The cell.
 */
function CountCell(props: {
	readonly measure: MeasureKey;
	readonly count: number;
	readonly sorted: boolean;
	readonly most: number;
}): JSX.Element {
	const { measure, count, sorted, most } = props;
	const share = useMemo<CSSProperties | undefined>(
		() => (sorted ? { "--share": most === 0 ? 0 : count / most } : undefined),
		[sorted, count, most],
	);
	const ink = count === 0 ? "none" : sorted ? "sorted" : "other";
	return (
		<td
			data-measure={measure}
			data-count={count}
			data-sorted={sorted ? "" : undefined}
			style={share}
			className={cn(
				CELL,
				"text-technical text-right font-mono tabular-nums",
				sorted && SORTED_BAR,
				COUNT_INK[ink],
			)}
		>
			{count}
		</td>
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
	if (!isHistoryMeasure(props.measure) || history?.kind !== "skipped")
		return (
			<td className={CELL}>
				<span className="sr-only">No count</span>
			</td>
		);
	return (
		<td
			data-not-read={history.reason}
			title={`Not read: ${NOT_READ[history.reason]}`}
			className={cn(CELL, "text-technical text-right font-mono", QUIET_INK)}
		>
			<span aria-hidden="true">–</span>
			<span className="sr-only">Not read: {NOT_READ[history.reason]}</span>
		</td>
	);
}

export { ModelMeasureRow, NOT_READ };
