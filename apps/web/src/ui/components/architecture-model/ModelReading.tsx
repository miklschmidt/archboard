import { Activity, useCallback, useMemo, useRef, useState, type JSX, type ReactNode } from "react";
import type { activateCodeTarget } from "@archboard/code-opener/code-target";
import type { Model as Content } from "@archboard/board/content";
import { ModelBreadcrumbs } from "#ui/components/architecture-model/ModelBreadcrumbs.tsx";
import { ModelChanges } from "#ui/components/architecture-model/ModelChanges.tsx";
import { ModelColumn, type Destination } from "#ui/components/architecture-model/ModelColumn.tsx";
import { ModelFind } from "#ui/components/architecture-model/ModelFind.tsx";
import { ModelFlows } from "#ui/components/architecture-model/ModelFlows.tsx";
import {
	ModelCodePath,
	ModelHeading,
	ModelStateChip,
} from "#ui/components/architecture-model/ModelHeading.tsx";
import { ModelReadingSurface } from "#ui/components/architecture-model/ModelReadingSurface.tsx";
import { ModelRecords } from "#ui/components/architecture-model/ModelRecords.tsx";
import { ModelTree } from "#ui/components/architecture-model/ModelTree.tsx";
import { ModelWalkthroughs } from "#ui/components/architecture-model/ModelWalkthroughs.tsx";
import type { ChangeWalk } from "#ui/hooks/architecture-model/use-change-walk.ts";
import { useChangeKeys } from "#ui/hooks/architecture-model/use-reader-keys.ts";
import { useReader, type Reader } from "#ui/hooks/architecture-model/use-reader.ts";
import { flowCollections } from "#ui/rules/architecture-model/flow-reading.ts";
import { changeStepOf } from "#ui/rules/architecture-model/reader-keys.ts";

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
const RECORDED: readonly Destination[] = [...READING, "history"];
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
 * What the Changes tab says: how many there are, then where the reader stands among them.
 * @param walk The walk.
 * @returns The words, or nothing while no proposal is read.
 */
function walkFact(walk: ChangeWalk): string | undefined {
	if (!walk.reviewing) return undefined;
	return walk.position === undefined ? String(walk.count) : `${walk.position + 1} of ${walk.count}`;
}

/**
 * The left column of a reading: Find and the destinations.
 * @param props The reader.
 * @param props.reader The reader.
 * @returns The parts of the column.
 */
function ReadingColumn(props: { readonly reader: Reader }): JSX.Element {
	const { reader } = props;
	const { model, location, structure, tree, branches, flows, walkthroughs, choices, walk } = reader;
	const { opened, depicted } = structure;
	const find = useRef<HTMLInputElement>(null);
	const [query, setQuery] = useState("");
	const { reviewing, step } = walk;
	const typeAhead = useCallback(
		(text: string): void => {
			const change = reviewing ? changeStepOf(text) : null;
			if (change !== null) {
				step(change);
				return;
			}
			setQuery((current) => current + text);
			find.current?.focus();
		},
		[reviewing, step],
	);
	const records = keepsRecord(model);
	const { reference } = reader.comparison;
	const walker = useMemo(
		() => (reviewing ? <ModelChanges.Walker walk={walk} /> : undefined),
		[reviewing, walk],
	);
	const collections = useMemo(() => flowCollections(model, reference), [model, reference]);
	return (
		<>
			<ModelColumn.Find>
				<ModelFind
					input={find}
					query={query}
					onQuery={setQuery}
					model={model}
					onChoose={choices.chooseFind}
				/>
			</ModelColumn.Find>
			<ModelColumn.Destinations
				destination={reader.destination}
				onDestination={reader.onDestination}
				flows={flows.length}
				walkthroughs={walkthroughs.length}
				changes={walkFact(walk)}
				walker={walker}
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
						content={depicted}
						near={flows}
						collections={collections}
						flow={location.flow}
						grammar={location.grammar}
						onChoose={choices.chooseFlow}
						onGrammar={location.selectGrammar}
					/>
				</ModelColumn.List>
				<ModelColumn.List value="walkthroughs">
					<ModelWalkthroughs all={model.walkthroughs} near={walkthroughs} />
				</ModelColumn.List>
				{walk.list !== null && (
					<ModelColumn.List value="changes">
						<ModelChanges.List list={walk.list} place={walk.place} onShow={walk.show} />
					</ModelColumn.List>
				)}
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
 * The header of a reading: the crumbs, the open module's code path, the state chip and
 * `Diagram | About`. A code path says where a module is, so a flow shows none.
 * @param props The reader.
 * @param props.reader The reader.
 * @returns The parts of the header.
 */
function ReadingHeading(props: { readonly reader: Reader }): JSX.Element {
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
			<ReadingHeading reader={reader} />
			<Activity mode={reader.presenting ? "hidden" : "visible"}>
				<ModelReadingSurface {...props} reader={reader} />
			</Activity>
		</>
	);
}

export { ModelReading };
