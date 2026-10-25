// The About page's parts and relationships: what the variant holds, and how it
// is wired.
//
// The parts are listed in their containment, each container's parts under it
// on a rail, as the navigator lists boards: a part's kind, what it is
// responsible for, the groups it belongs to and the board it opens. The
// relationships are a table of both ends, what each carries and its kind. A
// row lights while a part at either end of it is picked out.
//
// Choosing a row picks its subject in the pane, so the sidebar explains it and
// the picture marks it for when the diagram comes back. The control at the end
// of a row picks it and shows it on the diagram.

import { RiArrowRightLine, RiFocus3Line } from "@remixicon/react";
import { useCallback, useMemo, type CSSProperties, type JSX, type ReactNode } from "react";

import type { SemanticEdge, SemanticNode, VariantContent } from "@archboard/board/content";
import { cn, IconButton, RepositoryName, shownRepository } from "@archboard/ui-kit/components";
import { KindIcon, RelationshipChip } from "#ui/components/semantic-board-canvas/KindMarks.tsx";
import { LevelMark } from "#ui/components/semantic-board-canvas/LevelMark.tsx";
import { SemanticGroupChip } from "#ui/components/semantic-board-canvas/SemanticGroupChip.tsx";
import { usePaneVault } from "#ui/hooks/semantic-board-canvas/use-pane-vault.ts";
import { groupLabel, type GroupNames } from "#ui/rules/semantic-board-canvas/board/groups.ts";
import type { KindLook } from "#ui/rules/semantic-board-canvas/board/kind-look.ts";

/** What the parts and the relationships are listed from, and what a row does. */
interface AboutListProps {
	readonly content: VariantContent;
	readonly look: KindLook;
	/** What is picked out, or null. */
	readonly selection: string | null;
	/**
	 * Pick a subject out, or let it go.
	 * @param id The semantic id, or null.
	 */
	readonly onPick: (id: string | null) => void;
	/**
	 * Pick a subject out and show it on the diagram.
	 * @param id The semantic id.
	 */
	readonly onShow: (id: string) => void;
}

/** Inputs for the parts. */
interface AboutPartsProps extends AboutListProps {
	/** What the vault calls each group, and its colour. */
	readonly groups: GroupNames;
}

/** One part, where its containment puts it. */
interface PartPlace {
	readonly node: SemanticNode;
	/** How many containers stand above it. */
	readonly depth: number;
	/** How many parts it holds. */
	readonly holds: number;
}

/**
 * Every part of the variant in its containment: a container, then the parts it
 * holds, each at one more step in.
 * @param props The content and what a row does.
 * @returns The parts.
 */
function AboutParts(props: AboutPartsProps): JSX.Element {
	const { nodes } = props.content;
	const places = useMemo(() => containment(nodes), [nodes]);
	const columns = useMemo(() => partColumns(nodes), [nodes]);
	return (
		<div className="-mx-3">
			<ListHead grid={columns.grid}>
				<span>Part</span>
				<span>Responsibility</span>
				{columns.groups && <span className="hidden @min-[860px]/sheet:block">Groups</span>}
				{columns.opens && <span className="hidden @min-[860px]/sheet:block">Opens</span>}
			</ListHead>
			<ul className="border-border border-t">
				{places.map((place) => (
					<PartRow key={place.node.id} {...props} place={place} columns={columns} />
				))}
			</ul>
		</div>
	);
}

/** The columns of the parts: the grid, and whether it has a column for groups and one for the board a part opens. */
interface PartColumns {
	readonly grid: string;
	readonly groups: boolean;
	readonly opens: boolean;
}

/** Inputs for one part's row. */
interface PartRowProps extends AboutPartsProps {
	readonly place: PartPlace;
	/** The columns the row lays its cells in. */
	readonly columns: PartColumns;
}

/**
 * One part: its kind's chip, its name, its kind and how many parts it holds,
 * what it is responsible for, its groups and the board it opens.
 * @param props The part and what its row does.
 * @returns The row.
 */
function PartRow(props: PartRowProps): JSX.Element {
	const { place, look, onPick, onShow, selection } = props;
	const { node, depth, holds } = place;
	const picked = selection === node.id;
	const pick = useCallback((): void => {
		onPick(picked ? null : node.id);
	}, [onPick, picked, node.id]);
	const show = useCallback((): void => {
		onShow(node.id);
	}, [onShow, node.id]);
	const rails = useMemo<CSSProperties>(() => ({ width: depth * RAIL_STEP }), [depth]);
	const indent = useMemo<CSSProperties>(() => ({ paddingLeft: depth * RAIL_STEP }), [depth]);
	return (
		<li
			data-depth={depth}
			className="border-border hover:bg-muted/50 has-aria-pressed:bg-sidebar-accent relative flex min-w-0 items-stretch border-b"
		>
			{depth > 0 && (
				<span
					aria-hidden="true"
					className="pointer-events-none absolute inset-y-0 left-3 bg-[repeating-linear-gradient(to_right,transparent_0_11px,var(--border)_11px_12px,transparent_12px_20px)]"
					style={rails}
				/>
			)}
			{picked && <PickedMark />}
			<button
				type="button"
				aria-pressed={picked}
				data-slot="about-part"
				data-part={node.id}
				onClick={pick}
				className={cn(props.columns.grid, "min-w-0 flex-1 py-2.5 text-left")}
			>
				<span className="flex min-w-0 items-start" style={indent}>
					<PartName node={node} look={look} holds={holds} />
				</span>
				<span className="text-control text-foreground/85 min-w-0 font-normal">
					{node.responsibility}
				</span>
				{props.columns.groups && <GroupsCell node={node} groups={props.groups} />}
				{props.columns.opens && <OpensCell node={node} />}
			</button>
			<RowShow name={node.name} onShow={show} />
		</li>
	);
}

/**
 * A part's chip in its kind's colour, its name, and under it its kind and how
 * many parts it holds.
 * @param props The part, how kinds look, and how many parts it holds.
 * @param props.node The part.
 * @param props.look How the vault's kinds look.
 * @param props.holds How many parts it holds.
 * @returns The name.
 */
function PartName(props: {
	readonly node: SemanticNode;
	readonly look: KindLook;
	readonly holds: number;
}): JSX.Element {
	const { node, look, holds } = props;
	const ink = useMemo<CSSProperties>(
		() => ({ "--kind": look.nodeColor(node.kind) }),
		[look, node.kind],
	);
	return (
		<span className="flex min-w-0 items-start gap-2.5">
			<span
				aria-hidden="true"
				className="inline-flex size-6 shrink-0 items-center justify-center rounded-[5px] border border-(color:--kind)/45 bg-(color:--kind)/14 text-(color:--kind)"
				style={ink}
			>
				<KindIcon look={look} kind={node.kind} className="size-4" />
			</span>
			<span className="flex min-w-0 flex-col">
				<span className="text-control text-foreground truncate leading-6" title={node.name}>
					{node.name}
				</span>
				<span className="text-body text-muted-foreground">
					{look.nodeName(node.kind)}
					{holds > 0 && ` · holds ${holds}`}
				</span>
			</span>
		</span>
	);
}

/**
 * A cell the groups and the board a part opens stand in: in their own column
 * while the page is wide, and under the part's responsibility while it is
 * narrow, where a cell with nothing in it takes no room.
 */
const MEMBERSHIP_CELL =
	"col-start-2 min-w-0 flex-col gap-1 @min-[860px]/sheet:col-start-auto @min-[860px]/sheet:row-start-auto @min-[860px]/sheet:flex";

/**
 * The groups a part belongs to, each with its colour.
 * @param props The part, and what the vault calls each group.
 * @param props.node The part.
 * @param props.groups What the vault calls each group, and its colour.
 * @returns The cell.
 */
function GroupsCell(props: {
	readonly node: SemanticNode;
	readonly groups: GroupNames;
}): JSX.Element {
	const groups = props.node.groups ?? [];
	return (
		<span className={cn(MEMBERSHIP_CELL, groups.length === 0 ? "hidden" : "flex")}>
			{groups.map((group) => (
				<span key={group} className="text-body flex min-w-0 items-center gap-1.5">
					<SemanticGroupChip color={props.groups[group]?.color} selected={false} />
					<span className="truncate">{groupLabel(group, props.groups)}</span>
				</span>
			))}
		</span>
	);
}

/**
 * The board a part opens, with the mark of its level: the part's kind (ADR 0029).
 * A board of another repository is in a vault that only opening it finds, so it
 * has the plain mark and names its repository under it (ADR 0049). GitHub's
 * mark stands under the level's, so both names start on one line.
 * @param props The part.
 * @param props.node The part.
 * @returns The cell.
 */
function OpensCell(props: { readonly node: SemanticNode }): JSX.Element {
	const { node } = props;
	const vault = usePaneVault();
	if (node.drillDown === undefined) return <span className={cn(MEMBERSHIP_CELL, "hidden")} />;
	const { board, repo } = node.drillDown;
	return (
		<span data-slot="about-part-opens" className={cn(MEMBERSHIP_CELL, "text-body flex")}>
			<span className="flex min-w-0 items-center gap-1.5">
				<LevelMark level={node.kind} vault={repo === undefined ? vault : null} />
				<span className="truncate">{board}</span>
			</span>
			{repo !== undefined && (
				<RepositoryName
					identity={repo}
					className={cn("text-muted-foreground", !shownRepository(repo).onGitHub && "pl-5")}
				/>
			)}
		</span>
	);
}

/**
 * Every relationship of the variant, as a table of both ends, what it carries
 * and its kind.
 * @param props The content and what a row does.
 * @returns The table.
 */
function AboutRelationships(props: AboutListProps): JSX.Element {
	const { nodes, edges } = props.content;
	const byId = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
	return (
		<div className="-mx-3">
			<ListHead grid={RELATIONSHIP_GRID}>
				<span>From</span>
				<span>To</span>
				<span>What it carries</span>
				<span>Kind</span>
			</ListHead>
			<ul className="border-border border-t">
				{edges.map((edge) => (
					<RelationshipRow key={edge.id} {...props} edge={edge} byId={byId} />
				))}
			</ul>
		</div>
	);
}

/** Inputs for one relationship's row. */
interface RelationshipRowProps extends AboutListProps {
	readonly edge: SemanticEdge;
	/** Every part of the variant, by id. */
	readonly byId: ReadonlyMap<string, SemanticNode>;
}

/**
 * One relationship: where it starts, where it ends, what it carries and what
 * kind it is. It lights while a part at either end is picked out.
 * @param props The relationship and what its row does.
 * @returns The row.
 */
function RelationshipRow(props: RelationshipRowProps): JSX.Element {
	const { edge, byId, look, selection, onPick, onShow } = props;
	const picked = selection === edge.id;
	const pick = useCallback((): void => {
		onPick(picked ? null : edge.id);
	}, [onPick, picked, edge.id]);
	const show = useCallback((): void => {
		onShow(edge.id);
	}, [onShow, edge.id]);
	const from = byId.get(edge.from);
	const to = byId.get(edge.to);
	return (
		<li
			data-lit={lights(edge, selection) || undefined}
			className="border-border hover:bg-muted/50 has-aria-pressed:bg-sidebar-accent data-lit:bg-primary-subtle relative flex min-w-0 items-stretch border-b"
		>
			{picked && <PickedMark />}
			<button
				type="button"
				aria-pressed={picked}
				data-slot="about-relationship"
				data-relationship={edge.id}
				onClick={pick}
				className={cn(RELATIONSHIP_GRID, "text-control min-h-10 min-w-0 flex-1 py-2 text-left")}
			>
				<RelationshipEnd node={from} id={edge.from} look={look} />
				<span className="flex min-w-0 items-center gap-2">
					<RiArrowRightLine aria-hidden="true" className="text-muted-foreground size-4 shrink-0" />
					<RelationshipEnd node={to} id={edge.to} look={look} />
				</span>
				<span className="text-foreground/85 min-w-0 font-normal">{edge.label}</span>
				<span className="flex min-w-0">
					<RelationshipChip look={look} kind={edge.kind} />
				</span>
			</button>
			<RowShow name={relationshipName(edge, from, to)} onShow={show} />
		</li>
	);
}

/**
 * Whether a part picked out at either end lights a relationship's row. The
 * relationship itself, picked out, is marked as a picked row is.
 * @param edge The relationship.
 * @param selection What is picked out, or null.
 * @returns Whether its row is lit.
 */
function lights(edge: SemanticEdge, selection: string | null): boolean {
	return selection !== null && (selection === edge.from || selection === edge.to);
}

/**
 * What a relationship is called: what it carries, or the two parts it joins.
 * @param edge The relationship.
 * @param from The part it starts at, if the variant holds it.
 * @param to The part it ends at, if the variant holds it.
 * @returns The words.
 */
function relationshipName(
	edge: SemanticEdge,
	from: SemanticNode | undefined,
	to: SemanticNode | undefined,
): string {
	return edge.label ?? `${from?.name ?? edge.from} to ${to?.name ?? edge.to}`;
}

/**
 * One end of a relationship: its kind's icon in its kind's colour and its name.
 * @param props The part at the end, if the variant holds it.
 * @param props.node The part.
 * @param props.id Its id, for an end the variant no longer holds.
 * @param props.look How the vault's kinds look.
 * @returns The end.
 */
function RelationshipEnd(props: {
	readonly node: SemanticNode | undefined;
	readonly id: string;
	readonly look: KindLook;
}): JSX.Element {
	const { node, look } = props;
	const ink = useMemo<CSSProperties | undefined>(
		() => (node === undefined ? undefined : { color: look.nodeColor(node.kind) }),
		[look, node],
	);
	return (
		<span className="flex min-w-0 items-center gap-1.5">
			{node !== undefined && (
				<KindIcon look={look} kind={node.kind} className="size-4" style={ink} />
			)}
			<span className="truncate">{node?.name ?? props.id}</span>
		</span>
	);
}

/**
 * The control at the end of a row that picks its subject and shows it on the diagram.
 * @param props What the subject is called, and the way to show it.
 * @param props.name What the subject is called.
 * @param props.onShow Pick it out and show it on the diagram.
 * @returns The control.
 */
function RowShow(props: { readonly name: string; readonly onShow: () => void }): JSX.Element {
	return (
		<span className="flex w-11 shrink-0 items-start justify-center py-2">
			<IconButton
				label={`Show ${props.name} on the diagram`}
				tip="Show on the diagram"
				slot="about-show"
				className="text-muted-foreground hover:text-foreground"
				onClick={props.onShow}
			>
				<RiFocus3Line />
			</IconButton>
		</span>
	);
}

/**
 * The names of a list's columns, over the columns of its rows: as wide as a
 * row's cells, short of the control at the row's end. Assistive technology
 * reads each row whole, so the names are for the eye.
 * @param props The columns, and their names.
 * @param props.grid The columns the rows lay their cells in.
 * @param props.children The names.
 * @returns The head.
 */
function ListHead(props: { readonly grid: string; readonly children: ReactNode }): JSX.Element {
	return (
		<div aria-hidden="true" className="flex">
			<div className={cn(props.grid, "text-body text-muted-foreground h-row flex-1 font-semibold")}>
				{props.children}
			</div>
			<span className="w-11 shrink-0" />
		</div>
	);
}

/**
 * The gold mark on the edge of the row that is picked out, as the navigator
 * marks the board being read.
 * @returns The mark.
 */
function PickedMark(): JSX.Element {
	return (
		<span
			aria-hidden="true"
			className="bg-primary-mark absolute inset-y-1 left-0 w-0.5 rounded-full"
		/>
	);
}

/**
 * How far in each step of containment puts a part: one rail's room. A rail
 * stands 12px into its room, under the middle of its container's chip.
 */
const RAIL_STEP = 20;

/** The relationships table's columns: from, to after its arrow, what it carries, and its kind. */
const RELATIONSHIP_GRID =
	"grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)_112px] items-start gap-x-4 pl-3 pr-1";

/**
 * The columns of the parts: the part and its responsibility, and on a wide
 * page a column for groups and one for the board a part opens, each only when
 * some part has one.
 * @param nodes Every part of the variant.
 * @returns The grid's classes, and which of the two columns it has.
 */
function partColumns(nodes: readonly SemanticNode[]): PartColumns {
	const groups = nodes.some((node) => node.groups !== undefined && node.groups.length > 0);
	const opens = nodes.some((node) => node.drillDown !== undefined);
	return { grid: PART_GRIDS[`${groups}-${opens}`]!, groups, opens };
}

/** The parts' grids, for whether some part has groups and whether some part opens a board. */
const PART_GRIDS: Readonly<Record<string, string>> = {
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
 * The parts in their containment: each part that no part of the variant holds,
 * in the order the variant states it, and after each container the parts it
 * holds, in the same order.
 * @param nodes Every part of the variant.
 * @returns The parts, where their containment puts them.
 */
function containment(nodes: readonly SemanticNode[]): readonly PartPlace[] {
	const ids = new Set(nodes.map((node) => node.id));
	const held = heldBy(nodes, ids);
	const places: PartPlace[] = [];
	const seen = new Set<string>();
	/**
	 * Place a part and then the parts it holds.
	 * @param node The part.
	 * @param depth How many containers stand above it.
	 */
	const place = (node: SemanticNode, depth: number): void => {
		if (seen.has(node.id)) return;
		seen.add(node.id);
		const inside = held.get(node.id) ?? [];
		places.push({ node, depth, holds: inside.length });
		for (const child of inside) place(child, depth + 1);
	};
	for (const node of nodes) {
		if (heldIn(node, ids) === undefined) place(node, 0);
	}
	return places;
}

/**
 * The container a part stands in, when the variant holds that container.
 * @param node The part.
 * @param ids Every part of the variant, by id.
 * @returns The container's id, or undefined for a part no part holds.
 */
function heldIn(node: SemanticNode, ids: ReadonlySet<string>): string | undefined {
	return node.parent !== undefined && ids.has(node.parent) ? node.parent : undefined;
}

/**
 * The parts each container holds, in the order the variant states them.
 * @param nodes Every part of the variant.
 * @param ids Every part of the variant, by id.
 * @returns Each container's parts, by the container's id.
 */
function heldBy(
	nodes: readonly SemanticNode[],
	ids: ReadonlySet<string>,
): ReadonlyMap<string, readonly SemanticNode[]> {
	const held = new Map<string, SemanticNode[]>();
	for (const node of nodes) {
		const container = heldIn(node, ids);
		if (container !== undefined) held.set(container, [...(held.get(container) ?? []), node]);
	}
	return held;
}

export { AboutParts, AboutRelationships, type AboutListProps, type AboutPartsProps };
