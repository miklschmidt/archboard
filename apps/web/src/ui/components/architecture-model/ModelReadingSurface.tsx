import { useCallback, useMemo, useState, type JSX, type ReactNode } from "react";
import type { ArchitectureModelRead } from "@archboard/board/model";
import type { activateCodeTarget } from "@archboard/code-opener/code-target";
import { Button } from "@archboard/ui-kit/components";
import { ModelCaption } from "#ui/components/architecture-model/ModelCaption.tsx";
import { ModelCodeWarnings } from "#ui/components/architecture-model/ModelCodeFindings.tsx";
import { ModelExplanationMenu } from "#ui/components/architecture-model/ModelExplanationMenu.tsx";
import { ModelFilters } from "#ui/components/architecture-model/ModelFilters.tsx";
import { ModelReadingCanvas } from "#ui/components/architecture-model/ModelReadingCanvas.tsx";
import { ModelReadingSidebar } from "#ui/components/architecture-model/ModelReadingSidebar.tsx";
import { ModelSelectionBar } from "#ui/components/architecture-model/ModelSelectionBar.tsx";
import { ModelComparisonNotice } from "#ui/components/architecture-model/ModelStateDetails.tsx";
import { ScopeIntroduction } from "#ui/components/architecture-model/ModelSelectionDetails.tsx";
import { PeekProvider } from "#ui/components/semantic-board-canvas/Peek.tsx";
import { useModelCodeFindings } from "#ui/hooks/architecture-model/use-model-code-findings.ts";
import { useModelExplanation } from "#ui/hooks/architecture-model/use-model-explanation.ts";
import { useReaderKeys } from "#ui/hooks/architecture-model/use-reader-keys.ts";
import type { Reader } from "#ui/hooks/architecture-model/use-reader.ts";
import type { Sidebar } from "#ui/hooks/semantic-board-canvas/use-sidebar.ts";
import { flowSubjects, collectionSubjects } from "#ui/rules/architecture-model/flow-reading.ts";

type Model = Extract<ArchitectureModelRead, { success: true }>;

/** Inputs for what the middle of a reading shows. */
interface ModelReadingSurfaceProps {
	overlay?: ReactNode;
	overview?: (shown: Model) => ReactNode;
	onCodeTargetNotice: Parameters<typeof activateCodeTarget>[0]["onNotice"];
	paneId: string;
	reducedMotion: boolean;
	reader: Reader;
	/** What the stage has to say over the picture, which it never moves. */
	children?: ReactNode;
}

/**
 * The identities of what belongs to behavior rather than architecture.
 * @param reader The reader.
 * @returns The identities.
 */
function useBehavioralIds(reader: Reader): ReadonlySet<string> {
	const { model, structure, comparison } = reader;
	const { flows } = structure.depicted;
	return useMemo(() => {
		const collections = [model, comparison.reference].flatMap((source) =>
			source === undefined ? [] : collectionSubjects(source),
		);
		return new Set([...flowSubjects(flows), ...collections].map((one) => one.id));
	}, [model, flows, comparison.reference]);
}

/**
 * What can be done with the selection.
 * @param props The reader and what the panel says of it.
 * @param props.reader The reader.
 * @param props.behavioralIds What belongs to behavior.
 * @param props.explanation The reading's explanation.
 * @param props.menu Whether the action menu is open.
 * @param props.onMenu Open or close the action menu.
 * @returns The controls.
 */
function SelectionControls(props: {
	readonly reader: Reader;
	readonly behavioralIds: ReadonlySet<string>;
	readonly explanation: ReturnType<typeof useModelExplanation>;
	readonly menu: boolean;
	readonly onMenu: (open: boolean) => void;
}): JSX.Element {
	const { reader, behavioralIds, explanation } = props;
	const { selection, location, model, accepted } = reader;
	return (
		<ModelSelectionBar
			selection={selection}
			onFocus={location.setFocus}
			architectural={location.grammar === "architecture"}
			canFocus={![...selection.ids].some((id) => behavioralIds.has(id))}
		>
			{model.migrationPreview === undefined && (
				<ModelExplanationMenu
					open={props.menu}
					onOpenChange={props.onMenu}
					model={accepted.shown.model}
					selected={selection.ids}
					unavailable={explanation.unavailable}
					onAction={explanation.act}
				/>
			)}
		</ModelSelectionBar>
	);
}

/**
 * The line over the picture: what the open module does, and what its reading leaves out.
 * @param props The reader and the code findings.
 * @param props.reader The reader.
 * @param props.code The code findings of the reading.
 * @returns The caption.
 */
function ReadingCaption(props: {
	readonly reader: Reader;
	readonly code: ReturnType<typeof useModelCodeFindings>;
}): JSX.Element {
	const { reader, code } = props;
	const { location, accepted, selection } = reader;
	const { focus, grammar, setFocus } = location;
	const clearFocus = useCallback((): void => setFocus(null), [setFocus]);
	return (
		<ModelCaption model={accepted.shown.model} projection={accepted.shown.projection}>
			{grammar === "architecture" && focus !== null && (
				<Button data-slot="model-clear-focus" variant="ghost" size="sm" onClick={clearFocus}>
					Clear focus ({focus.length})
				</Button>
			)}
			<ModelCodeWarnings reading={code.reading} onSelect={selection.select} />
		</ModelCaption>
	);
}

/**
 * The picture of a reading, with the filters at its lower left.
 * @param props The surface and the code findings.
 * @param props.surface The surface's inputs.
 * @param props.warnings What the code findings mark on the picture.
 * @returns The picture.
 */
function ReadingPicture(props: {
	readonly surface: ModelReadingSurfaceProps;
	readonly warnings: ReturnType<typeof useModelCodeFindings>["warnings"];
}): JSX.Element {
	const { surface } = props;
	const { reader, overlay } = surface;
	const { accepted, location, request, camera, area, moves, sidebar, selection, model } = reader;
	const { comparison, vault } = reader;
	return (
		<ModelReadingCanvas
			scene={accepted.scene}
			request={request}
			vault={vault}
			paneId={surface.paneId}
			pending={accepted.pending}
			comparing={comparison.status === "loading"}
			leaving={accepted.leaving}
			failure={accepted.failure}
			onRetry={accepted.retry}
			onWholeScope={reader.onWholeScope}
			notices={
				<>
					{surface.children}
					<ModelComparisonNotice comparison={comparison} />
				</>
			}
			camera={camera}
			area={area}
			cut={moves.cut}
			floating={sidebar.floating}
			selection={selection}
			warnings={props.warnings}
			reducedMotion={surface.reducedMotion}
			onOpen={reader.onOpen}
			onAttention={moves.ahead}
			overlay={overlay}
		>
			{location.grammar === "architecture" && (
				<ModelFilters model={model} filters={location.filters} onToggle={location.toggleFilter} />
			)}
		</ModelReadingCanvas>
	);
}

/**
 * What the reading of a pane shows while no walkthrough does: the caption, the picture and
 * the panel beside it. It reports the reading, so a walkthrough that replaces it reports alone.
 * @param props The reader and the pane's parts.
 * @returns The surface.
 */
function ModelReadingSurface(props: ModelReadingSurfaceProps): JSX.Element {
	const { reader } = props;
	const { model, vault, location, accepted, selection, sidebar, comparison } = reader;
	const { reveal, grammar, scope, openFlow } = location;
	const { shown } = accepted;
	const code = useModelCodeFindings(vault, shown.model);
	const reporting = useMemo(
		() => ({ ready: accepted.ready, presentation: null }),
		[accepted.ready],
	);
	const explanation = useModelExplanation(
		vault,
		shown.model,
		shown.reading,
		accepted.selected,
		reporting,
	);
	const [menu, setMenu] = useState(false);
	const behavioralIds = useBehavioralIds(reader);
	const controls = useMemo(
		() => (
			<SelectionControls
				reader={reader}
				behavioralIds={behavioralIds}
				explanation={explanation}
				menu={menu}
				onMenu={setMenu}
			/>
		),
		[reader, behavioralIds, explanation, menu],
	);
	const revealSelection = useCallback((): void => {
		const kinds = model.relationships
			.filter((edge) => selection.ids.has(edge.id))
			.map((edge) => edge.kind);
		reveal(
			[...selection.ids].filter((id) => !behavioralIds.has(id)),
			kinds,
		);
	}, [model.relationships, selection.ids, reveal, behavioralIds]);
	const attach = useReadingKeys(selection.clear, model, sidebar, setMenu);
	useReaderKeys(reader.onMove);
	return (
		<PeekProvider selection={soleSelected(selection.ids)}>
			<div
				ref={attach}
				data-slot="model-reading"
				data-scope={scope ?? ""}
				data-grammar={grammar}
				data-comparison={comparison.status}
				className="flex min-h-0 min-w-0 flex-1"
			>
				<div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
					<ReadingCaption reader={reader} code={code} />
					<ReadingPicture surface={props} warnings={code.warnings} />
					{reader.page === "about" && <ReadingAbout shown={shown} />}
				</div>
				<ModelReadingSidebar
					vault={vault}
					paneId={props.paneId}
					onCodeTargetNotice={props.onCodeTargetNotice}
					overview={props.overview?.(shown.model)}
					model={shown.model}
					code={code}
					projection={shown.projection}
					selection={selection}
					sidebar={sidebar}
					scope={shown.projection.opened}
					onOpen={reader.onOpen}
					onReveal={revealSelection}
					onRevealFlow={openFlow}
					grammar={shown.reading.grammar}
					controls={controls}
				/>
			</div>
		</PeekProvider>
	);
}

/**
 * The About page of the open module, over the picture so that the picture keeps its camera.
 * @param props What the accepted scene shows.
 * @param props.shown The accepted reading.
 * @returns The page.
 */
function ReadingAbout(props: { readonly shown: Reader["accepted"]["shown"] }): JSX.Element {
	const { shown } = props;
	return (
		<article
			data-slot="model-about"
			className="bg-background absolute inset-0 z-20 overflow-y-auto px-8 py-8"
		>
			<div className="max-w-prose">
				<ScopeIntroduction model={shown.model} scope={shown.projection.opened} />
			</div>
		</article>
	);
}

/**
 * The subject a sidebar row belongs to.
 * @param ids The selected identities.
 * @returns The one selected identity, or null.
 */
function soleSelected(ids: ReadonlySet<string>): string | null {
	return ids.size === 1 ? ([...ids][0] ?? null) : null;
}

/**
 * Hear the reading's own keys: Escape clears the selection, and the menu key opens its actions.
 * @param clear Clear the selection.
 * @param model The coherent model.
 * @param sidebar The pane's sidebar, which holds the action menu.
 * @param openMenu Open or close the action menu.
 * @returns A callback ref for the reading's element.
 */
function useReadingKeys(
	clear: () => void,
	model: Model,
	sidebar: Sidebar,
	openMenu: (open: boolean) => void,
) {
	return useCallback(
		(element: HTMLDivElement | null) => {
			if (element === null) return undefined;
			/**
			 * Clear selection only while input belongs to this reading.
			 * @param event The key pressed within the reading.
			 */
			function keyDown(event: KeyboardEvent): void {
				if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
					contextMenu(event);
					return;
				}
				if (event.key === "Escape" && !event.defaultPrevented) clear();
			}
			/**
			 * Open the shared action menu for the selection already visible in this reading.
			 * @param event The context request inside this reading.
			 */
			function contextMenu(event: Event): void {
				if (model.migrationPreview !== undefined) return;
				event.preventDefault();
				if (!sidebar.shown) sidebar.toggle();
				openMenu(true);
			}
			element.addEventListener("keydown", keyDown);
			element.addEventListener("contextmenu", contextMenu);
			return (): void => {
				element.removeEventListener("keydown", keyDown);
				element.removeEventListener("contextmenu", contextMenu);
			};
		},
		[clear, model.migrationPreview, sidebar, openMenu],
	);
}

export { ModelReadingSurface };
