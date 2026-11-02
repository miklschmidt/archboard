// A pane's subscription to its own board's news.
//
// The picture has no timer behind it (see `queries.ts`), so this is the whole
// of what makes it out of date: the server announced a new version of this
// board over the pane socket, and every drawing of it is now a picture of
// something that is no longer there.

import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { sameModelName } from "#ui/rules/canvas/reading/address.ts";
import { onModelChange } from "#ui/state/canvas/model-changes.ts";
import { modelChanged } from "#ui/clients/canvas/reads/read-refresh.ts";

/**
 * Ask the server for this board's picture again whenever it changes.
 * @param vault The vault the board is in.
 * @param model The board as this reader asks for it.
 * @param goesBy The name the board goes by now, when this reader asks for it by
 *   a name it had before a rename (ADR 0036); its news is announced under this.
 */
function useModelChanges(vault: string, model: string, goesBy: string = model): void {
	const client = useQueryClient();
	useEffect(
		() =>
			onModelChange((inVault, changed): void => {
				if (inVault !== vault) {
					return;
				}
				if (sameModelName(changed, model) || sameModelName(changed, goesBy)) {
					void modelChanged(client, vault, model);
				}
			}),
		[model, client, goesBy, vault],
	);
}

export { useModelChanges };
