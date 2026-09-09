// A compact two-column facts table and the one row it repeats.

import type { JSX } from "react";

import { Technical } from "@/ui/dialog-parts/components/Technical";

/** One row of a facts table. */
interface FactRow {
	label: string;
	value: string;
	/** True for identifiers, paths and times, which are set in the mono face. */
	technical: boolean;
}

/** Inputs for the facts table. */
interface FactsProps {
	rows: readonly FactRow[];
}

/**
 * A compact two-column facts table.
 * @param props The rows.
 * @returns The definition list.
 */
function Facts(props: FactsProps): JSX.Element {
	return (
		<dl className="text-body grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-1.5">
			{props.rows.map((row) => (
				<Fact key={row.label} row={row} />
			))}
		</dl>
	);
}

/** Inputs for one fact. */
interface FactProps {
	row: FactRow;
}

/**
 * One label and value.
 * @param props The row.
 * @returns A definition pair.
 */
function Fact(props: FactProps): JSX.Element {
	const { row } = props;
	return (
		<div className="contents">
			<dt className="text-muted-foreground">{row.label}</dt>
			<dd className="min-w-0">{row.technical ? <Technical>{row.value}</Technical> : row.value}</dd>
		</div>
	);
}

export { Facts, type FactRow, type FactsProps };
