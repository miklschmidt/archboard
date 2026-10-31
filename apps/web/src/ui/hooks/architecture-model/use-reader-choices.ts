import { useCallback, useContext, type RefObject } from "react";
import type { Model } from "@archboard/board/content";
import type { Destination } from "#ui/components/architecture-model/ModelColumn.tsx";
import type { useModelLocation } from "#ui/hooks/architecture-model/use-model-location.ts";
import { usePaneChrome } from "#ui/hooks/semantic-board-canvas/use-pane-chrome.ts";
import type { FindHit } from "#ui/rules/architecture-model/search.ts";
import { ModelWalkthroughContext } from "#ui/state/architecture-model/presentation.ts";

/** What a choice in the left column reaches. */
interface ReaderChoiceInputs {
	readonly location: ReturnType<typeof useModelLocation>;
	readonly model: Model;
	/** The module the reading opens. */
	readonly opened: string | null;
	readonly area: RefObject<HTMLElement | null>;
	readonly selectMany: (ids: readonly string[]) => void;
	readonly onOpen: (next: string | null) => void;
	readonly onDestination: (destination: Destination) => void;
}

/**
 * What a choice in the left column does, here or, with Alt, in the other pane.
 * @param inputs The reading and how it moves.
 * @returns A choice of a module, a flow, or something found, and the way to show each of them.
 */
function useReaderChoices(inputs: ReaderChoiceInputs) {
	const { location, model, opened, area, selectMany, onOpen, onDestination } = inputs;
	const { open, openFlow, selectBookmark, selectLegacyAddress } = location;
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
				const scope = opened ?? undefined;
				openBeside?.(modelId, { scope, flow: id, grammar: "sequence" });
				return;
			}
			leave?.();
			openFlow(id);
		},
		[openBeside, modelId, opened, leave, openFlow],
	);
	const showHere = useCallback(
		(ids: readonly string[], scope: string | null): void => {
			leave?.();
			open(modelId, scope);
			selectMany(ids);
			// The keys of the picture go on from what was found.
			area.current?.querySelector<HTMLElement>('[data-slot="model-diagram"]')?.focus();
		},
		[leave, open, modelId, selectMany, area],
	);
	const findModule = useCallback(
		(id: string, beside: boolean): void => {
			const scope = model.modules.find((module) => module.id === id)?.parent;
			if (beside) openBeside?.(modelId, { scope, module: id });
			else showHere([id], scope ?? null);
		},
		[model.modules, openBeside, modelId, showHere],
	);
	const findFlow = useCallback(
		(id: string, beside: boolean): void => {
			onDestination("flows");
			chooseFlow(id, beside);
		},
		[onDestination, chooseFlow],
	);
	const findWalkthrough = useCallback(
		(id: string): void => {
			onDestination("walkthroughs");
			start?.(id);
		},
		[onDestination, start],
	);
	const chooseFind = useCallback(
		(hit: FindHit, beside: boolean): void => {
			if (hit.kind === "module") findModule(hit.id, beside);
			else if (hit.kind === "flow") findFlow(hit.id, beside);
			else if (hit.kind === "walkthrough") findWalkthrough(hit.id);
			else if (hit.kind === "bookmark") selectBookmark(hit.id);
			else selectLegacyAddress(hit.id);
		},
		[findModule, findFlow, findWalkthrough, selectBookmark, selectLegacyAddress],
	);
	return { chooseModule, chooseFlow, chooseFind, findFlow, findModule, findWalkthrough, showHere };
}

export { useReaderChoices };
