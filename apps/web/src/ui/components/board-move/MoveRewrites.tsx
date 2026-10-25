// What a move would rewrite, read before the person moves the board: each
// drill-down that has to name the board's new repository, or no longer has to,
// and what it opens once the move is done. A refusal says why in the move's
// own words, as `semantic move` says it.

import type { UseQueryResult } from "@tanstack/react-query";
import type { JSX } from "react";

import type { BoardMovePreview } from "@archboard/board/commands";
import { MoveRefusal } from "#ui/components/board-move/MoveRefusal.tsx";
import { BusyText, Technical } from "@archboard/ui-kit/dialog-parts";
import type { MovedDrillDownSchema } from "@archboard/board/commands";
import type { z } from "zod";

type MovedDrillDown = z.infer<typeof MovedDrillDownSchema>;

/** Inputs for the rewrites. */
interface MoveRewritesProps {
	readonly preview: UseQueryResult<BoardMovePreview>;
}

/**
 * The drill-downs a move would rewrite, the read in progress, or its refusal.
 * @param props The preview's read.
 * @returns The list, progress or the refusal.
 */
function MoveRewrites(props: MoveRewritesProps): JSX.Element | null {
	const { preview } = props;
	if (preview.isError) {
		return <MoveRefusal title="This move would be refused" error={preview.error} />;
	}
	if (preview.data === undefined) {
		return <BusyText busy={preview.isFetching} text="Reading what the move would rewrite…" />;
	}
	const { rewritten } = preview.data;
	if (rewritten.length === 0) {
		return <p className="text-body">No drill-down names this board, so the move rewrites none.</p>;
	}
	return (
		<section aria-label="Drill-downs the move rewrites" className="flex flex-col gap-1.5">
			<p className="text-body">
				The move rewrites{" "}
				{rewritten.length === 1 ? "one drill-down" : `${rewritten.length} drill-downs`}:
			</p>
			<ul className="flex flex-col gap-1">
				{rewritten.map((one) => (
					<Rewrite key={`${one.vault}\n${one.board}\n${one.variant}\n${one.node}`} rewrite={one} />
				))}
			</ul>
		</section>
	);
}

/**
 * One drill-down a move would rewrite: the board that carries it, its node, and
 * what it opens after the move.
 * @param props The drill-down.
 * @param props.rewrite The drill-down, as it would read.
 * @returns A list item.
 */
function Rewrite(props: { readonly rewrite: MovedDrillDown }): JSX.Element {
	const { board, node, drillDown } = props.rewrite;
	return (
		<li className="text-body flex flex-wrap items-baseline gap-x-1.5">
			<span className="font-medium">{board}</span>
			<Technical>{node}</Technical>
			<span className="text-muted-foreground">
				opens {drillDown.board}
				{drillDown.repo === undefined ? " in its own repository" : ` in ${drillDown.repo}`}
			</span>
		</li>
	);
}

export { MoveRewrites };
