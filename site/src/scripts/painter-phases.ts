// What the site's painters (ADR 0071) are told about time, as the app tells its own.

import { PICTURE_ENTRY_PHASES, PICTURE_MS, PICTURE_TRANSITION_PHASES } from "@archboard/timing";

/** At which points of a move each of its parts happens, as the painter reads them. */
export const PHASES = JSON.stringify({
	transition: PICTURE_TRANSITION_PHASES,
	entry: PICTURE_ENTRY_PHASES,
	enter: PICTURE_MS.entry,
	exit: PICTURE_MS.exit,
	shutter: PICTURE_MS.shutter,
});
