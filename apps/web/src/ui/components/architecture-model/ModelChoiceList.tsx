import { useCallback, useMemo, type JSX, type ReactNode } from "react";

import { Tree } from "#ui/components/shell/Tree.tsx";
import { NAME_GAP, ROW_GUTTER } from "#ui/rules/shell/tree-grid.ts";

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
	/** What a row says under its name, across the whole row. */
	readonly detail?: ((entry: Entry) => ReactNode) | undefined;
	/** The section that a row stands in. Neighbours in one section share its name. */
	readonly sectionOf?: ((entry: Entry) => string) | undefined;
	/** What stands under the lit row. */
	readonly under?: ReactNode;
}

/** The space a control under a row keeps from the column's edge. */
const UNDER_STYLE = { paddingLeft: 24 - ROW_GUTTER } as const;
/** The space a name with words under it keeps from the marker column. */
const WORDS_STYLE = { marginLeft: NAME_GAP } as const;

/**
 * A list that stays open while the reader walks it, and holds the same rows wherever they stand.
 * @param props The entries and what choosing one does.
 * @returns The list.
 */
function ModelChoiceList<Entry extends Choice>(props: ModelChoiceListProps<Entry>): JSX.Element {
	const { entries, lit, onChoose } = props;
	const rows = useMemo(
		() =>
			entries.map((entry) => ({ id: entry.id, parent: null, branch: false, open: false, entry })),
		[entries],
	);
	const open = useCallback(
		(row: (typeof rows)[number], beside: boolean): void => onChoose(row.entry, beside),
		[onChoose],
	);
	return (
		<Tree label={props.label} rows={rows} home={lit} onOpen={open}>
			<ChoiceRows {...props} />
		</Tree>
	);
}

/**
 * Neighbours that stand in one section.
 * @param entries The entries, in their order.
 * @param sectionOf The section of an entry.
 * @returns Each run of neighbours with its section.
 */
function sectionRuns<Entry>(
	entries: readonly Entry[],
	sectionOf: (entry: Entry) => string,
): readonly { readonly label: string; readonly entries: readonly Entry[] }[] {
	return entries.reduce<{ label: string; entries: Entry[] }[]>((runs, entry) => {
		const label = sectionOf(entry);
		const last = runs.at(-1);
		if (last?.label === label) last.entries.push(entry);
		else runs.push({ label, entries: [entry] });
		return runs;
	}, []);
}

/**
 * The rows of some entries, in their sections when the list has sections.
 * @param props The entries and their list.
 * @returns The rows.
 */
function ChoiceRows<Entry extends Choice>(props: ModelChoiceListProps<Entry>): JSX.Element {
	const { entries, sectionOf } = props;
	if (sectionOf === undefined)
		return (
			<>
				{entries.map((entry) => (
					<ChoiceRow key={entry.id} {...props} entry={entry} />
				))}
			</>
		);
	return (
		<>
			{sectionRuns(entries, sectionOf).map((run) => (
				<Tree.Section key={run.entries[0]!.id} label={run.label} depth={0}>
					{run.entries.map((entry) => (
						<ChoiceRow key={entry.id} {...props} entry={entry} />
					))}
				</Tree.Section>
			))}
		</>
	);
}

/**
 * One entry, and what stands under it while it is lit.
 * @param props The entry and its list.
 * @returns The row.
 */
function ChoiceRow<Entry extends Choice>(
	props: ModelChoiceListProps<Entry> & { readonly entry: Entry },
): JSX.Element {
	const { entry, onChoose } = props;
	const selected = entry.id === props.lit;
	const open = useCallback((beside: boolean) => onChoose(entry, beside), [onChoose, entry]);
	const dataset = useMemo(() => ({ [props.attribute]: entry.id }), [props.attribute, entry.id]);
	return (
		<>
			<Tree.Row
				id={entry.id}
				depth={0}
				selected={selected}
				current={selected}
				dataset={dataset}
				onOpen={open}
			>
				{props.detail === undefined ? (
					<ChoiceLine {...props} />
				) : (
					<span className="flex min-w-0 flex-1 flex-col">
						<span className="flex min-w-0 items-center">
							<ChoiceLine {...props} />
						</span>
						<span style={WORDS_STYLE}>{props.detail(entry)}</span>
					</span>
				)}
			</Tree.Row>
			{selected && props.under !== undefined && (
				<div style={UNDER_STYLE} className="py-1">
					{props.under}
				</div>
			)}
		</>
	);
}

/**
 * The name of an entry, and what the row says at its end.
 * @param props The entry and its list.
 * @returns The line.
 */
function ChoiceLine<Entry extends Choice>(
	props: ModelChoiceListProps<Entry> & { readonly entry: Entry },
): JSX.Element {
	const { entry, facts } = props;
	return (
		<>
			<Tree.Name text={entry.name} title={entry.title} />
			{facts !== undefined && <Tree.Facts>{facts(entry)}</Tree.Facts>}
		</>
	);
}

export { ModelChoiceList };
