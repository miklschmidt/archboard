// The board's other readings, laid over the picture while their tab is open:
// the parts as cards, the relationships as a table, the variants and the
// walkthroughs. Each reads straight from the board document the pane already
// holds, and each says what it holds without leaving the page.
//
// A part or a relationship picked here is picked in the pane, so the sidebar's
// selection tab explains it and the picture marks it for when the diagram tab
// comes back.

import { RiArrowRightLine } from "@remixicon/react";
import type { JSX, ReactNode } from "react";

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

/** The page shell: it covers the picture and scrolls on its own. */
function PageFrame(props: {
	readonly tab: BoardTab;
	readonly label: string;
	readonly children: ReactNode;
}): JSX.Element {
	return (
		<section
			role="tabpanel"
			aria-label={props.label}
			data-slot="board-page"
			data-tab={props.tab}
			className="bg-background absolute inset-0 z-20 overflow-x-hidden overflow-y-auto"
		>
			<div className="p-4">{props.children}</div>
		</section>
	);
}

/** What a page says while it has nothing to list. */
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
	const { node, look, groups } = props;
	const picked = props.selection === node.id;
	return (
		<li className="min-w-0">
			<button
				type="button"
				aria-pressed={picked}
				data-slot="part-card"
				data-part={node.id}
				onClick={() => props.onPick(picked ? null : node.id)}
				className="border-border bg-card shadow-card hover:border-foreground/25 hover:shadow-float aria-pressed:border-primary-text aria-pressed:bg-primary-subtle rounded-panel relative flex h-full w-full min-w-0 gap-3 border p-3 text-left"
			>
				<KindIcon
					look={look}
					kind={node.kind}
					className="mt-px"
					// A kind's colour, drawn back toward the text so the icon reads as a mark and not a signal.
					style={{
						color: `color-mix(in oklch, ${look.nodeColor(node.kind)} 70%, var(--foreground))`,
					}}
				/>
				<span className="flex min-w-0 flex-1 flex-col gap-0.5">
					<span className="text-title truncate pr-4" title={node.name}>
						{node.name}
					</span>
					<span className="text-body text-muted-foreground">{look.nodeName(node.kind)}</span>
					{node.responsibility !== undefined && (
						<span className="text-body text-foreground/80 mt-1.5 line-clamp-3">
							{node.responsibility}
						</span>
					)}
				</span>
				{node.groups !== undefined && node.groups.length > 0 && (
					<span aria-hidden="true" className="absolute top-2.5 right-2.5 flex gap-1">
						{node.groups.map((group) => (
							<i
								key={group}
								title={groups[group]?.name ?? group}
								className="size-1.5 rounded-full"
								style={{ background: `var(--semantic-${groups[group]?.color ?? "pink"})` }}
							/>
						))}
					</span>
				)}
			</button>
		</li>
	);
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
 * One relationship: where it starts, where it ends, what it carries and what kind it is.
 * @param props The relationship and the names of its ends.
 * @returns The row.
 */
function RelationshipRow(props: RelationshipRowProps): JSX.Element {
	const { edge, names, selection } = props;
	const lit = selection === edge.id || selection === edge.from || selection === edge.to;
	const picked = selection === edge.id;
	return (
		<li className={cn("border-border border-b", lit && "bg-primary-subtle")}>
			<button
				type="button"
				aria-pressed={picked}
				data-slot="relationship-row"
				data-relationship={edge.id}
				onClick={() => props.onPick(picked ? null : edge.id)}
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
	/** What the variant says, or null while the board has not arrived. */
	readonly content: VariantContent | null;
	readonly look: KindLook;
	readonly groups: GroupNames;
	readonly selection: string | null;
	readonly onPick: (id: string | null) => void;
	readonly variants: VariantsPageProps;
	readonly walkthroughs: WalkthroughsPageProps;
}

/**
 * The page of whichever tab is open.
 * @param props What the pages are made from.
 * @returns The page.
 */
function BoardPage(props: BoardPageProps): JSX.Element {
	const { tab, content } = props;
	return (
		<PageFrame tab={tab} label={PAGE_NAMES[tab]}>
			{tab === "variants" && <VariantsPage {...props.variants} />}
			{tab === "walkthroughs" && <WalkthroughsPage {...props.walkthroughs} />}
			{tab === "parts" &&
				(content === null ? (
					<Nothing>Reading the board…</Nothing>
				) : (
					<PartsPage
						content={content}
						look={props.look}
						groups={props.groups}
						selection={props.selection}
						onPick={props.onPick}
					/>
				))}
			{tab === "relationships" &&
				(content === null ? (
					<Nothing>Reading the board…</Nothing>
				) : (
					<RelationshipsPage
						content={content}
						look={props.look}
						selection={props.selection}
						onPick={props.onPick}
					/>
				))}
		</PageFrame>
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
