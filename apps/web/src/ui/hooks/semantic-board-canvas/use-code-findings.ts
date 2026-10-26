// What the last code pass found on the board on screen.
//
// The server remembers the findings of the last pass that read each board at
// each variant, with the version of the board it read (ADR 0046). A pane shows
// them only over that version of that variant. A board that moved since the
// pass is a board the pass did not read: a right change to it must clear what
// the pass said, and it does, at once. The next pass that somebody runs speaks
// for the new version.

import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";

import type { RememberedFindingsSchema } from "@archboard/code-intel/code-check";
import type { z } from "zod";
import { codeFindingsQuery } from "#ui/clients/semantic-board-canvas/reads/queries.ts";
import { usePaneVault } from "#ui/hooks/semantic-board-canvas/use-pane-vault.ts";

/** What the last pass found on one board at one variant. */
type RememberedFindings = z.infer<typeof RememberedFindingsSchema>;
type RememberedReading = RememberedFindings["readings"][number];

/** One board as it is on screen: its name, the variant drawn, by id, and the version drawn. */
interface ReadingOnScreen {
	/** The vault the board is in. */
	readonly vault: string;
	readonly board: string;
	readonly variant: string;
	readonly version: number;
}

/**
 * The reading of the last pass over the board, variant and version on screen,
 * in the pane's own vault.
 * @param on What is on screen, or null when nothing is.
 * @returns The reading, or null when no pass read exactly that.
 */
function useCodeFindings(on: Omit<ReadingOnScreen, "vault"> | null): RememberedReading | null {
	const board = on?.board;
	const variant = on?.variant;
	const version = on?.version;
	const select = useCallback(
		(remembered: RememberedFindings): RememberedReading | null =>
			remembered.readings.find(
				(reading) =>
					reading.board === board && reading.variant === variant && reading.version === version,
			) ?? null,
		[board, variant, version],
	);
	const { data } = useQuery({
		...codeFindingsQuery(usePaneVault()),
		select,
		enabled: on !== null,
	});
	return data ?? null;
}

export { useCodeFindings, type ReadingOnScreen };
