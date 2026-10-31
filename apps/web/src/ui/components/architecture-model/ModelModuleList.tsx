import { useCallback, useMemo, type CSSProperties, type JSX } from "react";
import type { Model, projectModel } from "@archboard/board/content";
import type { ChangeKind } from "@archboard/board/comparison";
import { cn } from "@archboard/ui-kit/components";
import { KindChip, ModelAboutTable } from "#ui/components/architecture-model/ModelAboutTable.tsx";
import { ModelCodePath } from "#ui/components/architecture-model/ModelHeading.tsx";
import { SemanticGroupChip } from "#ui/components/semantic-board-canvas/SemanticGroupChip.tsx";
import { StandingSample } from "#ui/components/semantic-board-canvas/SemanticTypeSamples.tsx";
import type { ModelSelection } from "#ui/hooks/architecture-model/use-model-selection.ts";
import { useModelPick } from "#ui/hooks/architecture-model/use-model-pick.ts";
import type { ModulePlace } from "#ui/rules/architecture-model/module-places.ts";
import { groupLabel, type GroupNames } from "#ui/rules/semantic-board-canvas/board/groups.ts";
import type { KindLook } from "#ui/rules/semantic-board-canvas/board/kind-look.ts";

type Projection = ReturnType<typeof projectModel>;
type Module = Projection["children"][number];

/** Inputs for a list of modules. */
interface ModelModuleListProps {
	model: Model;
	projection: Projection;
	places: readonly ModulePlace<Module>[];
	selection: ModelSelection;
	look: KindLook;
	/** What the first column is called. */
	head: string;
	/** Where a test finds the list. */
	slot: string;
	/** Pick a subject out and show it on the diagram. */
	onShow: (id: string) => void;
}

/** The columns of a list: the grid, and whether it has a column for groups and one for code. */
interface ModuleColumns {
	readonly grid: string;
	readonly groups: boolean;
	readonly code: boolean;
}

/** A column that stands only while the page is wide. */
const WIDE_ONLY = "hidden @min-[860px]/sheet:block";

/**
 * A list of the modules of a reading, as a table in their containment. A row selects, and the page
 * stays, so a person builds a selection here from the keyboard: Enter selects a row, and a
 * modifier with Enter adds it. The control at the end of a row shows the module on the diagram.
 * @param props The modules and the canonical selection.
 * @returns The table.
 */
function ModelModuleList(props: ModelModuleListProps): JSX.Element {
	const { places, projection, selection, look, model, onShow } = props;
	const columns = useMemo(() => moduleColumns(places), [places]);
	return (
		<div className="-mx-3">
			<ModelAboutTable.Head grid={columns.grid}>
				<span>{props.head}</span>
				<span>Responsibility</span>
				{columns.groups && <span className={WIDE_ONLY}>Groups</span>}
				{columns.code && <span className={WIDE_ONLY}>Code</span>}
			</ModelAboutTable.Head>
			<ul data-slot={props.slot} className="border-border border-t">
				{places.map((place) => (
					<ModuleRow
						key={place.module.id}
						place={place}
						columns={columns}
						groups={model.policy.groups}
						look={look}
						selected={selection.ids.has(place.module.id)}
						standing={projection.standing?.[place.module.id]}
						onSelect={selection.select}
						onShow={onShow}
					/>
				))}
			</ul>
		</div>
	);
}

interface ModuleRowProps {
	place: ModulePlace<Module>;
	columns: ModuleColumns;
	groups: GroupNames;
	look: KindLook;
	selected: boolean;
	standing: ChangeKind | undefined;
	onSelect: ModelSelection["select"];
	onShow: (id: string) => void;
}

/** How far in a step of containment puts a module. A rail stands under its container's chip. */
const RAIL_STEP = 20;

/**
 * A native button keeps each module reachable from the keyboard.
 * @param props The module, its selection state, and the selection action.
 * @returns One row.
 */
function ModuleRow(props: ModuleRowProps): JSX.Element {
	const { place, columns, onSelect, onShow, selected } = props;
	const { module, depth } = place;
	const { id } = module;
	const pick = useModelPick(id, onSelect);
	const show = useCallback((): void => onShow(id), [onShow, id]);
	const indent = useMemo<CSSProperties>(() => ({ paddingLeft: depth * RAIL_STEP }), [depth]);
	return (
		<li className="border-border hover:bg-muted/50 has-aria-pressed:bg-sidebar-accent relative flex min-w-0 items-stretch border-b">
			{depth > 0 && <ContainmentRail />}
			{selected && <ModelAboutTable.Picked />}
			<button
				type="button"
				data-module-id={id}
				data-depth={depth}
				data-standing={props.standing}
				aria-pressed={selected}
				{...pick}
				className={cn(columns.grid, "min-w-0 flex-1 py-2.5 text-left")}
			>
				<span className="flex min-w-0 items-start" style={indent}>
					<ModuleName {...props} />
				</span>
				<span className="text-control text-foreground/85 min-w-0 font-normal">
					{module.responsibility}
				</span>
				{columns.groups && <GroupsCell module={module} groups={props.groups} />}
				{columns.code && (
					<span className="hidden min-w-0 pt-1 @min-[860px]/sheet:flex">
						<ModelCodePath path={place.path} />
					</span>
				)}
			</button>
			<ModelAboutTable.Show name={module.name} onShow={show} />
		</li>
	);
}

/**
 * The rail that says a row stands inside the row above it.
 * @returns The rail.
 */
function ContainmentRail(): JSX.Element {
	return (
		<span
			aria-hidden="true"
			className="bg-border pointer-events-none absolute inset-y-0 left-[23px] w-px"
		/>
	);
}

/**
 * A module's chip in its kind's colour, its name, and under it its kind and how many parts it holds.
 * @param props The module and how it stands.
 * @returns The name.
 */
function ModuleName(props: ModuleRowProps): JSX.Element {
	const { place, look, standing } = props;
	const { module, holds } = place;
	return (
		<span className="flex min-w-0 items-start gap-2.5">
			<KindChip look={look} kind={module.kind} />
			<span className="flex min-w-0 flex-col">
				<span className="text-control flex items-center gap-2 leading-6">
					<span data-slot="model-module-name" className="min-w-0 [overflow-wrap:anywhere]">
						{module.name}
					</span>
					{standing !== undefined && standing !== "unchanged" && (
						<>
							<StandingSample standing={standing} />
							<span className="text-body text-muted-foreground font-normal capitalize">
								{standing}
							</span>
						</>
					)}
				</span>
				<span className="text-body text-muted-foreground">
					{look.nodeName(module.kind)}
					{holds > 0 && ` · holds ${holds}`}
				</span>
			</span>
		</span>
	);
}

/**
 * The groups a module belongs to, each with its colour.
 * @param props The module, and what the vault calls each group.
 * @param props.module The module.
 * @param props.groups What the vault calls each group, and its colour.
 * @returns The cell.
 */
function GroupsCell(props: { readonly module: Module; readonly groups: GroupNames }): JSX.Element {
	return (
		<span className={`${WIDE_ONLY} min-w-0`}>
			{props.module.groups?.map((group) => (
				<span key={group} className="text-body flex min-w-0 items-center gap-1.5">
					<SemanticGroupChip color={props.groups[group]?.color} selected={false} />
					<span className="truncate">{groupLabel(group, props.groups)}</span>
				</span>
			))}
		</span>
	);
}

/** The grids of a list, for whether some module has groups and whether some module has code. */
const MODULE_GRIDS: Readonly<Record<string, string>> = {
	"false-false":
		"grid grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] items-start gap-x-6 gap-y-1.5 pl-3 pr-1",
	"true-false":
		"grid grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] items-start gap-x-6 gap-y-1.5 pl-3 pr-1 @min-[860px]/sheet:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_160px]",
	"false-true":
		"grid grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] items-start gap-x-6 gap-y-1.5 pl-3 pr-1 @min-[860px]/sheet:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_180px]",
	"true-true":
		"grid grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] items-start gap-x-6 gap-y-1.5 pl-3 pr-1 @min-[860px]/sheet:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_160px_180px]",
};

/**
 * The columns of a list: the module and its responsibility, and on a wide page a column for groups
 * and one for code, each only when some module has one.
 * @param places The rows.
 * @returns The grid's classes, and which of the two columns it has.
 */
function moduleColumns(places: readonly ModulePlace<Module>[]): ModuleColumns {
	const groups = places.some(({ module }) => (module.groups?.length ?? 0) > 0);
	const code = places.some(({ path }) => path !== undefined);
	return { grid: MODULE_GRIDS[`${groups}-${code}`]!, groups, code };
}

export { ModelModuleList };
