import { RiBarChart2Line, RiHistoryLine } from "@remixicon/react";
import { Activity, useCallback, useMemo, useState, type JSX, type ReactNode } from "react";
import { Button } from "@archboard/ui-kit/components";
import type { activateCodeTarget } from "@archboard/code-opener/code-target";
import type { Model as Content } from "@archboard/model/content";
import type { ActiveEphemeralFlow } from "#ui/architecture-drawing/model-reader/hooks/use-model-arrival.ts";
import type { Page } from "#ui/architecture-drawing/model-reader/reading/components/ModelHeading.tsx";
import { ModelBreadcrumbs } from "#ui/architecture-drawing/model-reader/reading/components/ModelBreadcrumbs.tsx";
import { ModelLensStatus } from "#ui/architecture-drawing/model-reader/reading/components/ModelLens.tsx";
import { ModelChanges } from "#ui/architecture-drawing/model-reader/reading/components/ModelChanges.tsx";
import {
	ModelColumn,
	type ColumnSection,
} from "#ui/architecture-drawing/model-reader/reading/components/ModelColumn.tsx";
import { usePaneChrome } from "#ui/architecture-drawing/canvas/picture/reads/hooks/use-pane-chrome.ts";
import { CodeBrowser } from "#ui/architecture-drawing/code-browser/components/CodeBrowser.tsx";
import { ModelFind } from "#ui/architecture-drawing/model-reader/reading/components/ModelFind.tsx";
import { ModelFlows } from "#ui/architecture-drawing/model-reader/reading/components/ModelFlows.tsx";
import {
	ModelHeading,
	ModelReadingControls,
	ModelStateChip,
} from "#ui/architecture-drawing/model-reader/reading/components/ModelHeading.tsx";
import { ModelHistoryDialog } from "#ui/architecture-drawing/model-reader/reading/components/ModelHistoryDialog.tsx";
import { ModelMeasuresDialog } from "#ui/architecture-drawing/model-reader/reading/components/ModelMeasuresDialog.tsx";
import { ModelReadingSurface } from "#ui/architecture-drawing/model-reader/reading/components/ModelReadingSurface.tsx";
import { ModelTree } from "#ui/architecture-drawing/model-reader/reading/components/ModelTree.tsx";
import { ModelWalkthroughs } from "#ui/architecture-drawing/model-reader/reading/components/ModelWalkthroughs.tsx";
import { SECTION_ICONS } from "#ui/architecture-drawing/model-reader/reading/constants/section-icons.ts";
import { useFolds } from "#ui/architecture-drawing/model-reader/reading/hooks/use-folds.ts";
import { useChangeKeys } from "#ui/architecture-drawing/model-reader/reading/hooks/use-reader-keys.ts";
import { useReader, type Reader } from "#ui/architecture-drawing/model-reader/hooks/use-reader.ts";
import { flowCollections } from "#ui/architecture-drawing/model-reader/rules/flow-reading.ts";
import type { InterfaceRow } from "#ui/architecture-drawing/model-reader/rules/interface-changes.ts";
import { changeStepOf } from "#ui/architecture-drawing/model-reader/rules/reader-keys.ts";

/** Inputs for a reading. */
interface ModelReadingProps {
	overlay?: ReactNode;
	/** The state the accepted scene shows, so its details never run ahead of the picture. */
	overview?: (shown: Content) => ReactNode;
	/** What the accepted scene is compared with, which the caption states. */
	comparison?: (shown: Content) => ReactNode;
	onCodeTargetNotice: Parameters<typeof activateCodeTarget>[0]["onNotice"];
	vault: string;
	model: Content;
	/** Whether the model is the answer to this address, not the last answer kept on screen. */
	settled: boolean;
	/** Whether the read of this address failed, so that the model only stands in for it. */
	failed?: boolean | undefined;
	/** What the stage has to say over the picture, which it never moves. */
	children?: ReactNode;
	paneId: string;
	arrival?: number | undefined;
	requestedPage?: Page | undefined;
	ephemeralFlow?: ActiveEphemeralFlow | null | undefined;
	onClearEphemeralFlow?: (() => void) | undefined;
	onEphemeralGrammar?: ((grammar: "flowchart" | "sequence") => void) | undefined;
	reducedMotion: boolean;
}

/**
 * Whether a reading keeps a record: a migration candidate has none of its own.
 * @param model The reading.
 * @returns True for a canonical model.
 */
function keepsRecord(model: Content): boolean {
	return model.migrationPreview === undefined;
}

/**
 * The module the reader has selected, when it is one alone.
 * @param ids The selected identities.
 * @returns The identity, or null.
 */
function soleOf(ids: ReadonlySet<string>): string | null {
	const [only, other] = ids;
	return other === undefined ? (only ?? null) : null;
}

/**
 * What a walkable list calls the thing on screen.
 * @param list The list.
 * @param id The thing on screen.
 * @returns Its name, or its identity while the list does not hold it.
 */
function nameIn(list: readonly { id: string; name: string }[], id: string): string {
	return list.find((entry) => entry.id === id)?.name ?? id;
}

/**
 * The last crumb, for a reading that shows more than the open module.
 * @param reader The reader.
 * @returns The name of the flow or the walkthrough on screen.
 */
function endingOf(reader: Reader): string | undefined {
	const { model, walkthrough, location, structure, ephemeralFlow } = reader;
	const { grammar, flow } = location;
	if (walkthrough !== null) return nameIn(model.walkthroughs, walkthrough);
	if (ephemeralFlow !== null) return ephemeralFlow.flow.name;
	if (flow === null || grammar === "architecture") return undefined;
	return nameIn(structure.depicted.flows, flow);
}

/** How a section of the column folds. */
interface SectionFolds {
	readonly folded: ReadonlySet<ColumnSection>;
	readonly onFold: (section: ColumnSection) => void;
}

/**
 * What a proposal changes, at the top of the column. An interface change selects its module the
 * way a count of the interface line does, and this list stands beside About, so it brings the
 * picture back.
 * @param props The reader and how its sections fold.
 * @param props.reader The reader.
 * @param props.folds How the sections fold.
 * @returns The section, once the base of the comparison is read.
 */
function ReadingChanges(props: {
	readonly reader: Reader;
	readonly folds: SectionFolds;
}): JSX.Element | null {
	const { reader, folds } = props;
	const { walk, choices, selection, onDiagram } = reader;
	const { showHere } = choices;
	const showModule = useCallback(
		(row: InterfaceRow): void => {
			onDiagram();
			showHere([row.id], row.scope);
		},
		[onDiagram, showHere],
	);
	const summary = useMemo(() => <ModelChanges.Summary list={walk.list} />, [walk.list]);
	const strip = useMemo(
		() => (walk.reviewing ? <ModelChanges.Walker walk={walk} /> : undefined),
		[walk],
	);
	if (walk.list === null) return null;
	return (
		<ModelColumn.Section
			section="changes"
			icon={SECTION_ICONS.changes}
			label="Changes"
			count={walk.count}
			summary={summary}
			strip={strip}
			folded={folds.folded.has("changes")}
			onFold={folds.onFold}
		>
			<ModelChanges.Interfaces
				rows={walk.list.interfaces}
				selected={soleOf(selection.ids)}
				onShow={showModule}
			/>
			<ModelChanges.List list={walk.list} place={walk.place} onShow={walk.show} />
		</ModelColumn.Section>
	);
}

/**
 * The sections of the column: a proposal's changes, then the modules, the flows and the
 * walkthroughs of the whole model. A section with nothing to list is left out.
 * @param props The reader, how its sections fold and what a key typed in the tree does.
 * @param props.reader The reader.
 * @param props.folds How the sections fold.
 * @param props.onTypeAhead A printable key typed in the tree, handed to Find.
 * @returns The sections.
 */
function ReadingSections(props: {
	readonly reader: Reader;
	readonly folds: SectionFolds;
	readonly onTypeAhead: (text: string) => void;
}): JSX.Element {
	const { reader, folds, onTypeAhead } = props;
	const { model, location, structure, tree, branches, choices, walk, claimed } = reader;
	const { folded, onFold } = folds;
	const { flows } = structure.depicted;
	const presenting = reader.walkthrough !== null;
	const { reference } = reader.comparison;
	const collections = useMemo(() => flowCollections(model, reference), [model, reference]);
	return (
		<>
			<ReadingChanges reader={reader} folds={folds} />
			<ModelColumn.Section
				section="modules"
				icon={SECTION_ICONS.modules}
				label="Modules"
				count={tree.owner.size}
				folded={folded.has("modules")}
				onFold={onFold}
			>
				<ModelTree
					tree={tree}
					open={branches.open}
					scope={location.grammar === "architecture" && !presenting ? structure.opened : null}
					claimed={claimed}
					onToggle={branches.toggle}
					onOpen={choices.chooseModule}
					onTypeAhead={onTypeAhead}
					follows={!walk.reviewing}
				/>
			</ModelColumn.Section>
			{flows.length > 0 && (
				<ModelColumn.Section
					section="flows"
					icon={SECTION_ICONS.flows}
					label="Flows"
					count={flows.length}
					folded={folded.has("flows")}
					onFold={onFold}
				>
					<ModelFlows
						flows={flows}
						collections={collections}
						flow={presenting ? null : location.flow}
						grammar={location.grammar}
						claimed={claimed}
						onChoose={choices.chooseFlow}
					/>
				</ModelColumn.Section>
			)}
			{model.walkthroughs.length > 0 && (
				<ModelColumn.Section
					section="walkthroughs"
					icon={SECTION_ICONS.walkthroughs}
					label="Walkthroughs"
					count={model.walkthroughs.length}
					folded={folded.has("walkthroughs")}
					onFold={onFold}
				>
					<ModelWalkthroughs walkthroughs={model.walkthroughs} claimed={claimed} />
				</ModelColumn.Section>
			)}
		</>
	);
}

/**
 * The left column of a reading: Find, the keys of History and Measures, and one list of sections,
 * or in Code mode the files of the code and the code view beside the column. A reading with no
 * record of its own, a migration candidate, has no History.
 * @param props The reader.
 * @param props.reader The reader.
 * @param props.code Whether the file tree takes the place of the architecture lists.
 * @returns The parts of the column, and the dialogs its keys open.
 */
function ReadingColumn(props: { readonly reader: Reader; readonly code: boolean }): JSX.Element {
	const { reader, code } = props;
	const { model, location, choices, walk } = reader;
	const [finding, setFinding] = useState(false);
	const [query, setQuery] = useState("");
	const [measuring, setMeasuring] = useState(false);
	const { reviewing, step } = walk;
	const typeAhead = useCallback(
		(text: string): void => {
			const change = reviewing ? changeStepOf(text) : null;
			if (change !== null) {
				step(change);
				return;
			}
			setQuery((current) => current + text);
			setFinding(true);
		},
		[reviewing, step],
	);
	const { folded, fold: onFold } = useFolds<ColumnSection>();
	const folds = useMemo(() => ({ folded, onFold }), [folded, onFold]);
	const openMeasures = useCallback((): void => setMeasuring(true), []);
	const records = keepsRecord(model);
	return (
		<>
			<ModelColumn.Find>
				<ModelFind
					open={finding}
					onOpenChange={setFinding}
					query={query}
					onQuery={setQuery}
					model={model}
					onChoose={choices.chooseFind}
				/>
			</ModelColumn.Find>
			{!code && (
				<ModelColumn.Lists>
					<ModelColumn.Keys>
						{records && (
							<ModelColumn.Key
								dialog="history"
								label="History"
								icon={RiHistoryLine}
								open={reader.history}
								onOpen={reader.openHistory}
							/>
						)}
						<ModelColumn.Key
							dialog="measures"
							label="Measures"
							icon={RiBarChart2Line}
							open={measuring}
							onOpen={openMeasures}
						/>
					</ModelColumn.Keys>
					<ModelColumn.Sections>
						<ReadingSections reader={reader} folds={folds} onTypeAhead={typeAhead} />
					</ModelColumn.Sections>
				</ModelColumn.Lists>
			)}
			{records && (
				<ModelHistoryDialog
					open={reader.history}
					onOpenChange={reader.onHistory}
					vault={reader.vault}
					checkpoint={location.checkpoint}
					state={location.state}
					selected={model.selectedState}
					against={location.against}
					onCompare={location.compareAgainst}
					onState={location.selectState}
					onSelect={location.selectCheckpoint}
				/>
			)}
			<ModelMeasuresDialog reader={reader} open={measuring} onOpenChange={setMeasuring} />
		</>
	);
}

/**
 * The lens the picture on screen draws through, and what it left out.
 * @param props The reader.
 * @param props.reader The reader.
 * @returns The line, or nothing for a flow or a reading with one lens.
 */
function ReadingLens(props: { readonly reader: Reader }): JSX.Element | null {
	const { shown } = props.reader.accepted;
	if (shown.reading.grammar !== "architecture") return null;
	if (Object.keys(shown.model.policy.lenses).length < 2) return null;
	return <ModelLensStatus outcome={shown.projection} />;
}

/**
 * The way out of a focus, which narrows the reading.
 * @param props The reader.
 * @param props.reader The reader.
 * @returns The control, or nothing while nothing is focused.
 */
function ReadingFocus(props: { readonly reader: Reader }): JSX.Element | null {
	const { focus, grammar, setFocus } = props.reader.location;
	const clear = useCallback((): void => setFocus(null), [setFocus]);
	if (grammar !== "architecture" || focus === null) return null;
	return (
		<Button data-slot="model-clear-focus" variant="ghost" size="sm" onClick={clear}>
			Clear focus ({focus.length})
		</Button>
	);
}

/**
 * The header of a reading. Where the reader is comes first: the crumbs, with all the room they need,
 * because the open module's tab on the picture and the right panel already show its code path.
 * What the reader reads stands apart at the end: a standing focus, then the state and what it is
 * compared with, as one control. The walk of a proposal's changes stands with its list, in the
 * left column.
 * @param props The reader.
 * @param props.reader The reader.
 * @param props.comparison What the reading is compared with, while the picture is on screen.
 * @returns The parts of the header.
 */
function ReadingHeading(props: {
	readonly reader: Reader;
	readonly comparison: ReactNode;
}): JSX.Element {
	const { reader } = props;
	const { model, location, structure, accepted, onOpen } = reader;
	const { opened, trail } = structure;
	const ending = endingOf(reader);
	const reading = (
		<>
			<ReadingLens reader={reader} />
			<ReadingFocus reader={reader} />
			<ModelReadingControls>
				{keepsRecord(model) && (
					<ModelStateChip
						model={model}
						state={location.state}
						checkpoint={location.checkpoint}
						onOpen={reader.openHistory}
					/>
				)}
				{props.comparison}
			</ModelReadingControls>
		</>
	);
	return (
		<ModelHeading page={reader.page} onPage={reader.onPage} reading={reading}>
			<ModelBreadcrumbs
				name={model.manifest.name}
				scope={opened}
				trail={trail}
				ending={ending}
				pending={accepted.pending}
				onOpen={onOpen}
			/>
		</ModelHeading>
	);
}

/**
 * Keep Code beside a walkthrough, or inside the picture's attention context in ordinary readings.
 * @param reader The reading and its presentation.
 * @returns The code browser in the place that owns it.
 */
function useReadingCode(reader: Reader) {
	const code = usePaneChrome().column?.mode === "code";
	const browser = code ? <CodeBrowser reader={reader} /> : null;
	const [presentedCode, pictureCode] = reader.presenting ? [browser, null] : [null, browser];
	return { code, presentedCode, pictureCode };
}

/**
 * A scope changes the reading of the existing model without copying its content. The
 * reading owns the left column and the header of its pane, and they stay while a
 * walkthrough has the middle.
 * @param props The coherent model.
 * @returns Recursive navigation and the selected scope.
 */
function ModelReading(props: ModelReadingProps): JSX.Element {
	const reader = useReader(props);
	useChangeKeys(reader.walk.step);
	const { code, presentedCode, pictureCode } = useReadingCode(reader);
	return (
		<>
			<ReadingColumn reader={reader} code={code} />
			{presentedCode}
			<ReadingHeading
				reader={reader}
				comparison={reader.presenting ? null : props.comparison?.(reader.accepted.shown.model)}
			/>
			<Activity mode={reader.presenting ? "hidden" : "visible"}>
				<ModelReadingSurface {...props} reader={reader}>
					{reader.ephemeralFlow !== null && (
						<EphemeralFlowNotice
							flow={reader.ephemeralFlow}
							onClose={reader.onClearEphemeralFlow}
						/>
					)}
					{props.children}
					{/* The portals read the same picture attention context as the diagram. */}
					{pictureCode}
				</ModelReadingSurface>
			</Activity>
		</>
	);
}

/**
 * Quiet bar naming an unsaved temporary flow and offering a one-click return to architecture.
 * @param props The active temporary flow and its dismiss callback.
 * @param props.flow The temporary flow on screen.
 * @param props.onClose Dismisses the temporary flow.
 * @returns The banner.
 */
function EphemeralFlowNotice(props: {
	readonly flow: ActiveEphemeralFlow;
	readonly onClose: (() => void) | undefined;
}): JSX.Element {
	const { flow, onClose } = props;
	return (
		<output
			data-slot="ephemeral-flow-notice"
			className="bg-card/95 border-border text-body flex items-center justify-between gap-3 border-b px-4 py-2 backdrop-blur-xs"
		>
			<div className="flex min-w-0 items-center gap-2">
				<span className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-xs font-medium">
					Temporary {flow.grammar}
				</span>
				<span className="text-foreground truncate font-medium">{flow.flow.name}</span>
				<span className="text-muted-foreground hidden text-xs sm:inline">
					Not saved to this model
				</span>
			</div>
			{onClose !== undefined && (
				<Button variant="ghost" size="sm" onClick={onClose}>
					Back to architecture
				</Button>
			)}
		</output>
	);
}

export { ModelReading };
