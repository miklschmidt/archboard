// The foot of the details panel: the ways to go deeper from a picked part. One
// opens the board the part leads to, with the mark the card wears on the
// picture (a ring around an arrow up, down or across) and the same words the
// card's hover tip uses for which way it lies; it is the panel's primary
// action, in gold. The other views the part's code through the shell's own
// open-code action.

import { useQuery } from "@tanstack/react-query";
import {
	RiArrowDownCircleLine,
	RiArrowRightCircleLine,
	RiArrowRightLine,
	RiArrowUpCircleLine,
	RiCodeSSlashLine,
	RiExternalLinkLine,
	RiStackLine,
	type RemixiconComponentType,
} from "@remixicon/react";
import type { JSX, ReactNode } from "react";

import type { CodeBinding } from "@/shared/code-target";
import type { DrillDown } from "@/shared/semantic-board/index";
import { cn } from "@/ui/components/class-names";
import { drillWay, drillWayWords, type DrillWay } from "@/ui/semantic-board-canvas/lib/drill-way";
import { SidebarHeading } from "@/ui/semantic-board-canvas/components/SemanticSidebarParts";
import { useSemanticBoardChanges } from "@/ui/semantic-board-canvas/hooks/use-semantic-board-changes";
import {
	drillDownAsked,
	drillTargetName,
	resolveDrillDown,
	type DrillResolution,
} from "@/ui/semantic-board-canvas/lib/drill-target";
import {
	semanticBoardDocumentQuery,
	vaultCheckQuery,
} from "@/ui/semantic-board-canvas/lib/queries";

/** Inputs for one way to go deeper. */
interface GoProps {
	readonly icon: ReactNode;
	readonly title: string;
	readonly sub: string;
	readonly end: ReactNode;
	readonly slot: string;
	readonly onClick: () => void;
	/** Whether it is the panel's primary action, in gold. */
	readonly primary?: boolean;
	readonly lifecycle?: string | undefined;
}

/**
 * One way to go deeper: a bordered row with an icon, what it does and what it opens.
 * @param props The row.
 * @returns The button.
 */
function Go(props: GoProps): JSX.Element {
	return (
		<button
			type="button"
			data-slot={props.slot}
			data-variant-lifecycle={props.lifecycle}
			title={props.title}
			onClick={props.onClick}
			className={cn(
				"rounded-control flex min-h-11 w-full min-w-0 items-center gap-3 px-3 py-1.5 text-left",
				props.primary === true
					? "bg-primary text-primary-foreground hover:bg-primary/90"
					: "border-input hover:bg-sidebar-accent/50 border",
			)}
		>
			<span aria-hidden="true" className="flex size-4 shrink-0 [&_svg]:size-full">
				{props.icon}
			</span>
			<span className="flex min-w-0 flex-1 flex-col">
				<span className="text-control truncate font-semibold">{props.title}</span>
				<span
					className={cn(
						"text-body truncate",
						props.primary === true ? "text-primary-foreground/75" : "text-muted-foreground",
					)}
				>
					{props.sub}
				</span>
			</span>
			<span
				aria-hidden="true"
				className={cn(
					"flex size-4 shrink-0 [&_svg]:size-full",
					props.primary !== true && "text-muted-foreground",
				)}
			>
				{props.end}
			</span>
		</button>
	);
}

/**
 * Why a target cannot be opened, in words that name the thing that is missing.
 * @param resolution What the target board answered.
 * @param target What the drill-down names.
 * @returns The sentence, or null when there is nothing wrong.
 */
function refusalWords(resolution: DrillResolution, target: DrillDown): string | null {
	if (resolution.kind === "no-variant") {
		return `${target.board} has no variant called "${resolution.asked}". Nothing was opened in its place.`;
	}
	if (resolution.kind === "no-current") {
		return `${target.board} has no current variant, and this link asks for whichever one is.`;
	}
	return resolution.kind === "unreadable"
		? `${target.board} could not be read. ${resolution.problem}`
		: null;
}

/** The mark of each way, as the card on the picture draws it. */
const WAY_ICONS: Readonly<Record<DrillWay, RemixiconComponentType>> = {
	up: RiArrowUpCircleLine,
	down: RiArrowDownCircleLine,
	across: RiArrowRightCircleLine,
};

/** Inputs for the way down. */
interface WayDownProps {
	readonly target: DrillDown;
	/** The part's kind, which is the level of the board it opens (ADR 0029). */
	readonly kind: string;
	/** The level of the board the part is drawn on. */
	readonly here: string | undefined;
	/**
	 * Open the board one level down.
	 * @param board The target board.
	 * @param variant The variant to open, by id.
	 */
	readonly onOpen: (board: string, variant: string) => void;
}

/**
 * The way down: opens the board the part drills into, naming it and the level it
 * sits at. A target that cannot be opened says why, in its place: it is never
 * swapped for a state the link did not ask for (ADR 0023).
 * @param props The target and how to open it.
 * @returns The way down, or the reason there is none.
 */
function WayDown(props: WayDownProps): JSX.Element {
	const { target, onOpen, kind, here } = props;
	const document = useQuery(semanticBoardDocumentQuery(target.board));
	const levels = useQuery(vaultCheckQuery()).data?.policy.levels;
	const name = drillTargetName(target, document.data);
	// Heard under the name the board goes by now, so a state superseded since the
	// link was written is never opened as though it were current.
	useSemanticBoardChanges(target.board, name);
	if (document.error !== null) {
		return (
			<p className="text-body">
				{target.board} could not be opened. {document.error.message}
			</p>
		);
	}
	if (document.data === undefined) {
		return <p className="text-muted-foreground text-body">Reading {target.board}…</p>;
	}
	const resolution = resolveDrillDown(target, document.data);
	if (resolution.kind !== "ready") {
		return <p className="text-body">{refusalWords(resolution, target)}</p>;
	}
	const { board, variant } = resolution;
	const way = drillWay(kind, here, levels);
	const level = `${board.level.charAt(0).toUpperCase()}${board.level.slice(1)}`;
	const said = [drillWayWords(kind, here, levels), level].filter((part) => part !== null);
	// A state that is not the current architecture says so before it is opened.
	const standing = [...said, ...(variant.lifecycle === "current" ? [] : [variant.name])].join(
		" · ",
	);
	const Icon = way === null ? RiStackLine : WAY_ICONS[way];
	return (
		<Go
			slot="semantic-drill-down-open"
			lifecycle={variant.lifecycle}
			icon={<Icon />}
			title={`Open ${board.name}`}
			sub={standing}
			end={<RiArrowRightLine />}
			primary
			onClick={() => onOpen(board.name, variant.id)}
		/>
	);
}

/** Inputs for the foot of the panel. */
interface GoDeeperProps {
	/** What the part drills into, when it does. */
	readonly target: DrillDown | undefined;
	/** The part's kind, which is the level of the board it opens (ADR 0029). */
	readonly kind: string;
	/** The level of the board the part is drawn on. */
	readonly here: string | undefined;
	/** The part's code, when it is bound to some and the shell can open it. */
	readonly binding: CodeBinding | undefined;
	readonly onOpen: (board: string, variant: string) => void;
	readonly onOpenCode: ((binding: CodeBinding) => void) | undefined;
}

/**
 * The foot of the panel: open the board the part drills into, and view its code.
 * @param props What the part leads to and how to follow it.
 * @returns The block, or nothing for a part that leads nowhere.
 */
function GoDeeper(props: GoDeeperProps): JSX.Element | null {
	const { target, binding, onOpenCode } = props;
	const code =
		binding !== undefined && onOpenCode !== undefined ? { binding, open: onOpenCode } : null;
	if (target === undefined && code === null) {
		return null;
	}
	return (
		<footer
			data-slot="semantic-go-deeper"
			className="border-border bg-sidebar flex shrink-0 flex-col gap-2 border-t px-4 py-4"
		>
			<SidebarHeading level={3}>Go deeper</SidebarHeading>
			{target !== undefined && (
				<WayDown target={target} kind={props.kind} here={props.here} onOpen={props.onOpen} />
			)}
			{code !== null && (
				<Go
					slot="semantic-inspector-open-code"
					icon={<RiCodeSSlashLine />}
					title="View in code"
					sub="Open in your editor"
					end={<RiExternalLinkLine />}
					onClick={() => code.open(code.binding)}
				/>
			)}
			{target !== undefined && <p className="sr-only">Asks for {drillDownAsked(target)}.</p>}
		</footer>
	);
}

export { GoDeeper, type GoDeeperProps };
