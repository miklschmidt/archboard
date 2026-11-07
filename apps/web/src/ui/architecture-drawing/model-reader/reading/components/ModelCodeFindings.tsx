import {
	RiAlertLine,
	RiArrowLeftSLine,
	RiArrowRightLine,
	RiArrowRightSLine,
	RiCheckLine,
	RiQuestionLine,
} from "@remixicon/react";
import { useCallback, useMemo, useState, type JSX, type MouseEvent, type ReactNode } from "react";
import { Badge, Button, cn } from "@archboard/ui-kit/components";
import { ModelCodeSource } from "#ui/architecture-drawing/model-reader/reading/components/ModelCodeSource.tsx";
import type { ModelCodeReading } from "#ui/architecture-drawing/model-reader/reading/hooks/use-model-code-findings.ts";
import { WarningCount } from "#ui/architecture-drawing/canvas/presentation/components/CodeWarnings.tsx";
import {
	CheckedAt,
	CodeBlock,
	type CodeEvidence,
	type CodeFinding,
} from "#ui/architecture-drawing/canvas/presentation/components/SemanticInspectorCode.tsx";

/**
 * Keep the existing warning control available for canonical readings.
 * @param props The exact checked reading and temporary selection action.
 * @param props.reading The matching pass, or absence after an architecture change.
 * @param props.onSelect Pick the finding's subject without changing architecture.
 * @returns A count that cycles through the matching pass's warnings.
 */
function ModelCodeWarnings(props: {
	reading: ModelCodeReading | null;
	onSelect: (id: string | null) => void;
}): JSX.Element | null {
	if (props.reading === null) return null;
	return (
		<WarningSelection
			key={`${props.reading.revision.digest}:${props.reading.checkedAt}`}
			reading={props.reading}
			onSelect={props.onSelect}
		/>
	);
}

/**
 * Each completed pass starts its own warning cycle.
 * @param props The exact pass and the module selection action.
 * @param props.reading The matching findings.
 * @param props.onSelect Select a warned subject, or clear selection for a model finding.
 * @returns The existing accessible warning count.
 */
function WarningSelection(props: {
	reading: ModelCodeReading;
	onSelect: (id: string | null) => void;
}): JSX.Element {
	const warnings = props.reading.findings.filter((finding) => finding.severity === "warning");
	const [position, setPosition] = useState(-1);
	const { onSelect } = props;
	const next = useCallback(() => {
		const index = (position + 1) % warnings.length;
		setPosition(index);
		onSelect(warnings[index]?.subject?.id ?? null);
	}, [position, warnings, onSelect]);
	return (
		<WarningCount
			count={warnings.length}
			message={warnings[position]?.message}
			position={position}
			onNext={next}
		/>
	);
}

/**
 * Explain selected identities with the existing source evidence panel.
 * @param props The matching pass and inspected subjects.
 * @param props.reading The exact checked architecture, or absence.
 * @param props.selected Temporary selected identities.
 * @param props.scope The open module when nothing is selected.
 * @returns Findings for the selected subjects, scope, or model itself.
 */
function ModelCodeDetails(props: {
	reading: ModelCodeReading | null;
	selected: ReadonlySet<string>;
	scope: string | null;
}): JSX.Element | null {
	const { reading, selected, scope } = props;
	const code = useMemo(() => {
		if (reading === null) return null;
		const ids = selected.size > 0 ? selected : new Set(scope === null ? [] : [scope]);
		const findings = reading.findings.filter((finding) =>
			finding.subject === undefined ? ids.size === 0 : ids.has(finding.subject.id),
		);
		return findings.length === 0 ? null : { findings, checkedAt: reading.checkedAt };
	}, [reading, selected, scope]);
	return <CodeBlock code={code} />;
}

/** The modules and relationships of the whole reading, which a finding's route is named from. */
interface FindingEnds {
	readonly nodes: readonly { readonly id: string; readonly name: string }[];
	readonly edges: readonly { readonly id: string; readonly from: string; readonly to: string }[];
}

/** Inputs for the findings, one at a time. */
interface ModelCodeEvidenceProps {
	readonly vault: string;
	/** The pass that read the reading on screen, or null when none did. */
	readonly reading: ModelCodeReading | null;
	readonly ends: FindingEnds;
	/** Select a finding's subject on the picture, or let go of the selection for a model finding. */
	readonly onShow: (id: string | null) => void;
}

/**
 * Where the map and the code disagree: the findings of the pass that read the reading on screen,
 * one at a time, warnings first, beside the source line each rests on. The pager walks them, and
 * each step selects the finding's subject on the picture (ADR 0046).
 * @param props The pass and what a step selects.
 * @returns The findings, or what stands in their place.
 */
function ModelCodeEvidence(props: ModelCodeEvidenceProps): JSX.Element {
	const { reading } = props;
	if (reading === null)
		return (
			<Quiet slot="code-evidence-none">
				<p>
					No code check has read this reading.{" "}
					<code className="text-technical">archboard check code</code> reads it.
				</p>
			</Quiet>
		);
	if (reading.findings.length === 0)
		return (
			<Quiet slot="code-evidence-clear">
				<p>The last code check found nothing here.</p>
				<CheckedAt checkedAt={reading.checkedAt} />
			</Quiet>
		);
	return (
		<FindingPager
			key={`${reading.revision.digest}:${reading.checkedAt}`}
			{...props}
			reading={reading}
		/>
	);
}

/**
 * The words that stand where no finding does.
 * @param props What they say.
 * @param props.slot What names them.
 * @param props.children The words.
 * @returns The words, on the floor of the panel.
 */
function Quiet(props: { readonly slot: string; readonly children: ReactNode }): JSX.Element {
	return (
		<div
			data-slot={props.slot}
			className="text-body text-muted-foreground bg-tray-sink shadow-well rounded-panel flex flex-col gap-1 p-4 [&_code]:font-mono"
		>
			{props.children}
		</div>
	);
}

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

/** Where a finding leads: from the modules that make a use to the ones it reaches. */
interface FindingRoute {
	readonly from: string | null;
	readonly to: string;
}

/**
 * The names of the modules on one side of a finding's evidence, each once.
 * @param finding The finding.
 * @param side Which side: the modules that make a use, or those it reaches.
 * @param ends The modules of the reading.
 * @returns The names, or nothing when the evidence names no module on that side.
 */
function sideOf(finding: CodeFinding, side: "from" | "to", ends: FindingEnds): string {
	const ids = (finding.evidence ?? []).flatMap((piece) => piece[side] ?? []);
	return [...new Set(ids.map((id) => nameIn(ends, id)))].join(", ");
}

/**
 * What the reading calls a module.
 * @param ends The modules of the reading.
 * @param id The module.
 * @returns Its name, or its identity when the reading does not hold it.
 */
function nameIn(ends: FindingEnds, id: string): string {
	return ends.nodes.find((node) => node.id === id)?.name ?? id;
}

/**
 * The ends of the relationship a finding is about, by name.
 * @param finding The finding.
 * @param ends The modules and relationships of the reading.
 * @returns The two names, or empty names for a finding about anything else.
 */
function edgeOf(finding: CodeFinding, ends: FindingEnds): { from: string; to: string } {
	const { subject } = finding;
	const edge =
		subject?.kind === "edge" ? ends.edges.find((one) => one.id === subject.id) : undefined;
	if (edge === undefined) return { from: "", to: "" };
	return { from: nameIn(ends, edge.from), to: nameIn(ends, edge.to) };
}

/**
 * The route of a finding: the modules its evidence joins, the ends of the relationship it is about,
 * or the one subject it names. A route with one end, or with the same module at both, names it once.
 * @param finding The finding.
 * @param ends The modules and relationships of the reading.
 * @returns The route, or null for a finding on the whole model.
 */
function routeOf(finding: CodeFinding, ends: FindingEnds): FindingRoute | null {
	const edge = edgeOf(finding, ends);
	const from = firstOf(sideOf(finding, "from", ends), edge.from);
	const to = firstOf(sideOf(finding, "to", ends), edge.to, finding.subject?.name ?? "");
	return routeBetween(from, to);
}

/**
 * The first name that says something.
 * @param names The names, the best first.
 * @returns The first that is not empty, or an empty name.
 */
function firstOf(...names: readonly string[]): string {
	return names.find((name) => name !== "") ?? "";
}

/**
 * A route between two names, either of which can be missing.
 * @param from What makes the use, or an empty name.
 * @param to What it reaches, or an empty name.
 * @returns The route, which names a lone end or one module at both ends once, or null for none.
 */
function routeBetween(from: string, to: string): FindingRoute | null {
	const end = to || from;
	if (end === "") return null;
	return { from: from === "" || from === end ? null : from, to: end };
}

/**
 * One pass's findings, one at a time: the pager and the card in one plate, and beside them the
 * source line that the card's evidence rests on.
 * @param props The pass and what a step selects.
 * @returns The card and its source.
 */
function FindingPager(
	props: ModelCodeEvidenceProps & { readonly reading: ModelCodeReading },
): JSX.Element {
	const { vault, reading, ends, onShow } = props;
	const findings = useMemo(
		() =>
			reading.findings.toSorted(
				(one, other) => Number(one.severity !== "warning") - Number(other.severity !== "warning"),
			),
		[reading.findings],
	);
	const [position, setPosition] = useState(0);
	const [piece, setPiece] = useState(0);
	const step = useCallback(
		(event: MouseEvent<HTMLButtonElement>, by: number): void => {
			const key = event.currentTarget;
			const next = (position + by + findings.length) % findings.length;
			setPosition(next);
			setPiece(0);
			onShow(findings[next]?.subject?.id ?? null);
			// A subject on another picture opens it, which takes the keys there, so the key keeps them.
			key.focus();
		},
		[position, findings, onShow],
	);
	const back = useCallback((event: MouseEvent<HTMLButtonElement>) => step(event, -1), [step]);
	const on = useCallback((event: MouseEvent<HTMLButtonElement>) => step(event, 1), [step]);
	const finding = findings[position]!;
	const evidence = finding.evidence?.[piece];
	return (
		<section
			data-slot="code-evidence"
			aria-label="Code findings"
			className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-1.5"
		>
			<div className="plate flex flex-col gap-3.5 p-4">
				<div className="flex items-center justify-between gap-3">
					<FindingCounts findings={findings} />
					<div className="text-muted-foreground flex items-center gap-1.5">
						<Button
							variant="outline"
							size="icon-xs"
							aria-label="Previous finding"
							title="Previous finding"
							data-slot="code-evidence-back"
							onClick={back}
						>
							<RiArrowLeftSLine />
						</Button>
						<output
							data-slot="code-evidence-position"
							aria-live="polite"
							className="text-technical font-mono tabular-nums"
						>
							{position + 1} of {findings.length}
						</output>
						<Button
							variant="outline"
							size="icon-xs"
							aria-label="Next finding"
							title="Next finding"
							data-slot="code-evidence-next"
							onClick={on}
						>
							<RiArrowRightSLine />
						</Button>
					</div>
				</div>
				<FindingCard
					finding={finding}
					route={routeOf(finding, ends)}
					piece={piece}
					onPiece={setPiece}
					checkedAt={reading.checkedAt}
				/>
			</div>
			<ModelCodeSource vault={vault} evidence={evidence} checkedAt={reading.checkedAt} />
		</section>
	);
}

/**
 * How many findings the pass has, of each severity.
 * @param props The findings.
 * @param props.findings The findings.
 * @returns The count.
 */
function FindingCounts(props: { readonly findings: readonly CodeFinding[] }): JSX.Element {
	const warnings = props.findings.filter((finding) => finding.severity === "warning").length;
	const information = props.findings.length - warnings;
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
	readonly checkedAt: string;
}

/**
 * One finding as the site's warning card: a chip that names it, solid for a warning and tinted for
 * information, the route it is about, the check's own words, how sure each piece of its evidence is,
 * and when the pass ran.
 * @param props The finding and its route.
 * @returns The card.
 */
function FindingCard(props: FindingCardProps): JSX.Element {
	const { finding, route } = props;
	const warning = finding.severity === "warning";
	return (
		<article
			data-slot="code-finding"
			data-severity={finding.severity}
			data-finding-code={finding.code}
			className={cn(
				"bg-face rounded-control shadow-raised flex flex-col gap-2.5 p-3.5",
				warning ? "inset-ring-standing-changed/45 inset-ring" : "inset-ring-border inset-ring",
			)}
		>
			<Badge variant={warning ? "changed" : "changed-tint"} size="label">
				<span className="sr-only">{SEVERITY_WORDS[finding.severity]}: </span>
				{findingName(finding.code)}
			</Badge>
			{route !== null && (
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
			)}
			<p className="text-body text-body-foreground [overflow-wrap:anywhere]">{finding.message}</p>
			{finding.evidence !== undefined && (
				<EvidencePieces evidence={finding.evidence} piece={props.piece} onPiece={props.onPiece} />
			)}
			<CheckedAt checkedAt={props.checkedAt} />
		</article>
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

export { ModelCodeDetails, ModelCodeEvidence, ModelCodeWarnings };
