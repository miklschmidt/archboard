// The foot of the details panel: the ways to go deeper from a picked part. One
// opens the board the part leads to, with the mark the card wears on the
// picture (a ring around an arrow up, down or across) and the same words the
// card's hover tip uses for which way it lies; it is the panel's primary
// action, in gold. The other views the part's code through the shell's own
// open-code action. It names the file it opens and the symbol the binding
// names in it, which makes it the one place the part's binding is shown, and
// it comes with the way to copy that path.
//
// The foot has no heading: its rows say what they do, and a part that leads
// nowhere has no foot.

import { useQuery } from "@tanstack/react-query";
import {
	RiArrowDownCircleLine,
	RiArrowRightCircleLine,
	RiArrowRightLine,
	RiArrowUpCircleLine,
	RiCheckLine,
	RiCodeSSlashLine,
	RiFileCopyLine,
	RiStackLine,
	type RemixiconComponentType,
} from "@remixicon/react";
import { useCallback, useState, type JSX, type ReactNode } from "react";

import type { CodeBinding } from "@archboard/code-binding/bindings";
import type { SemanticBoard, SemanticVariant } from "@archboard/board/document";
import { Button, cn } from "@archboard/ui-kit/components";
import {
	drillWay,
	drillWayWords,
	type DrillWay,
} from "#ui/rules/semantic-board-canvas/drilling/drill-way.ts";
import { useSemanticBoardChanges } from "#ui/hooks/semantic-board-canvas/use-semantic-board-changes.ts";
import {
	drillDownAsked,
	drillTargetName,
	resolveDrillDown,
	type DrillPlace,
	type DrillResolution,
	type OtherRepository,
} from "#ui/rules/semantic-board-canvas/drilling/drill-target.ts";
import { useDrillPlace } from "#ui/hooks/semantic-board-canvas/use-drill-place.ts";
import {
	semanticBoardDocumentQuery,
	vaultCheckQuery,
} from "#ui/clients/semantic-board-canvas/reads/queries.ts";
import { usePaneVault } from "#ui/hooks/semantic-board-canvas/use-pane-vault.ts";
import type { OpenDown } from "#ui/rules/semantic-board-canvas/drilling/drill-target.ts";
import type { SemanticNode } from "@archboard/board/content";

type DrillDown = NonNullable<SemanticNode["drillDown"]>;

/** Inputs for one way to go deeper. */
interface GoProps {
	readonly icon: RemixiconComponentType;
	readonly title: string;
	readonly slot: string;
	readonly onClick: () => void;
	/** Whether it is the panel's primary action, in gold, with an arrow at its end. */
	readonly primary?: boolean;
	readonly lifecycle?: string | undefined;
	/** What the pointer resting on it says, when that is more than its words. */
	readonly tip?: string | undefined;
	/** Its second line: what it opens, or where. */
	readonly children?: ReactNode;
}

/**
 * One way to go deeper: a bordered row with an icon, what it does and what it
 * opens. A long name wraps rather than being cut off.
 * @param props The row.
 * @returns The button.
 */
function Go(props: GoProps): JSX.Element {
	const { icon: Icon, primary } = props;
	return (
		<button
			type="button"
			data-slot={props.slot}
			data-variant-lifecycle={props.lifecycle}
			title={props.tip}
			onClick={props.onClick}
			className={cn(
				"rounded-control flex min-h-11 w-full min-w-0 items-center gap-3 border px-3 py-1.5 text-left transition-colors active:translate-y-px",
				primary === true
					? "primary-finish"
					: "border-border bg-card shadow-raised hover:bg-muted active:shadow-pressed dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
			)}
		>
			<span aria-hidden="true" className="flex size-4 shrink-0 [&_svg]:size-full">
				<Icon />
			</span>
			<span className="flex min-w-0 flex-1 flex-col">
				<span className="text-control font-semibold [overflow-wrap:anywhere]">{props.title}</span>
				{props.children !== undefined && (
					<span
						className={cn(
							"text-body [overflow-wrap:anywhere]",
							primary === true ? "text-primary-foreground/75" : "text-muted-foreground",
						)}
					>
						{props.children}
					</span>
				)}
			</span>
			{primary === true && (
				<span aria-hidden="true" className="flex size-4 shrink-0 [&_svg]:size-full">
					<RiArrowRightLine />
				</span>
			)}
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

/** Inputs for the way down, once the board it leads to has been resolved. */
interface OpenBoardProps {
	/** What the part's drill-down names. */
	readonly target: DrillDown;
	/** The board it leads to. */
	readonly board: SemanticBoard;
	/** The variant of it that it opens. */
	readonly variant: SemanticVariant;
	/** The part's kind, which is the level of the board it opens (ADR 0029). */
	readonly kind: string;
	/** The level of the board the part is drawn on. */
	readonly here: string | undefined;
	/** Open the board one level down. */
	readonly onOpen: OpenDown;
	/** The other repository the board is in, when it is not in the pane's own. */
	readonly there: OtherRepository | undefined;
}

/** What each state that is not the current architecture is called where a person reads it. */
const LIFECYCLE_WORDS: Readonly<Record<Exclude<SemanticVariant["lifecycle"], "current">, string>> =
	{
		draft: "draft proposal",
		historical: "historical state",
		shelved: "shelved proposal",
	};

/**
 * The variant the way down opens, when it is not the current architecture: its
 * name and what sort of state it is, because "the architecture", "a draft
 * proposal" and "a frozen historical state" are three different things to be
 * looking at.
 * @param variant The variant it opens.
 * @returns The words, or nothing for the current architecture.
 */
function stateOf(variant: SemanticVariant): readonly string[] {
	if (variant.lifecycle === "current") {
		return [];
	}
	return [`${variant.name}, ${LIFECYCLE_WORDS[variant.lifecycle]}`];
}

/**
 * Where the way down goes, in words: which way and how far, the level of the
 * board it opens, and the state it opens when that is not the current architecture.
 * @param props What the way down opens.
 * @param levels The vault's levels, coarsest first, once read.
 * @returns The words.
 */
function standingOf(props: OpenBoardProps, levels: readonly string[] | undefined): string {
	const { board, variant, kind, here } = props;
	const level = `${board.level.charAt(0).toUpperCase()}${board.level.slice(1)}`;
	const said = [drillWayWords(kind, here, levels), level].filter((part) => part !== null);
	return [...said, ...stateOf(variant)].join(" · ");
}

/**
 * The way down: opens the board the part drills into, naming it and the level
 * it sits at.
 * @param props What the way down opens.
 * @returns The primary action.
 */
function OpenBoard(props: OpenBoardProps): JSX.Element {
	const { target, board, variant, kind, here, onOpen, there } = props;
	const vault = usePaneVault();
	const levels = useQuery(vaultCheckQuery(vault)).data?.policy.levels;
	const way = drillWay(kind, here, levels);
	const open = useCallback((): void => {
		onOpen(board.name, variant.id, there);
	}, [onOpen, board.name, variant.id, there]);
	return (
		<>
			<Go
				slot="semantic-drill-down-open"
				lifecycle={variant.lifecycle}
				icon={way === null ? RiStackLine : WAY_ICONS[way]}
				title={`Open ${board.name}`}
				primary
				onClick={open}
			>
				{standingOf(props, levels)}
			</Go>
			<p className="sr-only">Asks for {drillDownAsked(target)}.</p>
		</>
	);
}

/** Inputs for the way down. */
interface WayDownProps {
	readonly target: DrillDown;
	/** The part's kind, which is the level of the board it opens (ADR 0029). */
	readonly kind: string;
	/** The level of the board the part is drawn on. */
	readonly here: string | undefined;
	/** Open the board one level down. */
	readonly onOpen: OpenDown;
}

/** What the way down says when the board is in a repository this machine cannot read. */
const UNREACHABLE_WORDS: Readonly<
	Record<Extract<DrillPlace, { readonly kind: "unreachable" }>["state"], string>
> = {
	gone: "whose chosen checkout is gone",
	"no-vault": "whose chosen checkout has no vault",
	unchosen: "which has no chosen checkout",
};

/**
 * Why a board of another repository cannot be read here, and what to do.
 * @param place Where the link lies, when it cannot be read.
 * @param board The board the link names.
 * @returns The sentence, and the slot it is drawn in.
 */
function placeRefusal(
	place: Extract<DrillPlace, { readonly kind: "unregistered" | "unreachable" }>,
	board: string,
): { readonly slot: string; readonly words: string } {
	if (place.kind === "unregistered") {
		return {
			slot: "semantic-drill-unregistered",
			words: `${board} is a board of ${place.repo}, and this machine knows no checkout of it with a vault. Register one with archboard repo add <directory>.`,
		};
	}
	return {
		slot: "semantic-drill-unreachable",
		words: `${board} is a board of ${place.repo}, ${UNREACHABLE_WORDS[place.state]}. Choose a checkout with a vault in its menu in Board navigation, or add one with archboard repo add <directory>.`,
	};
}

/**
 * The way down, or the reason there is none. A target that cannot be opened
 * says why, in its place: it is never swapped for a state the link did not ask
 * for (ADR 0023). A board of another repository is read in that repository's
 * vault (ADR 0050).
 * @param props The target and how to open it.
 * @returns The way down, or the reason there is none.
 */
function WayDown(props: WayDownProps): JSX.Element {
	const place = useDrillPlace(props.target);
	const vault = usePaneVault();
	if (place === undefined) {
		return <p className="text-muted-foreground text-body">Reading {props.target.board}…</p>;
	}
	if (place.kind !== "readable") {
		const refusal = placeRefusal(place, props.target.board);
		return (
			<p data-slot={refusal.slot} className="text-body">
				{refusal.words}
			</p>
		);
	}
	return <WayDownIn {...props} vault={place.there?.vault ?? vault} there={place.there} />;
}

/**
 * The way down to a board read in its own vault, or the reason there is none.
 * Only the target is read there: which way it lies is measured in the levels of
 * the vault the part is drawn in, as the card on the picture measures it.
 * @param props The target, how to open it, the vault it is in, and the other repository, if any.
 * @returns The way down, or the reason there is none.
 */
function WayDownIn(
	props: WayDownProps & {
		readonly vault: string;
		readonly there: OtherRepository | undefined;
	},
): JSX.Element {
	const { target, onOpen, kind, here, there, vault } = props;
	const document = useQuery(semanticBoardDocumentQuery(vault, target.board));
	const name = drillTargetName(target, document.data);
	// Heard under the name the board goes by now, so a state superseded since the
	// link was written is never opened as though it were current.
	useSemanticBoardChanges(vault, target.board, name);
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
	return (
		<OpenBoard
			target={target}
			board={resolution.board}
			variant={resolution.variant}
			kind={kind}
			here={here}
			onOpen={onOpen}
			there={there}
		/>
	);
}

/**
 * A path with a place to break the line after each slash, so a long one wraps
 * between its parts and not in the middle of a name.
 * @param props The path.
 * @param props.path The path.
 * @returns The path, breakable.
 */
function BreakablePath(props: { readonly path: string }): JSX.Element {
	const parts = props.path.split("/");
	return (
		<>
			{parts.map((part, at) => (
				<span key={parts.slice(0, at + 1).join("/")}>
					{part}
					{at < parts.length - 1 && (
						<>
							/<wbr />
						</>
					)}
				</span>
			))}
		</>
	);
}

/**
 * Where a binding is pinned, for the pointer resting on the way to its code:
 * the repository, and the branch and commit when it names them.
 * @param binding The part's binding.
 * @returns The words.
 */
function bindingTip(binding: CodeBinding): string {
	const { repo, branch, commit } = binding;
	const pinned = [branch, commit?.slice(0, 8)].filter((part) => part !== undefined).join(" @ ");
	return pinned === "" ? repo : `${repo} · ${pinned}`;
}

/**
 * The control that copies the bound path. It says that it did while the pointer
 * or the focus stays on it, and goes back to its icon when either leaves.
 * @param props The path.
 * @param props.path The bound path.
 * @returns The control.
 */
function CopyPath(props: { readonly path: string }): JSX.Element {
	const { path } = props;
	const [copied, setCopied] = useState(false);
	const copy = useCallback((): void => {
		navigator.clipboard.writeText(path).then(
			() => setCopied(true),
			() => undefined,
		);
	}, [path]);
	const rest = useCallback((): void => {
		setCopied(false);
	}, []);
	return (
		<Button
			type="button"
			variant="outline"
			size="icon"
			aria-label={copied ? "Copied path" : "Copy path"}
			data-slot="semantic-inspector-copy"
			className="h-auto min-h-11 w-9 shrink-0 self-stretch"
			onClick={copy}
			onPointerLeave={rest}
			onBlur={rest}
		>
			{copied ? <RiCheckLine /> : <RiFileCopyLine />}
		</Button>
	);
}

/** Inputs for the way to the code. */
interface ViewInCodeProps {
	/** The part's code, when it is bound to some. */
	readonly binding: CodeBinding | undefined;
	/** Open it, when the shell can. */
	readonly onOpenCode: ((binding: CodeBinding) => void) | undefined;
}

/** Inputs for the way to a part's code, once there is some and a way to open it. */
interface CodeRowProps {
	readonly binding: CodeBinding;
	/**
	 * Open the code in the person's editor.
	 * @param binding Where the code is.
	 */
	readonly onOpenCode: (binding: CodeBinding) => void;
}

/**
 * The way to the code: the file the part is bound to, opened in the person's
 * editor, and its path to copy. A binding that names a symbol shows it under
 * the path, and the server opens the file at the line that defines it where it
 * finds that line and the opener takes one (`@archboard/code-opener`).
 * @param props The binding and the shell's way of opening it.
 * @returns The row.
 */
function CodeRow(props: CodeRowProps): JSX.Element {
	const { binding, onOpenCode } = props;
	const open = useCallback((): void => {
		onOpenCode(binding);
	}, [binding, onOpenCode]);
	return (
		<div data-slot="semantic-inspector-code" className="flex gap-2">
			<Go
				slot="semantic-inspector-open-code"
				icon={RiCodeSSlashLine}
				title="View in code"
				tip={bindingTip(binding)}
				onClick={open}
			>
				<span className="text-technical font-mono">
					<BreakablePath path={binding.path} />
				</span>
				{binding.symbol !== undefined && (
					<span
						data-slot="semantic-inspector-symbol"
						className="text-technical text-foreground block font-mono"
					>
						{binding.symbol}
					</span>
				)}
			</Go>
			<CopyPath path={binding.path} />
		</div>
	);
}

/**
 * The way to the code, for a part that is bound to some when the shell can
 * open it.
 * @param props The binding and the shell's way of opening it.
 * @returns The row, or nothing.
 */
function ViewInCode(props: ViewInCodeProps): JSX.Element | null {
	const { binding, onOpenCode } = props;
	if (binding === undefined || onOpenCode === undefined) {
		return null;
	}
	return <CodeRow binding={binding} onOpenCode={onOpenCode} />;
}

/** Inputs for the foot of the panel. */
interface GoDeeperProps extends ViewInCodeProps {
	/** What the part drills into, when it does. */
	readonly target: DrillDown | undefined;
	/** The part's kind, which is the level of the board it opens (ADR 0029). */
	readonly kind: string;
	/** The level of the board the part is drawn on. */
	readonly here: string | undefined;
	readonly onOpen: OpenDown;
}

/**
 * Whether the part leads anywhere: to a board, or to code the shell can open.
 * @param props What the part leads to.
 * @returns Whether it does.
 */
function leadsAnywhere(props: GoDeeperProps): boolean {
	return (
		props.target !== undefined || (props.binding !== undefined && props.onOpenCode !== undefined)
	);
}

/**
 * The foot of the panel: open the board the part drills into, and view its code.
 * @param props What the part leads to and how to follow it.
 * @returns The block, or nothing for a part that leads nowhere.
 */
function GoDeeper(props: GoDeeperProps): JSX.Element | null {
	const { target, binding, onOpenCode } = props;
	if (!leadsAnywhere(props)) {
		return null;
	}
	return (
		<footer
			data-slot="semantic-go-deeper"
			className="border-border bg-raised shadow-edge-up relative flex shrink-0 flex-col gap-2 border-t px-4 py-4"
		>
			{target !== undefined && (
				<WayDown target={target} kind={props.kind} here={props.here} onOpen={props.onOpen} />
			)}
			<ViewInCode binding={binding} onOpenCode={onOpenCode} />
		</footer>
	);
}

export { GoDeeper, type GoDeeperProps };
