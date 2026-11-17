import type { JSX } from "react";
import {
	RiCheckDoubleLine,
	RiCheckboxCircleLine,
	RiGitCommitLine,
	RiHourglassLine,
	type RemixiconComponentType,
} from "@remixicon/react";
import type {
	FootprintList,
	ListKey,
} from "#ui/architecture-drawing/model-reader/reading/branch-footprint/rules/footprint-lists.ts";

/** The mark of each empty list: a check where the empty list is good news for a review. */
const MARK: Readonly<Record<ListKey, RemixiconComponentType>> = {
	namedAndChanged: RiHourglassLine,
	changedNotNamed: RiCheckboxCircleLine,
	namedNotChanged: RiCheckDoubleLine,
	changed: RiGitCommitLine,
};

/**
 * What stands in a card whose list is empty: a round mark, the outcome, and one line that says
 * why, in the middle of the card.
 * @param props The list.
 * @param props.list The empty list.
 * @returns The empty state.
 */
function EmptyList(props: { readonly list: FootprintList }): JSX.Element {
	const { key, empty } = props.list;
	const Mark = MARK[key];
	return (
		<div
			data-footprint-empty={key}
			className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-6 text-center"
		>
			<span className="bg-tray-sink shadow-well text-muted-foreground mb-1 flex size-10 items-center justify-center rounded-full">
				<Mark aria-hidden="true" className="size-5" />
			</span>
			<p className="text-control font-medium">{empty.outcome}</p>
			<p className="text-body text-muted-foreground max-w-64">{empty.detail}</p>
		</div>
	);
}

export { EmptyList };
