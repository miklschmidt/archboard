import { useCallback, useContext, useMemo, useRef, useState } from "react";
import type { ArchitectureModelRead } from "@archboard/board/model";
import type { VariantContent } from "@archboard/board/content";
import type { Destination } from "#ui/components/architecture-model/ModelColumn.tsx";
import type { Page } from "#ui/components/architecture-model/ModelHeading.tsx";
import { useAcceptedScene } from "#ui/hooks/architecture-model/use-accepted-scene.ts";
import { reviewsChanges, useChangeWalk } from "#ui/hooks/architecture-model/use-change-walk.ts";
import { useModelMoves } from "#ui/hooks/architecture-model/use-model-moves.ts";
import { useModelReading } from "#ui/hooks/architecture-model/use-model-reading.ts";
import { useProjectedSelection } from "#ui/hooks/architecture-model/use-model-selection.ts";
import { useModuleBranches } from "#ui/hooks/architecture-model/use-module-branches.ts";
import { useReaderChoices } from "#ui/hooks/architecture-model/use-reader-choices.ts";
import { useReaderMoves } from "#ui/hooks/architecture-model/use-reader-moves.ts";
import { useBoardCamera } from "#ui/hooks/semantic-board-canvas/use-board-camera.ts";
import { relevantFlows } from "#ui/rules/architecture-model/flow-reading.ts";
import { moduleTree } from "#ui/rules/architecture-model/module-tree.ts";
import { walkthroughsAbout } from "#ui/rules/architecture-model/relevance.ts";
import {
	ModelPaneContext,
	ModelWalkthroughContext,
} from "#ui/state/architecture-model/presentation.ts";

type Model = Extract<ArchitectureModelRead, { success: true }>;

/** What a reader reads, and where. */
interface ReaderInputs {
	readonly vault: string;
	readonly paneId: string;
	readonly model: Model;
	/** Whether the model is the answer to this address, not the last answer kept on screen. */
	readonly settled: boolean;
	/** Whether the read of this address failed, so that the model only stands in for it. */
	readonly failed?: boolean | undefined;
	readonly reducedMotion: boolean;
}

/** Which subject About describes. */
type AboutSubject = "scope" | "selection";

/** The module that About was opened on, and what it describes there. */
interface AboutPlace {
	readonly scope: string | null | undefined;
	readonly subject: AboutSubject;
}

/** About, closed on every module. */
const NO_ABOUT: AboutPlace = { scope: undefined, subject: "scope" };

/**
 * How the open module is read. The page is kept with the module it was chosen on, so another
 * module opens as a diagram. About opens on what is selected, or else on the open scope. A choice
 * from a list leaves it where it stands, so a reader builds a selection there, and a selection let
 * go leaves it the open scope.
 * @param opened The open module.
 * @param selecting Whether anything is selected.
 * @returns The page and what About describes, and how to change them.
 */
function useReaderPage(opened: string | null, selecting: boolean) {
	const [about, setAbout] = useState(NO_ABOUT);
	const { scope, subject } = about;
	const open = scope === opened;
	if (open && subject === "selection" && !selecting) setAbout({ scope, subject: "scope" });
	const onAbout = useCallback(
		(next: AboutSubject): void => setAbout({ scope: opened, subject: next }),
		[opened],
	);
	const onPage = useCallback(
		(next: Page): void => {
			if (next === "about") onAbout(selecting ? "selection" : "scope");
			else setAbout(NO_ABOUT);
		},
		[onAbout, selecting],
	);
	const onDiagram = useCallback((): void => setAbout(NO_ABOUT), []);
	const page: Page = open ? "about" : "diagram";
	return { page, onPage, onDiagram, aboutSubject: subject, onAbout };
}

/**
 * Where the left column stands and how the open module is read. A proposal that opens with the
 * reader starts on its changes, and its changes leave the column with it.
 * @param structural Whether the reading draws the structure.
 * @param opened The open module.
 * @param selecting Whether anything is selected.
 * @param proposal Whether a proposal is read against a base.
 * @returns The destination and the page, and how to change them.
 */
function useReaderPlaces(
	structural: boolean,
	opened: string | null,
	selecting: boolean,
	proposal: boolean,
) {
	const [chosen, setDestination] = useState<Destination>(() => {
		if (proposal) return "changes";
		return structural ? "modules" : "flows";
	});
	const openHistory = useCallback((): void => setDestination("history"), []);
	const onList = useCallback((): void => setDestination("changes"), []);
	return {
		destination: chosen === "changes" && !proposal ? "modules" : chosen,
		onDestination: setDestination,
		openHistory,
		onList,
		...useReaderPage(opened, selecting),
	};
}

/**
 * What concerns the open module.
 * @param model The reading.
 * @param depicted What it depicts.
 * @param opened The open module.
 * @returns Its flows and its walkthroughs, and the flows that `[` and `]` walk.
 */
function useRelevance(model: Model, depicted: VariantContent, opened: string | null) {
	const flows = useMemo(
		() => relevantFlows(depicted, new Set(opened === null ? [] : [opened])),
		[depicted, opened],
	);
	const walkthroughs = useMemo(() => walkthroughsAbout(model, opened), [model, opened]);
	return { flows, walkthroughs, walkedFlows: flows.length > 0 ? flows : depicted.flows };
}

/**
 * What a reader reads and everything that can move it. A move goes to the address, and
 * whatever reads what is on screen reads the accepted scene until that address is drawn.
 * @param inputs What is read, and where.
 * @returns The reading, its parts and its moves.
 */
function useReader(inputs: ReaderInputs) {
	const { model, reducedMotion } = inputs;
	const reading = useModelReading(
		inputs.vault,
		inputs.paneId,
		model,
		inputs.settled,
		inputs.failed,
	);
	const { location, comparison, structure, request } = reading;
	const { open, grammar } = location;
	const { depicted, opened } = structure;
	const pane = useContext(ModelPaneContext);
	if (pane === null) throw new Error("A model reading requires its pane presentation.");
	const playback = useContext(ModelWalkthroughContext);
	const leave = playback?.leave;
	const accepted = useAcceptedScene(request, pane.selection.ids);
	const { scene, shown } = accepted;
	const selection = useProjectedSelection(shown.projection, pane.selection);
	const { clear, select } = selection;
	const camera = useBoardCamera(reducedMotion);
	const area = useRef<HTMLDivElement | null>(null);
	const { id: modelId } = model.manifest;
	const openModule = useCallback(
		(next: string | null): void => {
			clear();
			open(modelId, next);
		},
		[clear, modelId, open],
	);
	const moves = useModelMoves({
		camera,
		area,
		scene,
		reading: request.reading,
		model,
		reference: comparison.reference,
		reducedMotion,
		open: openModule,
	});
	const { move } = moves;
	const onOpen = useCallback(
		(next: string | null): void => {
			leave?.();
			move(next);
		},
		[leave, move],
	);
	const tree = useMemo(() => moduleTree(depicted), [depicted]);
	const branches = useModuleBranches(tree, opened);
	const places = useReaderPlaces(
		grammar === "architecture",
		opened,
		selection.ids.size > 0,
		reviewsChanges(model),
	);
	const near = useRelevance(model, depicted, opened);
	const walk = useChangeWalk({
		model,
		reference: comparison.reference,
		location,
		opened,
		onList: places.onList,
		onDiagram: places.onDiagram,
	});
	const choices = useReaderChoices({
		location,
		model,
		opened,
		area,
		select,
		onOpen,
		onDestination: places.onDestination,
	});
	const onMove = useReaderMoves({
		location,
		tree,
		opened,
		flows: near.walkedFlows,
		selection,
		scene,
		camera,
		reducedMotion,
		onOpen,
	});
	return {
		...reading,
		...places,
		vault: inputs.vault,
		model,
		accepted,
		selection,
		camera,
		area,
		moves,
		tree,
		branches,
		...near,
		walk,
		choices,
		presenting: playback?.active === true,
		walkthrough: playback?.current ?? null,
		onOpen,
		onMove,
	};
}

type Reader = ReturnType<typeof useReader>;

export { useReader, type Reader };
