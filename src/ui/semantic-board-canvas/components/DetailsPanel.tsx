// What the board says about one picked part, set out for reading: what it is
// for, where its code is, what it sends to and receives from, and at the foot
// the ways to go deeper (`GoDeeper`).
//
// It is the selection tab of the pane's sidebar, so it has the sidebar's one
// width and its type. The heading of a section is the sidebar's own.

import { RiBookLine, RiCheckLine, RiFileCopyLine, RiFileLine } from "@remixicon/react";
import { useCallback, useMemo, useState, type JSX, type ReactNode } from "react";

import type { CodeBinding } from "@/shared/code-target";
import type { VariantContent } from "@/shared/semantic-board/index";
import { KindIcon, RelationshipChip } from "@/ui/semantic-board-canvas/components/BoardPageParts";
import { GoDeeper } from "@/ui/semantic-board-canvas/components/GoDeeper";
import { SidebarHeading } from "@/ui/semantic-board-canvas/components/SemanticSidebarParts";
import { usePeekControl, usePeeked } from "@/ui/semantic-board-canvas/hooks/use-peek";
import type { NodeSubject } from "@/ui/semantic-board-canvas/lib/board-document";
import { connectionsOf, type Link } from "@/ui/semantic-board-canvas/lib/connections";
import type { KindLook } from "@/ui/semantic-board-canvas/lib/kind-look";
import { reachOf, type Way } from "@/ui/semantic-board-canvas/lib/reach";

/** A section of the panel: a heading over its body, under the rule above. */
function PanelSection(props: {
	readonly title: ReactNode;
	readonly slot: string;
	readonly children: ReactNode;
}): JSX.Element {
	return (
		<section
			data-slot={props.slot}
			className="border-border flex flex-col gap-2 border-t px-4 py-4"
		>
			<SidebarHeading level={3}>{props.title}</SidebarHeading>
			{props.children}
		</section>
	);
}

/** Inputs for the title. */
interface PanelTitleProps {
	readonly subject: NodeSubject;
	readonly look: KindLook;
	/** What the vault calls each group, by id. */
	readonly groupNames: Readonly<Record<string, { readonly name: string }>>;
}

/**
 * The part: its kind's icon in a gold ring, the ring the picture draws round
 * what is picked out; its name in the display face, as the pane's header sets
 * the board's; and what kind it is and which groups it belongs to.
 * @param props The part.
 * @returns The title block.
 */
function PanelTitle(props: PanelTitleProps): JSX.Element {
	const { node } = props.subject;
	const groups = (node.groups ?? []).map((id) => props.groupNames[id]?.name ?? id);
	return (
		<div className="flex items-center gap-3 px-4 py-4">
			<span
				aria-hidden="true"
				className="border-primary-mark bg-primary-subtle text-primary-text shadow-raised flex size-10 shrink-0 items-center justify-center rounded-full border-[1.5px]"
			>
				<KindIcon look={props.look} kind={node.kind} className="size-5" />
			</span>
			<div className="flex min-w-0 flex-1 flex-col">
				<h2 className="title-name truncate" title={node.name}>
					{node.name}
				</h2>
				<p className="text-body text-muted-foreground truncate">
					{[props.look.nodeName(node.kind), ...groups].join(" · ")}
				</p>
			</div>
		</div>
	);
}

/**
 * What the part is for: the line it is responsible for, then the longer account.
 * @param props The part's two statements.
 * @param props.responsibility The line, when there is one.
 * @param props.description The account, when there is one.
 * @returns The section.
 */
function Purpose(props: {
	readonly responsibility: string | undefined;
	readonly description: string | undefined;
}): JSX.Element {
	const { responsibility, description } = props;
	return (
		<PanelSection title="Purpose" slot="semantic-inspector-purpose">
			{responsibility === undefined && description === undefined && (
				<p className="text-muted-foreground text-body">
					The board states no purpose for this part.
				</p>
			)}
			{responsibility !== undefined && <p className="text-body">{responsibility}</p>}
			{description !== undefined && (
				<p
					className="text-body text-muted-foreground whitespace-pre-line"
					data-slot="semantic-inspector-description"
				>
					{description}
				</p>
			)}
		</PanelSection>
	);
}

/**
 * A path or a repository with a place to break the line after each slash, so a
 * long one wraps between its parts and not in the middle of a name.
 * @param text The path.
 * @returns The path, breakable.
 */
function breakable(text: string): ReactNode {
	const parts = text.split("/");
	return parts.map((part, index) => (
		<span key={`${index}-${part}`}>
			{part}
			{index < parts.length - 1 && (
				<>
					/<wbr />
				</>
			)}
		</span>
	));
}

/** Inputs for one line of the code location. */
interface CopyRowProps {
	readonly icon: ReactNode;
	readonly text: string;
	readonly label: string;
}

/**
 * One piece of the code location, with the control that copies it.
 * @param props The icon, the text and what it is.
 * @returns The row.
 */
function CopyRow(props: CopyRowProps): JSX.Element {
	const { text } = props;
	const [copied, setCopied] = useState(false);
	const copy = useCallback((): void => {
		navigator.clipboard?.writeText(text).then(
			() => {
				setCopied(true);
				window.setTimeout(() => setCopied(false), 1200);
			},
			() => undefined,
		);
	}, [text]);
	return (
		<div className="flex min-h-7 items-start gap-2 py-1">
			<span
				aria-hidden="true"
				className="text-muted-foreground flex size-4 shrink-0 [&_svg]:size-full"
			>
				{props.icon}
			</span>
			<span
				title={text}
				className="text-technical min-w-0 flex-1 font-mono [overflow-wrap:anywhere]"
			>
				{breakable(text)}
			</span>
			<button
				type="button"
				aria-label={copied ? `Copied ${props.label}` : `Copy ${props.label}`}
				data-slot="semantic-inspector-copy"
				onClick={copy}
				className="text-muted-foreground hover:bg-sidebar-accent hover:text-foreground rounded-control -my-1 flex size-6 shrink-0 items-center justify-center [&_svg]:size-3.5"
			>
				{copied ? <RiCheckLine /> : <RiFileCopyLine />}
			</button>
		</div>
	);
}

/**
 * Where the part's code is: its repository and its path, each to copy.
 * @param props The binding, when the part has one.
 * @param props.binding The binding.
 * @returns The section.
 */
function CodeLocation(props: { readonly binding: CodeBinding | undefined }): JSX.Element {
	const { binding } = props;
	return (
		<PanelSection title="Code location" slot="semantic-inspector-binding">
			{binding === undefined ? (
				<p className="text-muted-foreground text-body" data-slot="semantic-inspector-unbound">
					No code binding.
				</p>
			) : (
				<div className="flex flex-col">
					<CopyRow icon={<RiBookLine />} text={binding.repo} label="repository" />
					<CopyRow icon={<RiFileLine />} text={binding.path} label="path" />
					{binding.branch !== undefined && (
						<p className="text-technical text-muted-foreground mt-1 truncate pl-6 font-mono">
							{binding.branch}
							{binding.commit === undefined ? "" : ` @ ${binding.commit.slice(0, 8)}`}
						</p>
					)}
				</div>
			)}
		</PanelSection>
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
			className="text-body border-border hover:bg-sidebar-accent/50 aria-pressed:border-primary-mark aria-pressed:bg-primary-subtle rounded-control ml-auto flex h-6 shrink-0 items-center gap-1.5 border px-2"
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
 * One relationship of a part: the other part with its kind's icon, its name and
 * what the relationship carries, and the relationship's kind at the end.
 * Pointing at it, or focusing it, lights the relationship on the picture.
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
		<li>
			<button
				type="button"
				disabled={other === undefined}
				data-slot="semantic-inspector-link"
				data-edge={edge.id}
				onClick={choose}
				onPointerEnter={aim}
				onPointerLeave={leave}
				onFocus={aim}
				onBlur={leave}
				className="hover:bg-sidebar-accent/50 rounded-control flex min-h-9 w-full items-center gap-2 px-2 py-1 text-left disabled:opacity-60"
			>
				<KindIcon look={look} kind={other?.kind ?? "other"} className="text-foreground/80 size-4" />
				<span className="flex min-w-0 flex-1 flex-col">
					<span className="text-body truncate font-medium">{other?.name ?? "Unknown part"}</span>
					{edge.label !== undefined && (
						<span className="text-body text-muted-foreground truncate">{edge.label}</span>
					)}
				</span>
				<RelationshipChip look={look} kind={edge.kind} />
			</button>
		</li>
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
	const { links, look } = props;
	if (links.length === 0) {
		return null;
	}
	return (
		<div data-slot="semantic-inspector-links" className="flex flex-col">
			<div className="mt-1 mb-0.5 flex items-center gap-1.5">
				<h4 className="text-body flex items-baseline gap-1.5 font-medium">
					{props.title}
					<span className="text-technical text-muted-foreground font-mono font-normal">
						{links.length}
					</span>
				</h4>
				<TraceToggle part={props.part} name={props.name} way={props.way} parts={props.reach} />
			</div>
			<ul className="-mx-2">
				{links.map((link) => (
					<LinkRow key={link.edge.id} link={link} look={look} onPick={props.onPick} />
				))}
			</ul>
		</div>
	);
}

/** Inputs for the relationships section. */
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
 * @returns The section.
 */
function Relationships(props: RelationshipsProps): JSX.Element {
	const { content, partId, name } = props;
	const { sends, receives } = connectionsOf(content, partId);
	const onward = useMemo(() => reachOf(content, partId, "onward").parts, [content, partId]);
	const back = useMemo(() => reachOf(content, partId, "back").parts, [content, partId]);
	return (
		<PanelSection title="Relationships" slot="semantic-inspector-relationships">
			{sends.length + receives.length === 0 && (
				<p className="text-muted-foreground text-body">Nothing on this board connects to it.</p>
			)}
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
		</PanelSection>
	);
}

/** Inputs for the details panel. */
interface DetailsPanelProps {
	readonly subject: NodeSubject;
	/** What the variant that holds the part says. */
	readonly content: VariantContent;
	readonly look: KindLook;
	/** What the vault calls each group. */
	readonly groupNames: PanelTitleProps["groupNames"];
	/**
	 * Pick another part out, the one at the other end of a relationship.
	 * @param id The part.
	 */
	readonly onPick: (id: string) => void;
	readonly onOpen: (board: string, variant: string) => void;
	readonly onOpenCode: ((binding: CodeBinding) => void) | undefined;
	/** The level of the board the part is drawn on, which places the board it opens. */
	readonly level: string | undefined;
	/** Everything under the details: what was decided about the part, and where it stands. */
	readonly children?: ReactNode;
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
				<PanelTitle subject={subject} look={props.look} groupNames={props.groupNames} />
				<Purpose responsibility={node.responsibility} description={node.description} />
				<CodeLocation binding={node.binding} />
				<Relationships
					content={props.content}
					partId={node.id}
					name={node.name}
					look={props.look}
					onPick={props.onPick}
				/>
				{props.children}
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
