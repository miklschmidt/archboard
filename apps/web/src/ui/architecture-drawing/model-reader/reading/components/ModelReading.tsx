import { Activity, useCallback, useMemo, useState, type JSX, type ReactNode } from "react";
import { RiBarChartBoxLine } from "@remixicon/react";
import { Button, IconButton } from "@archboard/ui-kit/components";
import type { activateCodeTarget } from "@archboard/code-opener/code-target";
import type { Model as Content } from "@archboard/model/content";
import { ModelBreadcrumbs } from "#ui/architecture-drawing/model-reader/reading/components/ModelBreadcrumbs.tsx";
import { ModelChanges } from "#ui/architecture-drawing/model-reader/reading/components/ModelChanges.tsx";
import {
	ModelColumn,
	type Destination,
} from "#ui/architecture-drawing/model-reader/reading/components/ModelColumn.tsx";
import { ModelFind } from "#ui/architecture-drawing/model-reader/reading/components/ModelFind.tsx";
import { ModelFlows } from "#ui/architecture-drawing/model-reader/reading/components/ModelFlows.tsx";
import {
	ModelCodePath,
	ModelHeading,
	ModelStateChip,
} from "#ui/architecture-drawing/model-reader/reading/components/ModelHeading.tsx";
import { ModelMeasuresDialog } from "#ui/architecture-drawing/model-reader/reading/components/ModelMeasuresDialog.tsx";
import { ModelReadingSurface } from "#ui/architecture-drawing/model-reader/reading/components/ModelReadingSurface.tsx";
import { ModelRecords } from "#ui/architecture-drawing/model-reader/reading/components/ModelRecords.tsx";
import { ModelTree } from "#ui/architecture-drawing/model-reader/reading/components/ModelTree.tsx";
import { ModelWalkthroughs } from "#ui/architecture-drawing/model-reader/reading/components/ModelWalkthroughs.tsx";
import type { ChangeWalk } from "#ui/architecture-drawing/model-reader/hooks/use-change-walk.ts";
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

/** What every reading offers, and what a reading with a record adds. */
const READING: readonly Destination[] = ["modules", "flows", "walkthroughs"];
const RECORDED: readonly Destination[] = ["modules", "flows", "walkthroughs", "history"];
const REVIEWED: readonly Destination[] = [...RECORDED, "changes"];

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

/**
 * What a reading offers in the left column.
 * @param model The reading.
 * @param walk Its changes.
 * @returns The destinations.
 */
function offeredBy(model: Content, walk: ChangeWalk): readonly Destination[] {
	if (walk.reviewing) return REVIEWED;
	return keepsRecord(model) ? RECORDED : READING;
}

/**
 * What a proposal changes, in the left column. An interface change selects its module the way a
 * count of the interface line does, and this list stands beside About, so it brings the picture back.
 * @param props The reader.
 * @param props.reader The reader.
 * @returns The list, once the base of the comparison is read.
 */
function ReadingChanges(props: { readonly reader: Reader }): JSX.Element | null {
	const { walk, choices, selection, onDiagram } = props.reader;
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
		<ModelColumn.List value="changes">
			<ModelChanges.Interfaces
				rows={walk.list.interfaces}
				selected={soleOf(selection.ids)}
				onShow={showModule}
			/>
			<ModelChanges.List list={walk.list} place={walk.place} onShow={walk.show} />
		</ModelColumn.List>
	);
}

/**
 * The left column of a reading: Find and the destinations.
 * @param props The reader.
 * @param props.reader The reader.
 * @returns The parts of the column.
 */
function ReadingColumn(props: { readonly reader: Reader }): JSX.Element {
	const { reader } = props;
	const { model, location, structure, tree, branches, choices, walk } = reader;
	const { opened, depicted } = structure;
	const [finding, setFinding] = useState(false);
	const [query, setQuery] = useState("");
	// Temporary trigger: the column agent opens the dialog from a key in the column.
	const [measuring, setMeasuring] = useState(false);
	const measure = useCallback((): void => setMeasuring(true), []);
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
	const records = keepsRecord(model);
	const { reference } = reader.comparison;
	const collections = useMemo(() => flowCollections(model, reference), [model, reference]);
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
				<IconButton label="Measures" slot="model-measures-open" onClick={measure}>
					<RiBarChartBoxLine />
				</IconButton>
				<ModelMeasuresDialog reader={reader} open={measuring} onOpenChange={setMeasuring} />
			</ModelColumn.Find>
			<ModelColumn.Destinations
				destination={reader.destination}
				onDestination={reader.onDestination}
				flows={depicted.flows.length}
				walkthroughs={model.walkthroughs.length}
				changes={reviewing ? String(walk.count) : undefined}
				offered={offeredBy(model, walk)}
			>
				<ModelColumn.List value="modules">
					<ModelTree
						tree={tree}
						open={branches.open}
						scope={opened}
						selected={soleOf(reader.selection.ids)}
						onToggle={branches.toggle}
						onOpen={choices.chooseModule}
						onTypeAhead={typeAhead}
					/>
				</ModelColumn.List>
				<ModelColumn.List value="flows">
					<ModelFlows
						flows={depicted.flows}
						collections={collections}
						flow={location.flow}
						grammar={location.grammar}
						onChoose={choices.chooseFlow}
					/>
				</ModelColumn.List>
				<ModelColumn.List value="walkthroughs">
					<ModelWalkthroughs walkthroughs={model.walkthroughs} />
				</ModelColumn.List>
				<ReadingChanges reader={reader} />
				{records && (
					<ModelColumn.List value="history">
						<ModelRecords
							vault={reader.vault}
							checkpoint={location.checkpoint}
							state={location.state}
							selected={model.selectedState}
							against={location.against}
							onCompare={location.compareAgainst}
							onState={location.selectState}
							onSelect={location.selectCheckpoint}
						/>
					</ModelColumn.List>
				)}
			</ModelColumn.Destinations>
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
