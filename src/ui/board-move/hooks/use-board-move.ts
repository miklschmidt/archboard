// One move a person is about to make: the repositories the board can move to,
// what moving it to the one chosen would rewrite, and the move itself.
//
// The preview is read again whenever the pane hears that the board changed, so
// what the dialog lists is what the move would do with the board as it is. A
// drill-down another board gained since is still rewritten: the move checks
// and rewrites everything again under its leases.

import { queryOptions, skipToken, useMutation, useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";

import type { RepositoryEntry } from "@/shared/repositories";
import { repositoriesQuery } from "@/ui/board-catalog";
import { moveBoard, previewMove, type MoveAsked } from "@/ui/board-move/api/move";
import type { PaneStatus } from "@/ui/types";

/** The pane's board, from the vault it is in. */
type MovingBoard = Pick<MoveAsked, "vault" | "board"> & Pick<PaneStatus, "repository" | "version">;

/**
 * Every repository a board can move to: each one whose boards can be read now,
 * other than the board's own.
 * @param listed The repositories the navigator lists, or undefined before they are read.
 * @param board The board that moves.
 * @returns The targets, as listed, or undefined before they are read.
 */
function targetsOf(
	listed: readonly RepositoryEntry[] | undefined,
	board: MovingBoard,
): RepositoryEntry[] | undefined {
	return listed?.filter(
		(each) =>
			each.state === "ready" &&
			each.vault !== null &&
			each.vault !== board.vault &&
			each.name !== board.repository,
	);
}

/**
 * The read of what a move would do, as the board is at one version.
 * @param asked The board and the two vaults, or null before a target is chosen.
 * @param version The board's version as the pane last heard it.
 * @returns The query's options.
 */
function movePreviewQuery(asked: MoveAsked | null, version: number | null) {
	return queryOptions({
		queryKey: ["board-move-preview", asked, version],
		queryFn: asked === null ? skipToken : readPreview(asked),
		retry: false,
		staleTime: 0,
		gcTime: 0,
	});
}

/**
 * The read of one preview.
 * @param asked The board and the two vaults.
 * @returns The query's function.
 */
function readPreview(asked: MoveAsked) {
	return (context: { readonly signal: AbortSignal }) => previewMove(asked, context.signal);
}

/**
 * The repositories a board can move to, the one chosen, and the move it asks for.
 * @param board The board that moves.
 * @returns The targets, the choice, and the move, or null before a target is chosen.
 */
function useMoveTarget(board: MovingBoard) {
	const targets = targetsOf(useQuery(repositoriesQuery()).data?.repositories, board);
	const [chosen, choose] = useState<string | null>(null);
	const to = targets?.find((each) => each.name === chosen)?.vault ?? null;
	const asked = useMemo(
		() => (to === null ? null : { vault: board.vault, board: board.board, to }),
		[board.vault, board.board, to],
	);
	return { targets, chosen, choose, asked };
}

/**
 * The repositories a board can move to, the preview for the one chosen, and the move.
 * @param board The board that moves.
 * @param onMoved Called once the move has finished.
 * @returns What the dialog shows and does.
 */
function useBoardMove(board: MovingBoard, onMoved: () => void) {
	const { asked, ...target } = useMoveTarget(board);
	const preview = useQuery(movePreviewQuery(asked, board.version));
	const move = useMutation({ mutationFn: moveTo, onSuccess: onMoved });
	const { mutate } = move;
	const version = preview.data?.version;
	const confirm = useCallback(() => {
		if (asked !== null && version !== undefined) mutate({ asked, version });
	}, [asked, mutate, version]);
	// A refusal answers the target it was asked for, not one chosen since.
	const refused = move.variables?.asked === asked ? move.error : null;
	return { ...target, preview, moving: move.isPending, refused, confirm };
}

/**
 * Move a board as the version its preview read.
 * @param request The board, the two vaults and the version.
 * @param request.asked The board and the two vaults.
 * @param request.version The version the preview read.
 * @returns The move's answer.
 */
function moveTo(request: { readonly asked: MoveAsked; readonly version: number }) {
	return moveBoard(request.asked, request.version);
}

export { useBoardMove, type MovingBoard };
