// A variant's row: one reading of the board above it. Its mark says its
// lifecycle, and its name is set smaller and lighter than a board's, so a
// reader tells a board from its variants at a glance. A historical or shelved
// variant recedes. The pane letters say which pane shows exactly this variant.

import {
	RiArchiveLine,
	RiCheckboxCircleLine,
	RiGitBranchLine,
	RiTimeLine,
	type RemixiconComponentType,
} from "@remixicon/react";
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
import type { ListedVariant } from "@/ui/types";

/** A variant's lifecycle. */
type Lifecycle = ListedVariant["lifecycle"];

/** The mark of each lifecycle: built, a proposal, formerly current, let go. */
const LIFECYCLE_ICONS: Readonly<Record<Lifecycle, RemixiconComponentType>> = {
	current: RiCheckboxCircleLine,
	draft: RiGitBranchLine,
	historical: RiTimeLine,
	shelved: RiArchiveLine,
};

/**
 * Whether a lifecycle recedes: the board has moved past it.
 * @param lifecycle The lifecycle.
 * @returns True for historical and shelved.
 */
function recedes(lifecycle: Lifecycle): boolean {
	return lifecycle === "historical" || lifecycle === "shelved";
}

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
function VariantLine(props: RowHandlers & { readonly row: VariantRow }): JSX.Element {
	const { row } = props;
	const { lifecycle } = row.variant;
	const muted = recedes(lifecycle) ? "text-muted-foreground" : "";
	return (
		<TreeRow {...props} label={variantRowName(row)}>
			<TreeRowDisclosure row={row} name={row.variant.name} onExpand={props.onExpand} />
			<TreeRowMarker
				icon={LIFECYCLE_ICONS[lifecycle]}
				tone={lifecycle === "current" ? "text-foreground" : "text-muted-foreground"}
				title={lifecycle}
			/>
			<TreeRowName
				text={row.variant.name}
				match={row.match}
				boardKey={row.variant.key}
				title={row.variant.name}
				className={`text-body ${row.selected ? "font-medium" : ""} ${muted}`}
			/>
			<TreeRowFacts>
				<PaneChips letters={row.onScreen} />
			</TreeRowFacts>
		</TreeRow>
	);
}

export { VariantLine };
