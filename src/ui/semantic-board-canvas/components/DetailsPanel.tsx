// What the board says about one picked part, set out for reading: what it is
// for, where its code is, what it sends to and receives from, and at the foot
// the ways to go deeper (`GoDeeper`).
//
// It is the selection tab of the pane's sidebar, so it has the sidebar's one
// width and its type. The heading of a section is the sidebar's own.

import { RiBookLine, RiCheckLine, RiFileCopyLine, RiFileLine } from "@remixicon/react";
import { useCallback, useState, type JSX, type ReactNode } from "react";

import type { CodeBinding } from "@/shared/code-target";
import type { VariantContent } from "@/shared/semantic-board/index";
import { KindIcon, RelationshipChip } from "@/ui/semantic-board-canvas/components/BoardPageParts";
import { GoDeeper } from "@/ui/semantic-board-canvas/components/GoDeeper";
import { SidebarHeading } from "@/ui/semantic-board-canvas/components/SemanticSidebarParts";
import type { NodeSubject } from "@/ui/semantic-board-canvas/lib/board-document";
import { connectionsOf, type Link } from "@/ui/semantic-board-canvas/lib/connections";
import type { KindLook } from "@/ui/semantic-board-canvas/lib/kind-look";

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
 * The part: its kind's icon in a gold ring, its name in the display face, and
 * what kind it is and which groups it belongs to.
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
				className="border-primary bg-primary/10 text-primary-text flex size-11 shrink-0 items-center justify-center rounded-full border-[1.5px]"
			>
				<KindIcon look={props.look} kind={node.kind} className="size-[22px]" />
			</span>
			<div className="flex min-w-0 flex-1 flex-col gap-0.5">
				<h2
					className="font-display truncate text-[22px] leading-[26px] font-medium tracking-[0.09em]"
					title={node.name}
				>
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
				className="text-muted-foreground hover:bg-sidebar-accent hover:text-foreground -my-1 flex size-6 shrink-0 items-center justify-center rounded-[3px] [&_svg]:size-3.5"
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

/** Inputs for one list of relationships. */
interface LinksProps {
	readonly title: string;
	readonly links: readonly Link[];
	readonly look: KindLook;
	readonly onPick: (id: string) => void;
}

/**
 * One direction of a part's relationships: the other part with its kind's
 * icon, its name and what the relationship carries, and the relationship's
 * kind at the end.
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
			<h4 className="text-body mt-1 mb-0.5 font-medium">
				{props.title} <span className="text-muted-foreground font-normal">{links.length}</span>
			</h4>
			<ul className="-mx-2">
				{links.map(({ edge, other }) => (
					<li key={edge.id}>
						<button
							type="button"
							disabled={other === undefined}
							data-slot="semantic-inspector-link"
							onClick={() => other !== undefined && props.onPick(other.id)}
							className="hover:bg-sidebar-accent/50 flex min-h-9 w-full items-center gap-2 rounded-[3px] px-2 py-1 text-left disabled:opacity-60"
						>
							<KindIcon
								look={look}
								kind={other?.kind ?? "other"}
								className="text-foreground/80 size-4"
							/>
							<span className="flex min-w-0 flex-1 flex-col">
								<span className="text-body truncate font-medium">
									{other?.name ?? "Unknown part"}
								</span>
								{edge.label !== undefined && (
									<span className="text-technical text-muted-foreground truncate">
										{edge.label}
									</span>
								)}
							</span>
							<RelationshipChip look={look} kind={edge.kind} />
						</button>
					</li>
				))}
			</ul>
		</div>
	);
}

/** Inputs for the relationships section. */
interface RelationshipsProps {
	readonly content: VariantContent;
	readonly partId: string;
	readonly look: KindLook;
	readonly onPick: (id: string) => void;
}

/**
 * What the part sends to and what it receives from.
 * @param props The variant, the part and what to do with a link.
 * @returns The section.
 */
function Relationships(props: RelationshipsProps): JSX.Element {
	const { sends, receives } = connectionsOf(props.content, props.partId);
	return (
		<PanelSection title="Relationships" slot="semantic-inspector-relationships">
			{sends.length + receives.length === 0 && (
				<p className="text-muted-foreground text-body">Nothing on this board connects to it.</p>
			)}
			<Links title="Sends to" links={sends} look={props.look} onPick={props.onPick} />
			<Links title="Receives from" links={receives} look={props.look} onPick={props.onPick} />
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
					look={props.look}
					onPick={props.onPick}
				/>
				{props.children}
			</div>
			<GoDeeper
				target={node.drillDown}
				binding={node.binding}
				onOpen={props.onOpen}
				onOpenCode={props.onOpenCode}
			/>
		</div>
	);
}

export { DetailsPanel, type DetailsPanelProps };
