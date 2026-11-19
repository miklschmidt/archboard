import { Fragment, useCallback, useMemo, type JSX, type ReactNode } from "react";

import { ClaimMark } from "#ui/shell/components/ActivityLamp.tsx";
import { Tree } from "#ui/shell/components/Tree.tsx";
import { useFolds } from "#ui/architecture-drawing/model-reader/reading/hooks/use-folds.ts";
import { GROUP_LINE } from "#ui/shell/rules/row-tone.ts";
import { SECTION_ICONS } from "#ui/architecture-drawing/model-reader/reading/constants/section-icons.ts";
import { sectionRuns } from "#ui/architecture-drawing/model-reader/reading/rules/section-runs.ts";
import {
	claimsOn,
	type ClaimedSubjects,
} from "#ui/architecture-drawing/model-reader/rules/claimed-subjects.ts";

/** One thing a list offers. */
interface Choice {
	readonly id: string;
	readonly name: string;
	/** The whole of what names it, on hover, where that says more than the name. */
	readonly title?: string;
}

/** Inputs for a list of choices. */
interface ModelChoiceListProps<Entry extends Choice> {
	readonly label: string;
	readonly entries: readonly Entry[];
	/** The entry on screen. */
	readonly lit: string | null;
	/** The data attribute that names an entry. */
	readonly attribute: string;
	readonly onChoose: (entry: Entry, beside: boolean) => void;
	/** What a row says at its end. */
	readonly facts?: ((entry: Entry) => ReactNode) | undefined;
	/** What the agents claim, which marks the row of each claimed entry. */
	readonly claimed: ClaimedSubjects;
	/** What a row says to assistive technology, where its words alone do not say it. */
	readonly rowLabel?: ((entry: Entry) => string) | undefined;
	/** Rows with no depth, which keep no room for a disclosure. */
	readonly flat?: boolean | undefined;
	/** The section that a row stands in. Neighbours in one section share its name. */
	readonly sectionOf?: ((entry: Entry) => string) | undefined;
}

/** A row of the list: an entry, or the collection that holds entries. */
interface ChoiceTreeRow<Entry> {
	readonly id: string;
	readonly parent: string | null;
	readonly branch: boolean;
	readonly open: boolean;
	readonly entry?: Entry | undefined;
}

/** A run of neighbours under a collection's row, and whether its row stands open. */
interface CollectionRun<Entry> {
	readonly id: string;
	readonly label: string;
	readonly open: boolean;
	readonly entries: readonly Entry[];
}

/**
 * The runs of a list: each run of neighbours that share a section, under the row of its
 * collection. A run with no section stands at the top of the tree with no row over it. A run that
 * holds the entry on screen stands open, so the entry on screen never folds away.
 * @param props The list.
 * @param folded The collections the reader folded.
 * @returns The runs.
 */
function runsOf<Entry extends Choice>(
	props: Pick<ModelChoiceListProps<Entry>, "entries" | "sectionOf" | "lit">,
	folded: ReadonlySet<string>,
): readonly CollectionRun<Entry>[] {
	const { entries, sectionOf, lit } = props;
	if (sectionOf === undefined) return [{ id: "", label: "", open: true, entries }];
	return sectionRuns(entries, sectionOf).map((run) => ({
		id: `collection:${run.key}`,
		label: run.label,
		open:
			run.label === "" ||
			!folded.has(`collection:${run.key}`) ||
			run.entries.some((entry) => entry.id === lit),
		entries: run.entries,
	}));
}

/**
 * The drawn rows of some runs, in order, for the keys of the tree.
 * @param runs The runs.
 * @returns The rows.
 */
function rowsOf<Entry extends Choice>(
	runs: readonly CollectionRun<Entry>[],
): readonly ChoiceTreeRow<Entry>[] {
	return runs.flatMap((run) => {
		const parent = run.label === "" ? null : run.id;
		const entries = run.open
			? run.entries.map((entry) => ({ id: entry.id, parent, branch: false, open: false, entry }))
			: [];
		return parent === null
			? entries
			: [{ id: run.id, parent: null, branch: true, open: run.open }, ...entries];
	});
}

/**
 * A list that stays open while the reader walks it, and holds the same rows wherever they stand.
 * A list in sections, such as the flows of collections, stands each run under the row of its
 * collection, which folds it as a module's row folds its parts.
 * @param props The entries and what choosing one does.
 * @returns The list.
 */
function ModelChoiceList<Entry extends Choice>(props: ModelChoiceListProps<Entry>): JSX.Element {
	const { entries, sectionOf, lit, onChoose } = props;
	const { folded, fold: toggleFold } = useFolds<string>();
	const runs = useMemo(
		() => runsOf({ entries, sectionOf, lit }, folded),
		[entries, sectionOf, lit, folded],
	);
	const rows = useMemo(() => rowsOf(runs), [runs]);
	const fold = useCallback(
		(id: string): void => {
			const run = runs.find((candidate) => candidate.id === id);
			if (run?.entries.some((entry) => entry.id === lit) === true) return;
			toggleFold(id);
		},
		[runs, lit, toggleFold],
	);
	const open = useCallback(
		(row: ChoiceTreeRow<Entry>, beside: boolean): void => {
			if (row.entry === undefined) fold(row.id);
			else onChoose(row.entry, beside);
		},
		[onChoose, fold],
	);
	const toggle = useCallback((row: ChoiceTreeRow<Entry>): void => fold(row.id), [fold]);
	return (
		<Tree label={props.label} rows={rows} home={lit} onOpen={open} onToggle={toggle}>
			{runs.map((run) =>
				run.label === "" ? (
					<Fragment key={run.id}>
						{run.entries.map((entry) => (
							<ChoiceRow key={entry.id} {...props} entry={entry} depth={0} />
						))}
					</Fragment>
				) : (
					<CollectionRows key={run.id} {...props} run={run} onFold={fold} />
				),
			)}
		</Tree>
	);
}

/**
 * A collection's row and, while it is open, the entries it holds one step under it, under the
 * rail of an open row.
 * @param props The run and its list.
 * @returns The rows.
 */
function CollectionRows<Entry extends Choice>(
	props: ModelChoiceListProps<Entry> & {
		readonly run: CollectionRun<Entry>;
		readonly onFold: (id: string) => void;
	},
): JSX.Element {
	const { run, onFold } = props;
	const fold = useCallback((): void => onFold(run.id), [onFold, run.id]);
	const dataset = useMemo(() => ({ "data-collection-row": run.label }), [run.label]);
	return (
		<div role="presentation">
			<Tree.Row
				id={run.id}
				depth={0}
				selected={false}
				expanded={run.open}
				dataset={dataset}
				onOpen={fold}
				onToggle={fold}
			>
				<Tree.Marker icon={SECTION_ICONS.collections} title="Collection" />
				<Tree.Name text={run.label} className={GROUP_LINE} />
				<Tree.Facts>{run.entries.length}</Tree.Facts>
			</Tree.Row>
			{run.open && (
				<Tree.Group depth={0} label={run.label}>
					{run.entries.map((entry) => (
						<ChoiceRow key={entry.id} {...props} entry={entry} depth={1} />
					))}
				</Tree.Group>
			)}
		</div>
	);
}

/**
 * One entry, one step under the row of its collection when it stands in one.
 * @param props The entry, its depth and its list.
 * @returns The row.
 */
function ChoiceRow<Entry extends Choice>(
	props: ModelChoiceListProps<Entry> & { readonly entry: Entry; readonly depth: number },
): JSX.Element {
	const { entry, onChoose } = props;
	const selected = entry.id === props.lit;
	const open = useCallback((beside: boolean) => onChoose(entry, beside), [onChoose, entry]);
	const dataset = useMemo(() => ({ [props.attribute]: entry.id }), [props.attribute, entry.id]);
	return (
		<Tree.Row
			id={entry.id}
			depth={props.depth}
			selected={selected}
			current={selected}
			dataset={dataset}
			label={props.rowLabel?.(entry)}
			flat={props.flat}
			leaf={props.depth > 0}
			onOpen={open}
		>
			<ChoiceLine {...props} />
		</Tree.Row>
	);
}

/**
 * The name of an entry, and what the row says at its end.
 * @param props The entry and its list.
 * @returns The line.
 */
function ChoiceLine<Entry extends Choice>(
	props: ModelChoiceListProps<Entry> & { readonly entry: Entry; readonly depth: number },
): JSX.Element {
	const { entry, facts } = props;
	const claims = claimsOn(props.claimed, [entry.id]);
	return (
		<>
			<Tree.Name text={entry.name} title={entry.title} inMarker={props.depth > 0} />
			{(facts !== undefined || claims.length > 0) && (
				<Tree.Facts>
					{claims.length > 0 && <ClaimMark purposes={claims} />}
					{facts?.(entry)}
				</Tree.Facts>
			)}
		</>
	);
}

export { ModelChoiceList };
