import {
	RiAlertLine,
	RiArrowRightLine,
	RiCheckLine,
	RiFocus3Line,
	RiInformationLine,
	RiQuestionLine,
} from "@remixicon/react";
import { useCallback, type JSX, type MouseEvent } from "react";
import { Badge, Button, cn } from "@archboard/ui-kit/components";
import type { FindingRoute } from "#ui/architecture-drawing/model-reader/reading/rules/finding-route.ts";
import type {
	CodeEvidence,
	CodeFinding,
} from "#ui/architecture-drawing/canvas/presentation/components/SemanticInspectorCode.tsx";

/** Severity words, which a sighted reader tells by the chip. */
const SEVERITY_WORDS: Readonly<Record<CodeFinding["severity"], string>> = {
	warning: "Warning",
	information: "Information",
};

/** What the chip calls each finding of the code check. A code it does not know reads as words. */
const FINDING_NAMES: Readonly<Record<string, string>> = {
	ANCHOR_MISMATCH: "Anchor mismatch",
	ANCHOR_PATH_MISSING: "Missing anchor file",
	ANCHOR_SYMBOL_MISSING: "Missing anchor symbol",
	BINDING_PATH_MISSING: "Missing bound file",
	BINDING_SYMBOL_MISSING: "Missing bound symbol",
	CALLER_UNDRAWN: "Missing caller",
	DOCUMENT_PATH_MISSING: "Missing document",
	ENTRY_POINT_UNEXPOSED: "Entry point not exposed",
	EXPOSED_UNUSED: "Exposed and unused",
	INHERITED_PART_DROPPED: "Inherited part dropped",
	MODULE_SHALLOW: "Shallow module",
	RELATIONSHIP_BACKWARDS: "Backwards relationship",
	RELATIONSHIP_UNDRAWN: "Missing relationship",
	RELATIONSHIP_UNSUPPORTED: "Unsupported relationship",
	TEST_IMPORT_UNEXPOSED: "Test reaches inside",
	VARIABLE_PASSED_THROUGH: "Variable passed through",
};

/** How sure a piece of evidence is, in words, with its mark. */
const STRENGTH = {
	resolved: { words: "Resolved by analysis", Icon: RiCheckLine, ink: "text-standing-added" },
	candidate: { words: "Matched by name only", Icon: RiQuestionLine, ink: "text-muted-foreground" },
} as const;

/**
 * The name of a finding, as its chip says it.
 * @param code The finding's code.
 * @returns Its name.
 */
function findingName(code: string): string {
	const known = FINDING_NAMES[code];
	if (known !== undefined) return known;
	const words = code.toLowerCase().replaceAll("_", " ");
	return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * How many findings the pass has, of each severity. A pass with no warning counts only its
 * information, under the mark of information.
 * @param props The findings.
 * @param props.findings The findings.
 * @returns The count.
 */
function FindingCounts(props: { readonly findings: readonly CodeFinding[] }): JSX.Element {
	const warnings = props.findings.filter((finding) => finding.severity === "warning").length;
	const information = props.findings.length - warnings;
	if (warnings === 0)
		return (
			<p className="text-control text-foreground flex items-center gap-2 font-semibold">
				<RiInformationLine aria-hidden="true" className="text-muted-foreground size-4" />
				{information} information
			</p>
		);
	return (
		<p className="text-control text-foreground flex items-center gap-2 font-semibold">
			<RiAlertLine aria-hidden="true" className="text-standing-changed size-4" />
			{warnings} {warnings === 1 ? "warning" : "warnings"}
			{information > 0 && (
				<span className="text-muted-foreground font-normal">· {information} information</span>
			)}
		</p>
	);
}

/** Inputs for the card of one finding. */
interface FindingCardProps {
	readonly finding: CodeFinding;
	readonly route: FindingRoute | null;
	/** The piece of evidence whose source stands beside the card. */
	readonly piece: number;
	readonly onPiece: (piece: number) => void;
	/** Select the finding's subject on the picture, where the card offers it. */
	readonly onShow?: ((event: MouseEvent<HTMLButtonElement>) => void) | undefined;
}

/**
 * One finding as the site's warning card: a chip that names it, solid for a warning and tinted for
 * information, the route it is about, the check's own words and how sure each piece of its evidence
 * is. A card that offers it has a key that selects its subject on the picture.
 * @param props The finding and its route.
 * @returns The card.
 */
function FindingCard(props: FindingCardProps): JSX.Element {
	const { finding, route, onShow } = props;
	const warning = finding.severity === "warning";
	return (
		<article
			data-slot="code-finding"
			data-severity={finding.severity}
			data-finding-code={finding.code}
			className={cn(
				"bg-face rounded-control shadow-raised flex min-w-0 flex-col gap-2.5 p-3.5",
				warning ? "inset-ring-standing-changed/45 inset-ring" : "inset-ring-border inset-ring",
			)}
		>
			<FindingHead finding={finding} onShow={onShow} />
			{route !== null && <FindingRouteLine route={route} />}
			<p className="text-body text-body-foreground [overflow-wrap:anywhere]">{finding.message}</p>
			{finding.evidence !== undefined && (
				<EvidencePieces evidence={finding.evidence} piece={props.piece} onPiece={props.onPiece} />
			)}
		</article>
	);
}

/**
 * The head of a finding's card: the chip that names it, and the key that selects its subject where
 * the card offers one.
 * @param props The finding.
 * @param props.finding The finding.
 * @param props.onShow Select its subject, where the card offers it.
 * @returns The head.
 */
function FindingHead(props: {
	readonly finding: CodeFinding;
	readonly onShow: FindingCardProps["onShow"];
}): JSX.Element {
	const { finding, onShow } = props;
	const { subject } = finding;
	return (
		<div className="flex items-start justify-between gap-2">
			<Badge variant={finding.severity === "warning" ? "changed" : "changed-tint"} size="label">
				<span className="sr-only">{SEVERITY_WORDS[finding.severity]}: </span>
				{findingName(finding.code)}
			</Badge>
			{onShow !== undefined && subject !== undefined && (
				<Button
					variant="ghost"
					size="icon-xs"
					aria-label={`Show ${subject.name} on the picture`}
					title="Show on the picture"
					data-slot="code-finding-show"
					className="text-muted-foreground -my-1"
					onClick={onShow}
				>
					<RiFocus3Line />
				</Button>
			)}
		</div>
	);
}

/**
 * What a finding is about: from one module to the other, or the one module.
 * @param props The route.
 * @param props.route The route.
 * @returns The line.
 */
function FindingRouteLine(props: { readonly route: FindingRoute }): JSX.Element {
	const { route } = props;
	return (
		<p
			data-slot="code-finding-route"
			className="text-title text-foreground flex flex-wrap items-center gap-x-2 gap-y-1"
		>
			{route.from !== null && (
				<>
					<span>{route.from}</span>
					<RiArrowRightLine aria-hidden="true" className="text-muted-foreground size-3.5" />
					<span className="sr-only">to</span>
				</>
			)}
			<span>{route.to}</span>
		</p>
	);
}

/**
 * How sure each piece of a finding's evidence is, and where it is. With more than one piece, a piece
 * is a key that brings its source beside the card.
 * @param props The pieces and the one beside the card.
 * @param props.evidence The pieces.
 * @param props.piece The piece beside the card.
 * @param props.onPiece Bring another piece beside it.
 * @returns The list.
 */
function EvidencePieces(props: {
	readonly evidence: readonly CodeEvidence[];
	readonly piece: number;
	readonly onPiece: (piece: number) => void;
}): JSX.Element {
	const { evidence, piece, onPiece } = props;
	return (
		<ul data-slot="code-finding-evidence" className="flex flex-col gap-0.5">
			{evidence.map((one, index) => (
				<li key={`${one.path}:${one.line}:${one.symbol}`}>
					<EvidencePiece
						evidence={one}
						index={index}
						shown={index === piece}
						choosable={evidence.length > 1}
						onPiece={onPiece}
					/>
				</li>
			))}
		</ul>
	);
}

/**
 * One piece of evidence: how sure it is, and where it is.
 * @param props The piece and whether it can be chosen.
 * @param props.evidence The piece.
 * @param props.index Its place in the finding.
 * @param props.shown Whether its source stands beside the card.
 * @param props.choosable Whether the finding has others to choose from.
 * @param props.onPiece Bring it beside the card.
 * @returns The line.
 */
function EvidencePiece(props: {
	readonly evidence: CodeEvidence;
	readonly index: number;
	readonly shown: boolean;
	readonly choosable: boolean;
	readonly onPiece: (piece: number) => void;
}): JSX.Element {
	const { evidence, index, shown, choosable, onPiece } = props;
	const { words, Icon, ink } = STRENGTH[evidence.resolution];
	const choose = useCallback((): void => onPiece(index), [onPiece, index]);
	const line = (
		<>
			<Icon aria-hidden="true" className={cn("size-3.5 shrink-0", ink)} />
			<span data-resolution={evidence.resolution} className="shrink-0">
				{words}
			</span>
			{choosable && (
				<span
					className="text-technical ml-auto min-w-0 truncate font-mono"
					title={`${evidence.path}:${evidence.line}`}
				>
					{evidence.path.split("/").at(-1)}:{evidence.line}
				</span>
			)}
		</>
	);
	const layout =
		"text-body text-muted-foreground flex w-full items-center gap-1.5 rounded-control px-1 py-0.5";
	if (!choosable) return <p className={layout}>{line}</p>;
	return (
		<button
			type="button"
			aria-pressed={shown}
			onClick={choose}
			className={cn(
				layout,
				"hover:bg-face-hover focus-visible:ring-ring text-left outline-none focus-visible:ring-2",
				shown && "text-foreground bg-tray-sink",
			)}
		>
			{line}
		</button>
	);
}

export { FindingCard, FindingCounts, SEVERITY_WORDS, findingName };
