import { useMemo } from "react";
import type { WalkthroughNarration } from "#ui/rules/semantic-board-canvas/walkthrough/narration.ts";

/**
 * Start narration after the server accepts the exact reading that it consumes.
 * @param narration The existing pane voice action.
 * @param flush Publish the latest reading and refuse a superseded report.
 * @param onError Show a recoverable publication failure.
 * @returns The existing action with ordered report delivery.
 */
function usePublishedNarration(
	narration: WalkthroughNarration | undefined,
	flush: () => Promise<boolean>,
	onError: (message: string) => void,
): WalkthroughNarration | undefined {
	return useMemo(() => {
		if (narration === undefined) return undefined;
		let pending = false;
		return {
			...narration,
			/**
			 * Deliver one request after its captured reading reaches the server.
			 * @param walkthrough The captured narrative identity.
			 */
			start: (walkthrough: string): void => {
				if (pending) return;
				pending = true;
				void flush().then((current) => {
					pending = false;
					if (current) narration.start(walkthrough);
					else
						onError(
							"The reading changed or could not reach the server. Reopen the walkthrough and try narration again.",
						);
					return undefined;
				});
			},
		};
	}, [narration, flush, onError]);
}

export { usePublishedNarration };
