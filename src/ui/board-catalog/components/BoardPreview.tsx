// One board's preview, from whichever source is entitled to depict it.
//
// The precedence is the point of this file. A board a pane holds is depicted
// from that pane's mounted scene, which is what the person is actually looking
// at; every other board is depicted from the server's snapshot. They are two
// stores, not one slot, so a snapshot that was asked for before a pane adopted
// the board and answered after cannot overwrite the live scene: it lands in
// the cache and loses the choice below. While a pane holds a board its query
// is disabled, so nothing is fetched for it, and the snapshot already in hand
// still shows until the pane's first frame arrives rather than blanking.

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { boardPreviewQuery } from "@/ui/board-catalog/lib/queries";
import { previewSourceFor } from "@/ui/board-catalog/preview-source";
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
function BoardPreview(props: BoardPreviewProps): React.JSX.Element {
	const { boardKey, mounted, held } = props;
	const snapshot = useQuery({ ...boardPreviewQuery(boardKey), enabled: !held });
	const gate = useMemo(() => new PreviewRequestGate(), []);
	const source = previewSourceFor({ mounted, cached: snapshot.data, held });
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
