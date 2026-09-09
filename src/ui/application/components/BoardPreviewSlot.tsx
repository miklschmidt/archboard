// What a navigator row draws for one board, and the binding the shell is
// handed to draw it with.
//
// A board a pane holds is drawn from that pane's own scene; every other board
// from the server's snapshot, which the catalog caches (ADR 0015, TASK-167).
// Which of the two applies is decided here, where both are known, and never by
// the shell, which is handed the renderer and asks nothing about it. The
// binding lives beside the markup it exists to produce.

import type { JSX, ReactNode } from "react";

import type { MountedPreviews } from "@/ui/application/hooks/use-mounted-previews";
import { BoardPreview } from "@/ui/board-catalog";
import type { RenderBoardPreview, ThemeChoice } from "@/ui/shell";

/** One row's board, and what is known about how to depict it. */
interface BoardPreviewSlotProps {
	boardKey: string;
	boardName: string;
	/** The scenes the panes are holding, by board key. */
	previews: MountedPreviews;
	/** The board keys the panes hold. */
	holding: ReadonlySet<string>;
	theme: ThemeChoice;
}

/**
 * One navigator row's preview.
 * @param props The board, what the panes hold, and the theme.
 * @returns The preview card.
 */
function BoardPreviewSlot(props: BoardPreviewSlotProps): JSX.Element {
	const { boardKey } = props;
	return (
		<BoardPreview
			boardKey={boardKey}
			boardName={props.boardName}
			mounted={props.previews.byBoard[boardKey] ?? null}
			held={props.holding.has(boardKey)}
			theme={props.theme}
		/>
	);
}

/**
 * The renderer the shell calls for each row's preview. Not a hook: the
 * application memoises it over the panes, the boards they hold and the theme,
 * which is everything a row needs and nothing a row should have to ask for.
 * @param previews The scenes the panes are holding, by board key.
 * @param holding The board keys the panes hold.
 * @param theme The theme to draw in.
 * @returns The row's preview renderer.
 */
function previewRenderer(
	previews: MountedPreviews,
	holding: ReadonlySet<string>,
	theme: ThemeChoice,
): RenderBoardPreview {
	return (boardKey: string, boardName: string): ReactNode => (
		<BoardPreviewSlot
			boardKey={boardKey}
			boardName={boardName}
			previews={previews}
			holding={holding}
			theme={theme}
		/>
	);
}

export { BoardPreviewSlot, previewRenderer, type BoardPreviewSlotProps };
