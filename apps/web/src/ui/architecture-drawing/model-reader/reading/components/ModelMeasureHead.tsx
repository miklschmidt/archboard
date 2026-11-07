import { RiArrowDownSFill, RiArrowUpSFill } from "@remixicon/react";
import { useCallback, useId, type JSX } from "react";
import { cn, Select } from "@archboard/ui-kit/components";
import {
	SHOWS,
	type Measure,
	type MeasureKey,
	type MeasureView,
	type ShowKey,
} from "#ui/architecture-drawing/model-reader/reading/rules/module-measures.ts";

/** The name of each choice of the modules on show. */
const SHOW_ITEMS = SHOWS.map(({ key, label }) => ({ value: key, label }));

/** Inputs for the head of the table. */
interface MeasureHeadProps {
	/** How the table stands. */
	readonly view: MeasureView;
	/** The measure the table is sorted by, which a reading may hold apart from the reader's choice. */
	readonly measure: MeasureKey;
	/** The measures of the table, in the order of its columns. */
	readonly measures: readonly Measure[];
	readonly onView: (view: MeasureView) => void;
}

/**
 * The head of the table, which stands over the rows while they scroll: the name of each column,
 * and each one sorts the rows. A press sorts by a column with the most first, and a second press
 * turns the order round, as the site's table does.
 * @param props How the table stands, and its measures.
 * @returns The head.
 */
function MeasureHead(props: MeasureHeadProps): JSX.Element {
	const { view, measure, measures, onView } = props;
	const sort = useCallback(
		(key: MeasureKey): void =>
			onView({ ...view, measure: key, fewest: key === measure ? !view.fewest : false }),
		[view, measure, onView],
	);
	return (
		<thead className="bg-tray-sink sticky top-0 z-10">
			<tr>
				<th
					scope="col"
					className="text-body text-muted-foreground h-10 px-3 text-left font-medium shadow-[inset_0_-1px_0_var(--border)]"
				>
					Module
				</th>
				{measures.map((one) => (
					<ColumnHead
						key={one.key}
						measure={one}
						sorted={one.key === measure ? (view.fewest ? "ascending" : "descending") : null}
						onSort={sort}
					/>
				))}
			</tr>
		</thead>
	);
}

/**
 * The head of one column: its name, which says what it counts on hover, and the key that sorts by
 * it. The sorted column's head is lit with a piece of gold under it and an arrow that says which
 * end comes first.
 * @param props The measure, how the table is sorted by it, and the sort.
 * @param props.measure The measure.
 * @param props.sorted The order of the table by it, or null when it sorts by another.
 * @param props.onSort Sort by it.
 * @returns The head.
 */
function ColumnHead(props: {
	readonly measure: Measure;
	readonly sorted: "ascending" | "descending" | null;
	readonly onSort: (key: MeasureKey) => void;
}): JSX.Element {
	const { measure, sorted, onSort } = props;
	const sort = useCallback((): void => onSort(measure.key), [onSort, measure.key]);
	const Arrow = sorted === "ascending" ? RiArrowUpSFill : RiArrowDownSFill;
	return (
		<th
			scope="col"
			aria-sort={sorted ?? undefined}
			className="h-10 w-28 px-1.5 text-right font-medium shadow-[inset_0_-1px_0_var(--border)]"
		>
			<button
				type="button"
				data-measure-head={measure.key}
				title={measure.description}
				onClick={sort}
				className={cn(
					"text-body rounded-control focus-visible:ring-ring inline-flex h-7 items-center gap-0.5 px-1.5 whitespace-nowrap transition-colors outline-none focus-visible:ring-2",
					sorted === null
						? "text-muted-foreground hover:text-foreground hover:bg-face/50"
						: "text-foreground rounded-b-none shadow-[inset_0_-2px_0_var(--primary-mark)]",
				)}
			>
				{measure.label}
				<Arrow aria-hidden="true" className={cn("size-3.5", sorted === null && "opacity-0")} />
			</button>
		</th>
	);
}

/**
 * Which modules are on show, which the bars and counts then stand against.
 * @param props How the table stands.
 * @param props.view How the table stands.
 * @param props.onView Change how it stands.
 * @returns The control, with its label.
 */
function MeasureShow(props: Pick<MeasureHeadProps, "view" | "onView">): JSX.Element {
	const { view, onView } = props;
	const id = useId();
	const choose = useCallback(
		(show: ShowKey | null): void => {
			if (show !== null) onView({ ...view, show });
		},
		[view, onView],
	);
	return (
		<div className="flex shrink-0 items-center gap-2">
			<label htmlFor={id} className="text-body text-muted-foreground shrink-0">
				Show
			</label>
			<Select items={SHOW_ITEMS} value={view.show} onValueChange={choose}>
				<Select.Trigger id={id} size="sm" data-slot="model-measure-show" className="w-50">
					<Select.Value />
				</Select.Trigger>
				<Select.Content>
					{SHOWS.map(({ key, label }) => (
						<Select.Item key={key} value={key}>
							{label}
						</Select.Item>
					))}
				</Select.Content>
			</Select>
		</div>
	);
}

export { MeasureHead, MeasureShow };
