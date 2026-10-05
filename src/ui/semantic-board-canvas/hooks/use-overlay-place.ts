// Where the shell's overlay is laid, for the overlay to read where it is drawn.
//
// The stage knows nothing of what the shell lays over the picture. It lays it in one of two places,
// and says which: free over the picture, low in the frame, when no walkthrough is presented, and at the
// foot of a presented walkthrough's box, where the box gives it a pill of its own. What is laid there
// draws itself to fit.

import { createContext, useContext } from "react";

/** Where an overlay is laid. */
type OverlayPlace = "free" | "foot";

/** Where the overlay being drawn is laid: free, outside any stage. */
const OverlayPlaceContext = createContext<OverlayPlace>("free");

/**
 * Where the overlay being drawn is laid.
 * @returns The place.
 */
function useOverlayPlace(): OverlayPlace {
	return useContext(OverlayPlaceContext);
}

export { OverlayPlaceContext, useOverlayPlace, type OverlayPlace };
