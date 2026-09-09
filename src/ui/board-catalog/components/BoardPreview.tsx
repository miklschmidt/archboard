// One board's preview card, over whichever source is entitled to depict it.

import { useMemo, type JSX } from "react";

import { useBoardPreviewSource } from "@/ui/board-catalog/hooks/use-board-preview-source";
import {
	BoardPreviewCache,
	PreviewRequestGate,
	type MountedPreviewSnapshot,
	type PreviewTheme,
} from "@/ui/board-preview";
import { PreviewCard } from "@/ui/board-preview/PreviewCard";

/** One cache for every preview on screen; it revokes the Blob URLs it drops. */
const PREVIEW_CACHE = new BoardPreviewCache(16);

/** What one board's preview is drawn from. */
interface BoardPreviewProps {
	/** The board key, which the server snapshot is cached under. */
	boardKey: string;
	/** The board's name, for the image's alternative text. */
	boardName: string;
	/** The scene a pane last reported for this board, or null when none has. */
	mounted: MountedPreviewSnapshot | null;
	/** Whether a pane holds this board, which is what stops the server read. */
	held: boolean;
	theme: PreviewTheme;
}

/**
 * One board's preview card.
 * @param props The board, its mounted scene when a pane holds it, and the theme.
 * @returns The card.
 */
function BoardPreview(props: BoardPreviewProps): JSX.Element {
	const { boardKey, mounted, held } = props;
	const source = useBoardPreviewSource({ boardKey, mounted, held });
	const gate = useMemo(() => new PreviewRequestGate(), []);
	return (
		<PreviewCard
			board={props.boardName}
			snapshot={source}
			theme={props.theme}
			cache={PREVIEW_CACHE}
			gate={gate}
		/>
	);
}

export { BoardPreview, type BoardPreviewProps };
