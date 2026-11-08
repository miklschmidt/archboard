import { useCallback, useContext, type RefObject } from "react";
import type { Model } from "@archboard/model/content";
import type { useFlowReadings } from "#ui/architecture-drawing/model-reader/hooks/use-flow-readings.ts";
import type { useModelLocation } from "#ui/panes/reading-routing/hooks/use-model-location.ts";
import { usePaneChrome } from "#ui/architecture-drawing/canvas/picture/reads/hooks/use-pane-chrome.ts";
import type { FindHit } from "#ui/architecture-drawing/model-reader/rules/search.ts";
import { ModelWalkthroughContext } from "#ui/architecture-drawing/model-reader/state/presentation.ts";

/** What a choice in the left column reaches. */
interface ReaderChoiceInputs {
	readonly location: ReturnType<typeof useModelLocation>;
	/** How a flow opens in the reading that fits it best, here or in a pane not laid out yet. */
	readonly flows: Pick<ReturnType<typeof useFlowReadings>, "openFlow" | "fitting">;
	readonly model: Model;
	/** The module the reading opens. */
	readonly opened: string | null;
	/** Every module the reading draws open. */
	readonly frames: ReadonlySet<string | null>;
	readonly area: RefObject<HTMLElement | null>;
	readonly selectMany: (ids: readonly string[]) => void;
	readonly onOpen: (next: string | null) => void;
}

/**
 * What a choice in the left column does, here or, with Alt, in the other pane.
 * @param inputs The reading and how it moves.
 * @returns A choice of a module, a flow, or something found, and the way to show each of them.
 */
function useReaderChoices(inputs: ReaderChoiceInputs) {
	const { location, flows, model, opened, frames, area, selectMany, onOpen } = inputs;
	const { open, selectBookmark, selectLegacyAddress } = location;
	const { openFlow, fitting } = flows;
	const { openBeside } = usePaneChrome();
	const playback = useContext(ModelWalkthroughContext);
	const { id: modelId } = model.manifest;
	const leave = playback?.leave;
	const start = playback?.select;
	const chooseModule = useCallback(
		(id: string, beside: boolean): void => {
			if (beside) openBeside?.(modelId, { scope: id });
			else onOpen(id);
		},
		[openBeside, modelId, onOpen],
	);
	const chooseFlow = useCallback(
		(id: string, beside: boolean): void => {
			if (beside) {
				/**
				 * Open the flow beside, in the reading that fits a pane best.
				 * @returns Once the other pane is asked to open it.
				 */
				const besides = async (): Promise<void> => {
					const grammar = await fitting(id, null);
					openBeside?.(modelId, { scope: opened ?? undefined, flow: id, grammar });
				};
				void besides();
				return;
			}
			leave?.();
			openFlow(id);
		},
		[openBeside, modelId, opened, leave, openFlow, fitting],
	);
	const showHere = useCallback(
		(ids: readonly string[], scope: string | null): void => {
			leave?.();
			// A module the picture already draws open stays where it stands, beside the others.
			open(modelId, frames.has(scope) ? opened : scope);
			selectMany(ids);
			// The keys of the picture go on from what was found.
			area.current?.querySelector<HTMLElement>('[data-slot="model-diagram"]')?.focus();
		},
		[leave, open, modelId, opened, frames, selectMany, area],
	);
	const findModule = useCallback(
		(id: string, beside: boolean): void => {
			const scope = model.modules.find((module) => module.id === id)?.parent;
			if (beside) openBeside?.(modelId, { scope, module: id });
			else showHere([id], scope ?? null);
		},
		[model.modules, openBeside, modelId, showHere],
	);
	const findWalkthrough = useCallback((id: string): void => start?.(id), [start]);
	const chooseFind = useCallback(
		(hit: FindHit, beside: boolean): void => {
			if (hit.kind === "module") findModule(hit.id, beside);
			else if (hit.kind === "flow") chooseFlow(hit.id, beside);
			else if (hit.kind === "walkthrough") findWalkthrough(hit.id);
			else if (hit.kind === "bookmark") selectBookmark(hit.id);
			else selectLegacyAddress(hit.id);
		},
		[findModule, chooseFlow, findWalkthrough, selectBookmark, selectLegacyAddress],
	);
	return { chooseModule, chooseFlow, chooseFind, findModule, findWalkthrough, showHere };
}

export { useReaderChoices };
