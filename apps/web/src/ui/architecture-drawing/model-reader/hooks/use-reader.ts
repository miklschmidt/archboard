import { useCallback, useContext, useMemo, useRef, useState } from "react";
import type { ArchitectureModelRead } from "@archboard/model/contract";
import type { Page } from "#ui/architecture-drawing/model-reader/reading/components/ModelHeading.tsx";
import { useAcceptedScene } from "#ui/architecture-drawing/model-reader/hooks/use-accepted-scene.ts";
import { useChangeWalk } from "#ui/architecture-drawing/model-reader/hooks/use-change-walk.ts";
import { useClaimedSubjects } from "#ui/architecture-drawing/model-reader/hooks/use-claimed-subjects.ts";
import { useFlowReadings } from "#ui/architecture-drawing/model-reader/hooks/use-flow-readings.ts";
import { useModelMoves } from "#ui/architecture-drawing/model-reader/hooks/use-model-moves.ts";
import { useModelReading } from "#ui/architecture-drawing/model-reader/hooks/use-model-reading.ts";
import { useProjectedSelection } from "#ui/architecture-drawing/model-reader/hooks/use-model-selection.ts";
import { useModuleBranches } from "#ui/architecture-drawing/model-reader/hooks/use-module-branches.ts";
import { useReaderChoices } from "#ui/architecture-drawing/model-reader/hooks/use-reader-choices.ts";
import { useReaderMoves } from "#ui/architecture-drawing/model-reader/hooks/use-reader-moves.ts";
import { usePictureCamera } from "#ui/architecture-drawing/canvas/picture/camera/hooks/use-picture-camera.ts";
import { openModules, toggled } from "#ui/architecture-drawing/model-reader/rules/expansion.ts";
import { moduleTree } from "#ui/architecture-drawing/model-reader/rules/module-tree.ts";
import {
	ModelPaneContext,
	ModelWalkthroughContext,
} from "#ui/architecture-drawing/model-reader/state/presentation.ts";

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

/** The module that About was opened on, or undefined while About is closed. */
type AboutScope = string | null | undefined;

/**
 * How the open module is read. The page is kept with the module it was chosen on, so another
 * module opens as a diagram. About describes the open scope, and the right panel the selection.
 * @param opened The open module.
 * @param shown The scope the pane is ready to show.
 * @returns The page, and how to change it.
 */
function useReaderPage(opened: string | null, shown: string | null) {
	const [about, setAbout] = useState<AboutScope>(undefined);
	const onPage = useCallback(
		(next: Page): void => setAbout(next === "about" ? opened : undefined),
		[opened],
	);
	const onDiagram = useCallback((): void => setAbout(undefined), []);
	const page: Page = about === opened && about === shown ? "about" : "diagram";
	return { page, onPage, onDiagram, setAbout };
}

/**
 * Whether the History dialog is open. The key in the left column and the state chip of the header
 * both open it, so the reader holds it.
 * @returns Whether it is open, and how to open it or change it.
 */
function useHistoryDialog() {
	const [history, onHistory] = useState(false);
	const openHistory = useCallback((): void => onHistory(true), []);
	return { history, onHistory, openHistory };
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
	const { open, setExpand } = location;
	const { depicted, opened } = structure;
	const pane = useContext(ModelPaneContext);
	if (pane === null) throw new Error("A model reading requires its pane presentation.");
	const playback = useContext(ModelWalkthroughContext);
	const leave = playback?.leave;
	const accepted = useAcceptedScene(request, pane.selection.ids);
	const { scene, shown } = accepted;
	const selection = useProjectedSelection(shown.projection, pane.selection);
	const { clear, selectMany } = selection;
	const camera = usePictureCamera(reducedMotion);
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
		projection: request.projection,
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
	const onToggle = useCallback(
		(id: string): boolean => {
			const next = toggled(request.projection, id);
			if (next === null) return false;
			leave?.();
			setExpand(next);
			return true;
		},
		[request.projection, leave, setExpand],
	);
	const tree = useMemo(() => moduleTree(depicted), [depicted]);
	const claimed = useClaimedSubjects(inputs.vault, model, location.checkpoint);
	const branches = useModuleBranches(tree, opened);
	const { setAbout, ...places } = useReaderPage(opened, shown.projection.opened);
	// About of any module: the module opens, and its About shows once it is the open scope.
	const openAbout = useCallback(
		(scope: string): void => {
			const destination = tree.owner.get(scope)?.end ?? scope;
			if (destination !== opened) onOpen(scope);
			setAbout(destination);
		},
		[opened, onOpen, setAbout, tree],
	);
	const history = useHistoryDialog();
	const flowReadings = useFlowReadings({
		model,
		entry: request.entry,
		structure,
		camera,
		showFlow: location.showFlow,
	});
	const { openFlow } = flowReadings;
	const walk = useChangeWalk({
		model,
		reference: comparison.reference,
		location,
		openFlow,
		opened,
		selected: selection.ids,
		onDiagram: places.onDiagram,
	});
	const frames = useMemo(() => openModules(shown.projection), [shown.projection]);
	const choices = useReaderChoices({
		location,
		flows: flowReadings,
		model,
		opened,
		frames,
		area,
		selectMany,
		onOpen,
	});
	const onMove = useReaderMoves({
		location,
		openFlow,
		tree,
		opened,
		flows: depicted.flows,
		selection,
		scene,
		camera,
		reducedMotion,
		onOpen,
		onToggle,
	});
	return {
		...reading,
		...places,
		...history,
		vault: inputs.vault,
		model,
		accepted,
		selection,
		camera,
		area,
		moves,
		tree,
		branches,
		claimed,
		walk,
		choices,
		presenting: playback?.active === true,
		walkthrough: playback?.current ?? null,
		onOpen,
		onToggle,
		onMove,
		openFlow,
		openAbout,
	};
}

type Reader = ReturnType<typeof useReader>;

export { useReader, type Reader };
