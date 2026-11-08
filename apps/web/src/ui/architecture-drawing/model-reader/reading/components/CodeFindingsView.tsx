import { RiAlertLine, RiInformationLine } from "@remixicon/react";
import {
	useCallback,
	useMemo,
	useState,
	type JSX,
	type KeyboardEvent,
	type MouseEvent,
} from "react";
import { cn } from "@archboard/ui-kit/components";
import {
	FindingCard,
	FindingCounts,
	SEVERITY_WORDS,
	findingName,
} from "#ui/architecture-drawing/model-reader/reading/components/CodeFindingCard.tsx";
import { ModelCodeSource } from "#ui/architecture-drawing/model-reader/reading/components/ModelCodeSource.tsx";
import { ModelSwitch } from "#ui/architecture-drawing/model-reader/reading/components/ModelSwitch.tsx";
import {
	CODE_FINDINGS_LAYOUTS,
	chooseCodeFindingsLayout,
} from "#ui/architecture-drawing/model-reader/reading/clients/code-findings-layout.ts";
import { useCodeFindingsLayout } from "#ui/architecture-drawing/model-reader/reading/hooks/use-code-findings-layout.ts";
import { useNearScroll } from "#ui/architecture-drawing/model-reader/reading/hooks/use-near-scroll.ts";
import type { ModelCodeReading } from "#ui/architecture-drawing/model-reader/reading/hooks/use-model-code-findings.ts";
import {
	routeOf,
	warningsFirst,
	type FindingEnds,
	type FindingRoute,
} from "#ui/architecture-drawing/model-reader/reading/rules/finding-route.ts";
import {
	CheckedAt,
	type CodeFinding,
} from "#ui/architecture-drawing/canvas/presentation/components/SemanticInspectorCode.tsx";

/** Inputs for the findings of one pass. */
interface CodeFindingsViewProps {
	readonly vault: string;
	/** The pass that read the reading on screen. */
	readonly reading: ModelCodeReading;
	readonly ends: FindingEnds;
	/** Select a finding's subject on the picture, or let go of the selection for a model finding. */
	readonly onShow: (id: string | null) => void;
}

/** What each layout reads: the findings, warnings first, under keys of their own. */
interface LaidOutProps extends CodeFindingsViewProps {
	readonly findings: readonly KeyedFinding[];
}

/** A finding, and the key that names it among the pass's findings. */
interface KeyedFinding {
	readonly key: string;
	readonly finding: CodeFinding;
}

/**
 * Where the map and the code disagree: one pass's findings, warnings first, under their counts, in
 * the layout this browser remembers. Cards puts each finding beside its own source, one under
 * another; List puts a row for each beside the card and the source of the one chosen.
 * @param props The pass, the reading's names and what choosing a finding selects.
 * @returns The findings.
 */
function CodeFindingsView(props: CodeFindingsViewProps): JSX.Element {
	const { reading } = props;
	const findings = useMemo(() => keyed(warningsFirst(reading.findings)), [reading.findings]);
	const layout = useCodeFindingsLayout();
	return (
		<section
			data-slot="code-evidence"
			data-layout={layout}
			aria-label="Code findings"
			className="flex min-h-0 flex-1 flex-col gap-3"
		>
			<div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
				<div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
					<FindingCounts findings={reading.findings} />
					<CheckedAt checkedAt={reading.checkedAt} />
				</div>
				<ModelSwitch
					label="Lay out the findings"
					slot="code-findings-layout"
					choices={CODE_FINDINGS_LAYOUTS}
					value={layout}
					onChange={chooseCodeFindingsLayout}
				/>
			</div>
			{layout === "cards" ? (
				<FindingCards {...props} findings={findings} />
			) : (
				<FindingList {...props} findings={findings} />
			)}
		</section>
	);
}

/**
 * Each finding under a key of its own: what it is, what it is about and where, and a count for a
 * finding that repeats another.
 * @param findings The findings.
 * @returns The findings with their keys, in the same order.
 */
function keyed(findings: readonly CodeFinding[]): KeyedFinding[] {
	const seen = new Map<string, number>();
	return findings.map((finding) => {
		const base = findingKey(finding);
		const repeats = seen.get(base) ?? 0;
		seen.set(base, repeats + 1);
		return { key: repeats === 0 ? base : `${base}#${repeats}`, finding };
	});
}

/**
 * What a finding is, what it is about and where.
 * @param finding The finding.
 * @returns The words that name it.
 */
function findingKey(finding: CodeFinding): string {
	const first = finding.evidence?.[0];
	const where = first === undefined ? "" : `${first.path}:${first.line}`;
	return `${finding.code}:${finding.subject?.id ?? ""}:${where}`;
}

/**
 * Every finding beside its own source, one under another, in a column that scrolls. A finding's
 * source is read once it comes near the screen, so a pass of many findings costs only what is seen.
 * @param props The findings and what choosing one selects.
 * @returns The column.
 */
function FindingCards(props: LaidOutProps): JSX.Element {
	return (
		<ol
			data-slot="code-finding-cards"
			data-scroll-root=""
			className="-mx-1 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-1 pb-1"
		>
			{props.findings.map(({ key, finding }) => (
				<li key={key}>
					<FindingWithCode
						vault={props.vault}
						finding={finding}
						route={routeOf(finding, props.ends)}
						checkedAt={props.reading.checkedAt}
						onShow={props.onShow}
					/>
				</li>
			))}
		</ol>
	);
}

/**
 * One finding's card, and the source its evidence rests on beside it.
 * @param props The finding and where its source is.
 * @param props.vault The vault of the reading.
 * @param props.finding The finding.
 * @param props.route What it is about.
 * @param props.checkedAt When the pass ran.
 * @param props.onShow Select the finding's subject on the picture.
 * @returns The card and its source.
 */
function FindingWithCode(props: {
	readonly vault: string;
	readonly finding: CodeFinding;
	readonly route: FindingRoute | null;
	readonly checkedAt: string;
	readonly onShow: (id: string | null) => void;
}): JSX.Element {
	const { finding, onShow } = props;
	const [piece, setPiece] = useState(0);
	const { ref, near } = useNearScroll();
	const id = finding.subject?.id ?? null;
	const show = useCallback(
		(event: MouseEvent<HTMLButtonElement>): void => {
			const key = event.currentTarget;
			onShow(id);
			// A subject on another picture opens it, which takes the keys there, so the key keeps them.
			key.focus();
		},
		[onShow, id],
	);
	return (
		<div ref={ref} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-1.5">
			<FindingCard
				finding={finding}
				route={props.route}
				piece={piece}
				onPiece={setPiece}
				onShow={show}
			/>
			<ModelCodeSource
				vault={props.vault}
				evidence={finding.evidence?.[piece]}
				checkedAt={props.checkedAt}
				reading={near}
			/>
		</div>
	);
}

/**
 * A row for each finding, and beside them the card and the source of the one chosen. The arrow
 * keys, Home and End walk the rows, and choosing a row selects its finding's subject on the picture.
 * @param props The findings and what choosing one selects.
 * @returns The rows and the finding chosen.
 */
function FindingList(props: LaidOutProps): JSX.Element {
	const { findings, ends, onShow } = props;
	const [position, setPosition] = useState(0);
	const [piece, setPiece] = useState(0);
	const choose = useCallback(
		(index: number, row: HTMLElement): void => {
			setPosition(index);
			setPiece(0);
			onShow(findings[index]?.finding.subject?.id ?? null);
			// A subject on another picture opens it, which takes the keys there, so the row keeps them.
			row.focus();
		},
		[findings, onShow],
	);
	const walk = useCallback(
		(event: KeyboardEvent<HTMLButtonElement>): void => {
			const next = stepTo(event.key, position, findings.length);
			const rows = event.currentTarget
				.closest("ol")
				?.querySelectorAll<HTMLButtonElement>("[data-slot='code-finding-row']");
			const row = next === null ? undefined : rows?.[next];
			if (next === null || row === undefined) return;
			event.preventDefault();
			choose(next, row);
		},
		[position, findings.length, choose],
	);
	const chosen = findings[position]!.finding;
	return (
		<div
			data-slot="code-finding-list"
			className="grid min-h-0 flex-1 grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-1.5"
		>
			<ol
				aria-label="Findings"
				data-scroll-root=""
				className="plate flex min-h-0 flex-col gap-0.5 overflow-y-auto p-1.5"
			>
				{findings.map(({ key, finding }, index) => (
					<li key={key}>
						<FindingRow
							finding={finding}
							route={routeOf(finding, ends)}
							index={index}
							chosen={index === position}
							onChoose={choose}
							onKeyDown={walk}
						/>
					</li>
				))}
			</ol>
			<div className="flex min-h-0 flex-col gap-1.5 overflow-y-auto">
				<FindingCard
					finding={chosen}
					route={routeOf(chosen, ends)}
					piece={piece}
					onPiece={setPiece}
				/>
				<ModelCodeSource
					vault={props.vault}
					evidence={chosen.evidence?.[piece]}
					checkedAt={props.reading.checkedAt}
				/>
			</div>
		</div>
	);
}

/**
 * The row a key walks to.
 * @param key The key pressed.
 * @param position The row chosen now.
 * @param count How many rows there are.
 * @returns The row, or null for a key that walks nowhere.
 */
function stepTo(key: string, position: number, count: number): number | null {
	if (key === "ArrowDown") return Math.min(count - 1, position + 1);
	if (key === "ArrowUp") return Math.max(0, position - 1);
	if (key === "Home") return 0;
	if (key === "End") return count - 1;
	return null;
}

/**
 * One finding as a row: its mark and name, what it is about, and the first line of its words. The
 * row chosen is raised out of the list and is the one the Tab key reaches.
 * @param props The finding, its place and whether it is chosen.
 * @param props.finding The finding.
 * @param props.route What it is about.
 * @param props.index Its place in the list.
 * @param props.chosen Whether it is the finding beside the list.
 * @param props.onChoose Choose it.
 * @param props.onKeyDown Walk the rows.
 * @returns The row.
 */
function FindingRow(props: {
	readonly finding: CodeFinding;
	readonly route: FindingRoute | null;
	readonly index: number;
	readonly chosen: boolean;
	readonly onChoose: (index: number, row: HTMLElement) => void;
	readonly onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
}): JSX.Element {
	const { finding, index, chosen, onChoose } = props;
	const choose = useCallback(
		(event: MouseEvent<HTMLButtonElement>): void => onChoose(index, event.currentTarget),
		[onChoose, index],
	);
	return (
		<button
			type="button"
			data-slot="code-finding-row"
			data-finding-code={finding.code}
			aria-current={chosen ? true : undefined}
			tabIndex={chosen ? 0 : -1}
			onClick={choose}
			onKeyDown={props.onKeyDown}
			className={cn(
				"rounded-control focus-visible:ring-ring flex w-full flex-col gap-0.5 px-2.5 py-2 text-left outline-none focus-visible:ring-2",
				chosen ? "bg-face shadow-raised" : "hover:bg-face-hover",
			)}
		>
			<FindingRowHead finding={finding} route={props.route} />
			<span className="text-body text-body-foreground truncate">{finding.message}</span>
		</button>
	);
}

/**
 * The first line of a finding's row: the mark of its severity, its name and what it is about.
 * @param props The finding and its route.
 * @param props.finding The finding.
 * @param props.route What it is about.
 * @returns The line.
 */
function FindingRowHead(props: {
	readonly finding: CodeFinding;
	readonly route: FindingRoute | null;
}): JSX.Element {
	const { finding, route } = props;
	const warning = finding.severity === "warning";
	const Mark = warning ? RiAlertLine : RiInformationLine;
	return (
		<span className="flex min-w-0 items-center gap-2">
			<Mark
				aria-hidden="true"
				className={cn("size-3.5 shrink-0", warning ? "text-standing-changed" : "text-muted-foreground")}
			/>
			<span className="sr-only">{SEVERITY_WORDS[finding.severity]}: </span>
			<span className="text-control text-foreground shrink-0 font-medium">
				{findingName(finding.code)}
			</span>
			{route !== null && (
				<span className="text-body text-muted-foreground ml-auto min-w-0 truncate">
					{route.from === null ? route.to : `${route.from} → ${route.to}`}
				</span>
			)}
		</span>
	);
}

export { CodeFindingsView };
