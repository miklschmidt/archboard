// What the board says about one picked part, set out for reading in the order a
// reader asks: what it is (its title, the line it is responsible for and the
// longer account), where it stands against the variant it is read against (only
// in a comparison), for a part that holds parts what it offers the parts outside
// it (`ContainerInterface`), the same measures on each variant of the board
// (`InterfaceOnEachVariant`) and what its code exposes (`ExposedNames`), what it
// is wired to, and how it has changed in code
// (`PartHistory`). At the foot are the ways to go deeper (`GoDeeper`).
//
// It is the selection tab of the pane's sidebar, so it has the sidebar's one
// width and its regions, sections and rows (`SemanticSidebarParts`): a rule
// divides one question from the next, and space divides the sections of one.

import { useCallback, useMemo, type JSX, type ReactNode } from "react";

import type { CodeBinding } from "@archboard/code-binding/bindings";
import type { SemanticBoard, SemanticVariant } from "@archboard/board/document";
import type { VariantContent } from "@archboard/board/content";
import { KindIcon, RelationshipChip } from "#ui/components/semantic-board-canvas/KindMarks.tsx";
import { ContainerInterface } from "#ui/components/semantic-board-canvas/ContainerInterface.tsx";
import { ExposedNames } from "#ui/components/semantic-board-canvas/ExposedNames.tsx";
import { GoDeeper } from "#ui/components/semantic-board-canvas/GoDeeper.tsx";
import { InterfaceOnEachVariant } from "#ui/components/semantic-board-canvas/InterfaceOnEachVariant.tsx";
import { PartHistory } from "#ui/components/semantic-board-canvas/PartHistory.tsx";
import {
	Account,
	Membership,
	SubjectTitle,
	type GroupControls,
} from "#ui/components/semantic-board-canvas/SemanticInspectorParts.tsx";
import {
	SidebarChoice,
	SidebarChoices,
	SidebarGlyph,
	SidebarHeading,
	SidebarLabel,
	SidebarMeta,
	SidebarRegion,
} from "#ui/components/semantic-board-canvas/SemanticSidebarParts.tsx";
import type { ReadingOnScreen } from "#ui/hooks/semantic-board-canvas/use-code-findings.ts";
import { usePeekControl, usePeeked } from "#ui/hooks/semantic-board-canvas/use-peek.ts";
import type { NodeSubject } from "#ui/rules/semantic-board-canvas/board/board-document.ts";
import { connectionsOf, type Link } from "#ui/rules/semantic-board-canvas/board/connections.ts";
import type { KindLook } from "#ui/rules/semantic-board-canvas/board/kind-look.ts";
import { reachOf, type Way } from "#ui/rules/semantic-board-canvas/board/reach.ts";
import type { OpenDown } from "#ui/rules/semantic-board-canvas/drilling/drill-target.ts";

/** Inputs for the title. */
interface PartTitleProps {
	readonly node: NodeSubject["node"];
	readonly look: KindLook;
	/** What the vault calls each group, and how to select one. */
	readonly groups: GroupControls;
}

/**
 * The part: its name, what kind it is, and the groups it belongs to, each the
 * control that selects its members.
 * @param props The part.
 * @returns The title.
 */
function PartTitle(props: PartTitleProps): JSX.Element {
	const { node, look, groups } = props;
	return (
		<SubjectTitle name={node.name} look={look} kind={node.kind}>
			<span>{look.nodeName(node.kind)}</span>
			{(node.groups ?? []).map((group) => (
				<Membership key={group} group={group} controls={groups} />
			))}
		</SubjectTitle>
	);
}

/** Inputs for the control that traces what a part reaches. */
interface TraceToggleProps {
	/** The part. */
	readonly part: string;
	/** What the part is called, which the control's name says. */
	readonly name: string;
	/** Which way along the relationships the trace goes. */
	readonly way: Way;
	/** How many parts the trace reaches. */
	readonly parts: number;
}

/**
 * What the control traces and how much that is, said in words.
 * @param props The part, the direction and how many parts it reaches.
 * @returns The control's accessible name.
 */
function traceName(props: TraceToggleProps): string {
	const { name, way, parts } = props;
	const what =
		way === "onward" ? `everything ${name} sends to` : `everything that sends to ${name}`;
	return `Trace ${what}, directly or through other parts: ${parts} ${parts === 1 ? "part" : "parts"}`;
}

/**
 * The control that asks the picture to trace what a part reaches, directly or
 * through other parts, in one direction. It says how many parts that is, and it
 * is pressed while the picture shows the trace.
 * @param props The part, the direction and how many parts it reaches.
 * @returns The control, or nothing when there is nothing to reach.
 */
function TraceToggle(props: TraceToggleProps): JSX.Element | null {
	const { part, way, parts } = props;
	const { trace } = usePeeked();
	const control = usePeekControl();
	const on = trace?.part === part && trace.way === way;
	const toggle = useCallback((): void => {
		control.trace(on ? null : { part, way });
	}, [control, on, part, way]);
	if (parts === 0) {
		return null;
	}
	return (
		<button
			type="button"
			aria-pressed={on}
			aria-label={traceName(props)}
			data-slot="semantic-inspector-trace"
			data-way={way}
			onClick={toggle}
			className="text-body border-border hover:bg-sidebar-accent/50 aria-pressed:border-primary-mark aria-pressed:bg-primary-subtle rounded-control flex h-6 shrink-0 items-center gap-1.5 border px-2 transition-colors"
		>
			{way === "onward" ? "Trace onward" : "Trace back"}
			<span aria-hidden="true" className="text-technical text-muted-foreground font-mono">
				{parts}
			</span>
		</button>
	);
}

/** Inputs for one relationship of a list. */
interface LinkRowProps {
	readonly link: Link;
	readonly look: KindLook;
	readonly onPick: (id: string) => void;
}

/**
 * One relationship of a part: the other part with its kind's icon and its
 * name, what the relationship carries under the name, and the relationship's
 * kind at the end of the name's line, so the words under it keep the whole
 * width. Pointing at it, or focusing it, lights the relationship on the picture.
 * @param props The relationship, as seen from the part, and what to do with a pick.
 * @returns The row.
 */
function LinkRow(props: LinkRowProps): JSX.Element {
	const { edge, other } = props.link;
	const { onPick, look } = props;
	const { point } = usePeekControl();
	const aim = useCallback((): void => point(edge.id), [point, edge.id]);
	const leave = useCallback((): void => point(null), [point]);
	const choose = useCallback((): void => {
		if (other !== undefined) onPick(other.id);
	}, [onPick, other]);
	return (
		<SidebarChoice
			disabled={other === undefined}
			data-slot="semantic-inspector-link"
			data-edge={edge.id}
			onClick={choose}
			onPointerEnter={aim}
			onPointerLeave={leave}
			onFocus={aim}
			onBlur={leave}
		>
			<SidebarGlyph>
				<KindIcon look={look} kind={other?.kind ?? "other"} className="text-foreground/80 size-4" />
			</SidebarGlyph>
			<SidebarLabel>
				{other?.name ?? "Unknown part"}
				{edge.label !== undefined && <SidebarMeta>{edge.label}</SidebarMeta>}
			</SidebarLabel>
			<span className="flex h-[18px] shrink-0 items-center">
				<RelationshipChip look={look} kind={edge.kind} />
			</span>
		</SidebarChoice>
	);
}

/** Inputs for one list of relationships. */
interface LinksProps {
	readonly title: string;
	readonly links: readonly Link[];
	readonly look: KindLook;
	readonly onPick: (id: string) => void;
	/** The part the list is about, and what it is called. */
	readonly part: string;
	readonly name: string;
	/** Which way the list goes, and how many parts a trace of it reaches. */
	readonly way: Way;
	readonly reach: number;
}

/**
 * One direction of a part's relationships, and the control that traces how far
 * that direction reaches.
 * @param props The title, the links and what to do with one.
 * @returns The list, or nothing when there are none.
 */
function Links(props: LinksProps): JSX.Element | null {
	const { title, links, look } = props;
	if (links.length === 0) {
		return null;
	}
	return (
		<section
			data-slot="semantic-inspector-links"
			aria-label={title}
			className="flex flex-col gap-1"
		>
			<div className="flex min-h-6 items-center justify-between gap-2">
				<SidebarHeading level={3}>
					{title}{" "}
					<span className="text-technical ml-0.5 font-mono font-normal">{links.length}</span>
				</SidebarHeading>
				<TraceToggle part={props.part} name={props.name} way={props.way} parts={props.reach} />
			</div>
			<SidebarChoices label={title} slot="semantic-inspector-link-list">
				{links.map((link) => (
					<LinkRow key={link.edge.id} link={link} look={look} onPick={props.onPick} />
				))}
			</SidebarChoices>
		</section>
	);
}

/** Inputs for the relationships. */
interface RelationshipsProps {
	readonly content: VariantContent;
	readonly partId: string;
	readonly name: string;
	readonly look: KindLook;
	readonly onPick: (id: string) => void;
}

/**
 * What the part sends to and what it receives from, and how far each reaches.
 * @param props The variant, the part and what to do with a link.
 * @returns The two lists, or the word that nothing connects to the part.
 */
function Relationships(props: RelationshipsProps): JSX.Element {
	const { content, partId, name } = props;
	const { sends, receives } = connectionsOf(content, partId);
	const onward = useMemo(() => reachOf(content, partId, "onward").parts, [content, partId]);
	const back = useMemo(() => reachOf(content, partId, "back").parts, [content, partId]);
	if (sends.length + receives.length === 0) {
		return <p className="text-muted-foreground text-body">Nothing on this board connects to it.</p>;
	}
	return (
		<>
			<Links
				title="Sends to"
				links={sends}
				look={props.look}
				onPick={props.onPick}
				part={partId}
				name={name}
				way="onward"
				reach={onward}
			/>
			<Links
				title="Receives from"
				links={receives}
				look={props.look}
				onPick={props.onPick}
				part={partId}
				name={name}
				way="back"
				reach={back}
			/>
		</>
	);
}

/** Inputs for the details panel. */
interface DetailsPanelProps {
	readonly subject: NodeSubject;
	/** The variant that holds the part: what it says, and whose history is read. */
	readonly held: SemanticVariant;
	/** The board, whose variants a container is measured on side by side. */
	readonly board: SemanticBoard | undefined;
	readonly look: KindLook;
	/** What the vault calls each group, and how to select one. */
	readonly groups: GroupControls;
	/**
	 * Pick another part out, the one at the other end of a relationship.
	 * @param id The part.
	 */
	readonly onPick: (id: string) => void;
	readonly onOpen: OpenDown;
	readonly onOpenCode: ((binding: CodeBinding) => void) | undefined;
	/** The level of the board the part is drawn on, which places the board it opens. */
	readonly level: string | undefined;
	/** Where the part stands, set between what it is and what it is wired to. */
	readonly children?: ReactNode;
	/** The board, variant and version on screen, which its history is read at; null for none. */
	readonly on: ReadingOnScreen | null;
}

/**
 * The details of one picked part.
 * @param props The part, what its variant says and how to follow what it leads to.
 * @returns The panel's body: a scrolling column, and the way deeper at its foot.
 */
function DetailsPanel(props: DetailsPanelProps): JSX.Element {
	const { subject } = props;
	const { node } = subject;
	return (
		<div data-slot="semantic-details" className="flex min-h-0 flex-1 flex-col">
			<div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
				<SidebarRegion slot="semantic-inspector-about">
					<PartTitle node={node} look={props.look} groups={props.groups} />
					<Account lead={node.responsibility} detail={node.description} />
				</SidebarRegion>
				{props.children}
				<ContainerInterface
					content={props.held.content}
					node={node}
					look={props.look}
					onPick={props.onPick}
				/>
				{props.board !== undefined && props.on !== null && (
					<InterfaceOnEachVariant board={props.board} showing={props.on.variant} part={node.id} />
				)}
				{props.on !== null && (
					<ExposedNames node={node} content={props.held.content} on={props.on} />
				)}
				<SidebarRegion slot="semantic-inspector-wiring">
					<Relationships
						content={props.held.content}
						partId={node.id}
						name={node.name}
						look={props.look}
						onPick={props.onPick}
					/>
				</SidebarRegion>
				{props.on !== null && (
					<PartHistory
						board={props.on.board}
						version={props.on.version}
						variant={props.held}
						node={node}
						look={props.look}
						onPick={props.onPick}
					/>
				)}
			</div>
			<GoDeeper
				target={node.drillDown}
				kind={node.kind}
				here={props.level}
				binding={node.binding}
				onOpen={props.onOpen}
				onOpenCode={props.onOpenCode}
			/>
		</div>
	);
}

export { DetailsPanel, type DetailsPanelProps };
