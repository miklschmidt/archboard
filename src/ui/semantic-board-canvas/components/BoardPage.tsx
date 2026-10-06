// The board's other readings, laid over the picture while their tab is open:
// the parts as cards, the relationships as a table, the variants and the
// walkthroughs. Each reads straight from the board document the pane already
// holds, and each says what it holds without leaving the page.
//
// A part or a relationship picked here is picked in the pane, so the sidebar's
// selection tab explains it and the picture marks it for when the diagram tab
// comes back.

import { RiArrowRightLine } from "@remixicon/react";
import { useCallback, useMemo, type CSSProperties, type JSX, type ReactNode } from "react";

import type { SemanticEdge, SemanticNode, VariantContent } from "@/shared/semantic-board/index";
import { cn } from "@/ui/components/class-names";
import { KindIcon, RelationshipChip } from "@/ui/semantic-board-canvas/components/BoardPageParts";
import {
	VariantsPage,
	WalkthroughsPage,
	type VariantsPageProps,
	type WalkthroughsPageProps,
} from "@/ui/semantic-board-canvas/components/BoardHistoryPages";
import type { BoardTab } from "@/ui/semantic-board-canvas/components/PaneHeader";
import type { KindLook } from "@/ui/semantic-board-canvas/lib/kind-look";
import type { GroupNames } from "@/ui/semantic-board-canvas/lib/groups";

/**
 * The page shell: it covers the picture and scrolls on its own.
 * @param props The tab, what the page is called and what it holds.
 * @param props.tab The tab the page belongs to.
 * @param props.label What the page is called to assistive technology.
 * @param props.busy Whether the board has not arrived yet.
 * @param props.children What the page holds.
 * @returns The page.
 */
function PageFrame(props: {
	readonly tab: BoardTab;
	readonly label: string;
	readonly busy: boolean;
	readonly children: ReactNode;
}): JSX.Element {
	return (
		<section
			role="tabpanel"
			aria-label={props.label}
			aria-busy={props.busy || undefined}
			data-slot="board-page"
			data-tab={props.tab}
			className="bg-background absolute inset-0 z-20 overflow-x-hidden overflow-y-auto"
		>
			<div className="p-4">{props.children}</div>
		</section>
	);
}

/**
 * What a page says while it has nothing to list.
 * @param props What it says.
 * @param props.children What it says.
 * @returns The line.
 */
function Nothing(props: { readonly children: ReactNode }): JSX.Element {
	return <p className="text-muted-foreground text-control py-2">{props.children}</p>;
}

/** Inputs for the parts page. */
interface PartsPageProps {
	readonly content: VariantContent;
	readonly look: KindLook;
	readonly groups: GroupNames;
	readonly selection: string | null;
	readonly onPick: (id: string | null) => void;
}

/** Inputs for one part's card. */
interface PartCardProps extends Omit<PartsPageProps, "content"> {
	readonly node: SemanticNode;
}

/**
 * One part: its kind's icon, its name, its kind and what it is responsible for.
 * @param props The part and how to pick it.
 * @returns The card.
 */
function PartCard(props: PartCardProps): JSX.Element {
	const { node, look, groups, onPick } = props;
	const picked = props.selection === node.id;
	const pick = useCallback((): void => {
		onPick(picked ? null : node.id);
	}, [onPick, picked, node.id]);
	// A kind's colour is the chip's ink, and the wash and edge are drawn from it.
	const ink = useMemo<CSSProperties>(
		() => ({ "--kind": look.nodeColor(node.kind) }),
		[look, node.kind],
	);
	return (
		<li className="min-w-0">
			<button
				type="button"
				aria-pressed={picked}
				data-slot="part-card"
				data-part={node.id}
				onClick={pick}
				className="bg-muted shadow-card hover:border-foreground/35 hover:shadow-float relative flex h-full w-full min-w-0 items-start gap-2.5 rounded-[6px] border border-border px-3.5 py-3 text-left outline-offset-3 aria-pressed:outline-2 aria-pressed:outline-(color:--diagram-selection)"
			>
				<span
					aria-hidden="true"
					className="inline-flex size-6 shrink-0 items-center justify-center rounded-[5px] border border-(color:--kind)/45 bg-(color:--kind)/14 text-(color:--kind) [&>*]:size-4"
					style={ink}
				>
					<KindIcon look={look} kind={node.kind} />
				</span>
				<span className="flex min-w-0 flex-1 flex-col gap-0.5">
					<span className="text-nav truncate pr-4 leading-6" title={node.name}>
						{node.name}
					</span>
					<span className="sr-only">{look.nodeName(node.kind)}</span>
					{node.responsibility !== undefined && (
						<span className="text-body text-foreground/80 line-clamp-3">{node.responsibility}</span>
					)}
				</span>
				{node.groups !== undefined && node.groups.length > 0 && (
					<span aria-hidden="true" className="absolute top-2.5 right-2.5 flex gap-1">
						{node.groups.map((group) => (
							<GroupDot key={group} group={group} groups={groups} />
						))}
					</span>
				)}
			</button>
		</li>
	);
}

/**
 * One group a part belongs to, as a dot in the group's colour.
 * @param props The group and what the vault calls its groups.
 * @param props.group The group's id.
 * @param props.groups What the vault calls each group, and its colour.
 * @returns The dot.
 */
function GroupDot(props: { readonly group: string; readonly groups: GroupNames }): JSX.Element {
	const named = props.groups[props.group];
	const color = named?.color ?? "pink";
	const paint = useMemo<CSSProperties>(() => ({ background: `var(--semantic-${color})` }), [color]);
	return <i title={named?.name ?? props.group} className="size-1.5 rounded-full" style={paint} />;
}

/**
 * Every part of the variant, as cards.
 * @param props The content and what is picked.
 * @returns The page.
 */
function PartsPage(props: PartsPageProps): JSX.Element {
	const { nodes } = props.content;
	if (nodes.length === 0) {
		return <Nothing>This variant has no parts yet.</Nothing>;
	}
	return (
		<ul className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-3">
			{nodes.map((node) => (
				<PartCard key={node.id} {...props} node={node} />
			))}
		</ul>
	);
}

/** Inputs for the relationships page. */
interface RelationshipsPageProps {
	readonly content: VariantContent;
	readonly look: KindLook;
	readonly selection: string | null;
	readonly onPick: (id: string | null) => void;
}

/** Inputs for one relationship's row. */
interface RelationshipRowProps extends Omit<RelationshipsPageProps, "content"> {
	readonly edge: SemanticEdge;
	readonly names: ReadonlyMap<string, string>;
}

/**
 * Whether what is picked out lights a relationship: the relationship itself, or
 * a part at either end of it.
 * @param edge The relationship.
 * @param selection What is picked out, or null.
 * @returns Whether its row is lit.
 */
function lights(edge: SemanticEdge, selection: string | null): boolean {
	return selection === edge.id || selection === edge.from || selection === edge.to;
}

/**
 * One relationship: where it starts, where it ends, what it carries and what kind it is.
 * @param props The relationship and the names of its ends.
 * @returns The row.
 */
function RelationshipRow(props: RelationshipRowProps): JSX.Element {
	const { edge, names, selection, onPick } = props;
	const picked = selection === edge.id;
	const pick = useCallback((): void => {
		onPick(picked ? null : edge.id);
	}, [onPick, picked, edge.id]);
	return (
		<li className={cn("border-border border-b", lights(edge, selection) && "bg-primary-subtle")}>
			<button
				type="button"
				aria-pressed={picked}
				data-slot="relationship-row"
				data-relationship={edge.id}
				onClick={pick}
				className={cn(
					RELATIONSHIP_GRID,
					"text-control hover:bg-muted/60 min-h-10 w-full py-1.5 text-left",
				)}
			>
				<span className="truncate">{names.get(edge.from) ?? edge.from}</span>
				<RiArrowRightLine aria-hidden="true" className="text-muted-foreground size-4" />
				<span className="truncate">{names.get(edge.to) ?? edge.to}</span>
				<span className="text-muted-foreground truncate">{edge.label ?? ""}</span>
				<span className="flex justify-end">
					<RelationshipChip look={props.look} kind={edge.kind} plate />
				</span>
			</button>
		</li>
	);
}

/**
 * Every relationship of the variant, as a table.
 * @param props The content and what is picked.
 * @returns The page.
 */
function RelationshipsPage(props: RelationshipsPageProps): JSX.Element {
	const { edges, nodes } = props.content;
	const names = new Map(nodes.map((node) => [node.id, node.name]));
	if (edges.length === 0) {
		return <Nothing>This variant has no relationships yet.</Nothing>;
	}
	return (
		<div className="-mx-4">
			<div
				aria-hidden="true"
				className={cn(
					RELATIONSHIP_GRID,
					"text-body text-muted-foreground border-border h-row border-b font-semibold",
				)}
			>
				<span>From</span>
				<span />
				<span>To</span>
				<span>What it carries</span>
				<span className="text-right">Kind</span>
			</div>
			<ul>
				{edges.map((edge) => (
					<RelationshipRow key={edge.id} {...props} edge={edge} names={names} />
				))}
			</ul>
		</div>
	);
}

/** The relationships table's columns: from, the arrow, to, what it carries, and its kind. */
const RELATIONSHIP_GRID =
	"grid grid-cols-[minmax(0,1fr)_16px_minmax(0,1fr)_minmax(0,1.3fr)_96px] items-center gap-3 px-4";

/** Inputs for the page of whichever tab is open. */
interface BoardPageProps {
	readonly tab: Exclude<BoardTab, "diagram">;
	/** What the variant on screen says, or null when the board has no such variant. */
	readonly content: VariantContent | null;
	readonly look: KindLook;
	readonly groups: GroupNames;
	readonly selection: string | null;
	readonly onPick: (id: string | null) => void;
	/** The board's variants and its record, or null while the board has not arrived. */
	readonly variants: VariantsPageProps | null;
	readonly walkthroughs: WalkthroughsPageProps;
}

/**
 * The page of whichever tab is open.
 * @param props What the pages are made from.
 * @returns The page.
 */
function BoardPage(props: BoardPageProps): JSX.Element {
	const { tab } = props;
	return (
		<PageFrame tab={tab} label={PAGE_NAMES[tab]} busy={props.variants === null}>
			<OpenPage {...props} />
		</PageFrame>
	);
}

/**
 * What the open tab lists. Every page waits for the board to arrive, so that
 * none says the board has no variant, walkthrough or part before it is read.
 * The parts, the relationships and the walkthroughs are the variant's, so they
 * also need the board to have the variant on screen.
 * @param props What the pages are made from.
 * @returns The open tab's page.
 */
function OpenPage(props: BoardPageProps): JSX.Element {
	const { tab, content, variants } = props;
	if (variants === null) return <Nothing>Reading the board…</Nothing>;
	if (tab === "variants") return <VariantsPage {...variants} />;
	if (content === null) return <Nothing>The board has no such variant.</Nothing>;
	if (tab === "walkthroughs") return <WalkthroughsPage {...props.walkthroughs} />;
	if (tab === "parts") {
		return (
			<PartsPage
				content={content}
				look={props.look}
				groups={props.groups}
				selection={props.selection}
				onPick={props.onPick}
			/>
		);
	}
	return (
		<RelationshipsPage
			content={content}
			look={props.look}
			selection={props.selection}
			onPick={props.onPick}
		/>
	);
}

/** What each page is called to assistive technology. */
const PAGE_NAMES: Readonly<Record<Exclude<BoardTab, "diagram">, string>> = {
	parts: "Parts",
	relationships: "Relationships",
	variants: "Variants",
	walkthroughs: "Walkthroughs",
};

export { BoardPage, type BoardPageProps };
