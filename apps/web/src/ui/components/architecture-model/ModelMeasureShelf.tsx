import { useCallback, useId, useMemo, type JSX } from "react";
import { cn, Select } from "@archboard/ui-kit/components";
import { COUNT_COLUMNS } from "#ui/components/architecture-model/ModelMeasureRow.tsx";
import { ModelSwitch } from "#ui/components/architecture-model/ModelSwitch.tsx";
import {
	MEASURES,
	SHOWS,
	isHistoryMeasure,
	type Measure,
	type MeasureKey,
	type MeasureView,
	type ShowKey,
} from "#ui/rules/architecture-model/module-measures.ts";

/** The name of each measure, as the closed sort says it. */
const SORT_ITEMS = MEASURES.map(({ key, label }) => ({ value: key, label }));
/** The name of each choice of the modules on show. */
const SHOW_ITEMS = SHOWS.map(({ key, label }) => ({ value: key, label }));

/** The two ends a count can be read from. */
const ORDERS = [
	{ value: "most", label: "Most first" },
	{ value: "fewest", label: "Fewest first" },
] as const;

/** Inputs for the shelf. */
interface MeasureShelfProps {
	/** How the list stands. */
	readonly view: MeasureView;
	/** The measure the list is sorted by, which a reading may hold apart from the reader's choice. */
	readonly measure: MeasureKey;
	/** The measures on show, in the order of the columns. */
	readonly measures: readonly Measure[];
	/** Whether the reading can read history. */
	readonly history: boolean;
	readonly onView: (view: MeasureView) => void;
}

/**
 * What stands over the table while it scrolls: the sort and its order, which modules are on show,
 * what the sort counts, and a head over each column. The head of the sorted column is lit, so its
 * numbers have a name.
 * @param props How the list stands, and what it offers.
 * @returns The shelf.
 */
function MeasureShelf(props: MeasureShelfProps): JSX.Element {
	const { view, measure, measures, history, onView } = props;
	const order = useCallback(
		(value: (typeof ORDERS)[number]["value"]): void =>
			onView({ ...view, fewest: value === "fewest" }),
		[view, onView],
	);
	return (
		<div className="bg-raised shadow-edge-down sticky top-0 z-20 flex flex-col pt-2 pr-3 pl-3">
			<div className="flex items-center gap-3 pb-2">
				<MeasureSort
					view={view}
					measure={measure}
					measures={measures}
					history={history}
					onView={onView}
				/>
				<MeasureShow view={view} onView={onView} />
			</div>
			<div className="flex items-end gap-2">
				<div className="flex min-w-0 flex-1 flex-col items-start gap-1.5 self-start pb-2">
					<ModelSwitch
						label="Order"
						slot="model-measure-order"
						choices={ORDERS}
						value={view.fewest ? "fewest" : "most"}
						onChange={order}
					/>
					<p data-slot="model-measure-meaning" className="text-body text-muted-foreground">
						{measures.find(({ key }) => key === measure)?.description}
					</p>
				</div>
				<div aria-hidden="true" className={COUNT_COLUMNS}>
					{measures.map(({ key, label }) => (
						<ColumnHead key={key} label={label} sorted={key === measure} />
					))}
				</div>
			</div>
		</div>
	);
}

/**
 * The name of one column, turned on its side as the dimension of a drawing is, so the names stand
 * over narrow columns. The table's rows say each count in words to assistive technology, so the head
 * stays out of that reading.
 * @param props The name, and whether the list is sorted by it.
 * @param props.label The name.
 * @param props.sorted Whether the list is sorted by it.
 * @returns The head.
 */
function ColumnHead(props: { readonly label: string; readonly sorted: boolean }): JSX.Element {
	const { label, sorted } = props;
	return (
		<span className="relative flex h-22 justify-end pr-0.5">
			<span
				data-measure-head={sorted ? "sorted" : undefined}
				className={cn(
					"text-body rotate-180 pt-2 [writing-mode:vertical-rl]",
					sorted ? "text-foreground font-semibold" : "text-muted-foreground",
				)}
			>
				{label}
			</span>
		</span>
	);
}

/**
 * The sort. A reading with no history to read offers only what it can sort by.
 * @param props What the list is sorted by, and whether history can be read.
 * @returns The control, with its label.
 */
function MeasureSort(props: MeasureShelfProps): JSX.Element {
	const { view, measure, measures, history, onView } = props;
	const id = useId();
	const choose = useCallback(
		(value: MeasureKey | null): void => {
			if (value !== null) onView({ ...view, measure: value });
		},
		[view, onView],
	);
	const groups = useMemo(
		() => ({
			history: measures.filter(({ key }) => isHistoryMeasure(key)),
			interface: measures.filter(({ key }) => !isHistoryMeasure(key) && key !== "hiddenParts"),
			implementation: measures.filter(({ key }) => key === "hiddenParts"),
		}),
		[measures],
	);
	return (
		<div className="flex min-w-0 flex-1 items-center gap-2">
			<label htmlFor={id} className="text-body text-muted-foreground shrink-0">
				Sort by
			</label>
			<Select items={SORT_ITEMS} value={measure} onValueChange={choose}>
				<Select.Trigger id={id} size="sm" data-slot="model-measure-sort" className="min-w-0 flex-1">
					<Select.Value />
				</Select.Trigger>
				<Select.Content className="w-115">
					{history && <MeasureChoices label="Code history" measures={groups.history} />}
					<MeasureChoices label="Interface" measures={groups.interface} />
					<MeasureChoices label="Implementation" measures={groups.implementation} />
				</Select.Content>
			</Select>
		</div>
	);
}

/**
 * Which modules are on show, which bars and counts then stand against.
 * @param props How the list stands.
 * @param props.view How the list stands.
 * @param props.onView Change how it stands.
 * @returns The control, with its label.
 */
function MeasureShow(props: Pick<MeasureShelfProps, "view" | "onView">): JSX.Element {
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
				<Select.Trigger id={id} size="sm" data-slot="model-measure-show" className="w-45">
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

/**
 * The choices of one source, each with what it counts and what it shows.
 * @param props The source and its measures.
 * @param props.label What the measures read.
 * @param props.measures The measures.
 * @returns The group, or nothing when no measure of it is on show.
 */
function MeasureChoices(props: {
	readonly label: string;
	readonly measures: readonly Measure[];
}): JSX.Element | null {
	if (props.measures.length === 0) return null;
	return (
		<Select.Group>
			<Select.Label>{props.label}</Select.Label>
			{props.measures.map(({ key, label, description }) => (
				<Select.Item key={key} value={key} description={description}>
					{label}
				</Select.Item>
			))}
		</Select.Group>
	);
}

export { MeasureShelf };
