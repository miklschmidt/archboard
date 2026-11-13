import { RiBarChart2Line, RiHistoryLine } from "@remixicon/react";
import { Activity, useCallback, useMemo, useState, type JSX, type ReactNode } from "react";
import { Button } from "@archboard/ui-kit/components";
import type { activateCodeTarget } from "@archboard/code-opener/code-target";
import type { Model as Content } from "@archboard/model/content";
import { ModelBreadcrumbs } from "#ui/architecture-drawing/model-reader/reading/components/ModelBreadcrumbs.tsx";
import { ModelChanges } from "#ui/architecture-drawing/model-reader/reading/components/ModelChanges.tsx";
import {
	ModelColumn,
	type ColumnSection,
} from "#ui/architecture-drawing/model-reader/reading/components/ModelColumn.tsx";
import { ModelFind } from "#ui/architecture-drawing/model-reader/reading/components/ModelFind.tsx";
import { ModelFlows } from "#ui/architecture-drawing/model-reader/reading/components/ModelFlows.tsx";
import {
	ModelCodePath,
	ModelHeading,
	ModelStateChip,
} from "#ui/architecture-drawing/model-reader/reading/components/ModelHeading.tsx";
import { ModelHistoryDialog } from "#ui/architecture-drawing/model-reader/reading/components/ModelHistoryDialog.tsx";
import { ModelMeasuresDialog } from "#ui/architecture-drawing/model-reader/reading/components/ModelMeasuresDialog.tsx";
import { ModelReadingSurface } from "#ui/architecture-drawing/model-reader/reading/components/ModelReadingSurface.tsx";
import { ModelTree } from "#ui/architecture-drawing/model-reader/reading/components/ModelTree.tsx";
import { ModelWalkthroughs } from "#ui/architecture-drawing/model-reader/reading/components/ModelWalkthroughs.tsx";
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
	const { model, walkthrough, location, structure } = reader;
	const { grammar, flow } = location;
	if (walkthrough !== null) return nameIn(model.walkthroughs, walkthrough);
	if (flow === null || grammar === "architecture") return undefined;
	return nameIn(structure.depicted.flows, flow);
}

/** Every section of the column stands open until the reader folds it. */
const NONE_FOLDED: ReadonlySet<ColumnSection> = new Set();

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
	if (walk.list === null) return null;
	return (
		<ModelColumn.Section
			section="changes"
			label="Changes"
			count={walk.count}
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
 * The left column of a reading: Find, the keys of History and Measures, and one list of sections.
 * A reading with no record of its own, a migration candidate, has no History.
 * @param props The reader.
 * @param props.reader The reader.
 * @returns The parts of the column, and the dialogs its keys open.
 */
function ReadingColumn(props: { readonly reader: Reader }): JSX.Element {
	const { reader } = props;
	const { model, location, choices, walk } = reader;
	const [finding, setFinding] = useState(false);
	const [query, setQuery] = useState("");
	const [measuring, setMeasuring] = useState(false);
	const [folded, setFolded] = useState(NONE_FOLDED);
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
	const onFold = useCallback((section: ColumnSection): void => {
		setFolded((now) => {
			const next = new Set(now);
			if (!next.delete(section)) next.add(section);
			return next;
		});
	}, []);
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
 * What walks or narrows a reading: the changes of a proposal, and the way out of a focus.
 * @param props The reader.
 * @param props.reader The reader.
 * @returns The controls.
 */
function ReadingWalk(props: { readonly reader: Reader }): JSX.Element {
	const { walk, location } = props.reader;
	const { focus, grammar, setFocus } = location;
	const clear = useCallback((): void => setFocus(null), [setFocus]);
	return (
		<>
			{walk.reviewing && <ModelChanges.Walker walk={walk} />}
			{grammar === "architecture" && focus !== null && (
				<Button data-slot="model-clear-focus" variant="ghost" size="sm" onClick={clear}>
					Clear focus ({focus.length})
				</Button>
			)}
		</>
	);
}

/**
 * The header of a reading: the crumbs, the open module's code path, the state chip, what it is
 * compared with, the walk of a proposal's changes, a standing focus and `Diagram | About`. A code path says where a module is, so a flow shows none.
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
	const { model, location, structure, tree, accepted, onOpen } = reader;
	const { opened, trail } = structure;
	const ending = endingOf(reader);
	return (
		<ModelHeading page={reader.page} onPage={reader.onPage}>
			<ModelBreadcrumbs
				name={model.manifest.name}
				scope={opened}
				trail={trail}
				ending={ending}
				pending={accepted.pending}
				onOpen={onOpen}
			/>
			<ModelCodePath path={ending === undefined ? tree.owner.get(opened ?? "")?.path : undefined} />
			{keepsRecord(model) && (
				<ModelStateChip
					model={model}
					state={location.state}
					checkpoint={location.checkpoint}
					onOpen={reader.openHistory}
				/>
			)}
			{props.comparison}
			<ReadingWalk reader={reader} />
		</ModelHeading>
	);
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
	return (
		<>
			<ReadingColumn reader={reader} />
			<ReadingHeading
				reader={reader}
				comparison={reader.presenting ? null : props.comparison?.(reader.accepted.shown.model)}
			/>
			<Activity mode={reader.presenting ? "hidden" : "visible"}>
				<ModelReadingSurface {...props} reader={reader} />
			</Activity>
		</>
	);
}

export { ModelReading };
