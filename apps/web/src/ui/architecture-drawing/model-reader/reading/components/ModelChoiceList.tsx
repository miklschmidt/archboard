import { useCallback, useMemo, type JSX, type ReactNode } from "react";

import { ClaimMark } from "#ui/shell/components/ActivityLamp.tsx";
import { Tree } from "#ui/shell/components/Tree.tsx";
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
}

/** A row of the list. */
interface ChoiceTreeRow<Entry> {
	readonly id: string;
	readonly parent: null;
	readonly branch: false;
	readonly open: false;
	readonly entry: Entry;
}

/**
 * A list that stays open while the reader walks it, and holds the same rows wherever they stand.
 * @param props The entries and what choosing one does.
 * @returns The list.
 */
function ModelChoiceList<Entry extends Choice>(props: ModelChoiceListProps<Entry>): JSX.Element {
	const { entries, lit, onChoose } = props;
	const rows = useMemo(
		(): readonly ChoiceTreeRow<Entry>[] =>
			entries.map((entry) => ({ id: entry.id, parent: null, branch: false, open: false, entry })),
		[entries],
	);
	const open = useCallback(
		(row: ChoiceTreeRow<Entry>, beside: boolean): void => onChoose(row.entry, beside),
		[onChoose],
	);
	return (
		<Tree label={props.label} rows={rows} home={lit} onOpen={open}>
			{entries.map((entry) => (
				<ChoiceRow key={entry.id} {...props} entry={entry} />
			))}
		</Tree>
	);
}

/**
 * One entry in the list.
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
		<Tree.Row
			id={entry.id}
			depth={0}
			selected={selected}
			current={selected}
			dataset={dataset}
			label={props.rowLabel?.(entry)}
			flat={props.flat}
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
	props: ModelChoiceListProps<Entry> & { readonly entry: Entry },
): JSX.Element {
	const { entry, facts } = props;
	const claims = claimsOn(props.claimed, [entry.id]);
	return (
		<>
			<Tree.Name text={entry.name} title={entry.title} />
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
