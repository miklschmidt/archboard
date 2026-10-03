// A variant's row: one reading of the board above it. Its mark says its
// lifecycle (variant-lifecycle), and its name is set smaller and lighter than
// a board's, so a reader tells a board from its variants at a glance. A
// historical or shelved variant recedes, unless it is the selected row. The
// pane letters say which pane shows exactly this variant.

import type { JSX } from "react";

import { PaneChips } from "@/ui/shell/components/PaneChips";
import {
	TreeRow,
	TreeRowDisclosure,
	TreeRowFacts,
	TreeRowMarker,
	TreeRowName,
	type RowHandlers,
} from "@/ui/shell/components/TreeRow";
import type { VariantRow } from "@/ui/shell/types/navigator-rows";
import { VariantMark, variantRecedes, type Lane } from "@/ui/variant-lifecycle";

/**
 * A variant row's accessible name.
 * @param row The row.
 * @returns The name.
 */
function variantRowName(row: VariantRow): string {
	const { name, lifecycle } = row.variant;
	const panes = row.onScreen.length > 0 ? `, shown in pane ${row.onScreen.join(" and ")}` : "";
	return `${name}, ${lifecycle}${panes}`;
}

/**
 * A variant's row.
 * @param props The row and the tree's handlers.
 * @returns The row.
 */
function VariantLine(
	props: RowHandlers & {
		readonly row: VariantRow;
		readonly lane?: Lane | undefined;
		readonly guides?: string | undefined;
	},
): JSX.Element {
	const { row } = props;
	const { lifecycle } = row.variant;
	const muted = variantRecedes(lifecycle) && !row.selected ? "text-muted-foreground" : "";
	return (
		<TreeRow {...props} label={variantRowName(row)}>
			<TreeRowDisclosure row={row} name={row.variant.name} onExpand={props.onExpand} />
			<TreeRowMarker>
				<VariantMark lifecycle={lifecycle} />
			</TreeRowMarker>
			<TreeRowName
				text={row.variant.name}
				match={row.match}
				boardKey={row.variant.key}
				title={row.variant.name}
				className={`text-control ${row.selected ? "font-medium" : "font-normal"} ${muted}`}
			/>
			<TreeRowFacts>
				<PaneChips letters={row.onScreen} />
			</TreeRowFacts>
		</TreeRow>
	);
}

export { VariantLine };
