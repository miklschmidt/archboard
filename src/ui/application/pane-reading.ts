import type { PickedSubject } from "@/ui/application/hooks/use-pane-reading";
import { NOTHING_READ, type PaneReading } from "@/ui/pane-session";
import { boardAddressOf, boardKeyFor, type SemanticPaneReading } from "@/ui/semantic-board-canvas";

/**
 * What this pane is reading, as the server records it.
 *
 * Built from what the STAGE says is on screen, not from the pane's address.
 * They differ exactly when it matters: following a drill-down puts another
 * board there, and a beat of a walkthrough reads its variant through a view
 * nobody chose. A reading derived from the address would name the board the
 * pane was opened on and the view the person last picked, so an agent asked
 * "what is this?" would be told about a board nobody is looking at.
 * @param reading What the stage says is on screen.
 * @param picked What the person picked out, or null.
 * @returns The reading.
 */
function readingOf(reading: SemanticPaneReading | null, picked: PickedSubject | null): PaneReading {
	// A pending drawing cannot identify its variant or view. Reporting its bare
	// board would overwrite the adopted variant before the address restores it.
	if (!reading?.drawn) {
		return NOTHING_READ;
	}
	const address = boardAddressOf(reading.board);
	if (address === null) {
		return NOTHING_READ;
	}
	const { variant, view, version } = reading.drawn;
	// Current follows adoption; other variants retain their resolved identity.
	const key =
		variant.lifecycle === "current" ? reading.board : boardKeyFor(reading.board, variant.id);
	return {
		board: { name: address.board, key },
		variant,
		view,
		version,
		selection: picked === null ? [] : [picked],
		presentation: reading.presentation,
	};
}

export { readingOf };
