import {
	useCallback,
	useMemo,
	type CSSProperties,
	type JSX,
	type KeyboardEvent,
	type MouseEvent,
} from "react";
import { cn } from "@archboard/ui-kit/components";
import type { LocalityAnswer } from "@archboard/code-intel/history";
import { KindChip } from "#ui/architecture-drawing/canvas/presentation/components/KindMarks.tsx";
import { GROUP_START } from "#ui/architecture-drawing/model-reader/reading/components/ModelMeasureHead.tsx";
import {
	groupStarts,
	isCodeMeasure,
	isHistoryMeasure,
	measureOf,
	type Measure,
	type MeasureKey,
	type MeasureRow,
} from "#ui/architecture-drawing/model-reader/reading/rules/module-measures.ts";
import type { KindLook } from "#ui/architecture-drawing/canvas/picture/rules/kind-look.ts";

/** Why the lens did not read a module, as a row and the foot of the table say it. */
const NOT_READ: Readonly<Record<LocalityAnswer["skipped"][number]["reason"], string>> = {
	unbound: "no code binding",
	"drill-down": "another module holds its history",
	"repository-unregistered": "repository not registered here",
	"checkout-unavailable": "checkout could not be read",
	"ref-not-checked-out": "its ref is not checked out",
};

/** A count of none and a dash, at the floor of a mark in the dark theme: Lc 37 on the well. */
const QUIET_INK = "text-muted-foreground/80";

/** A row's cells, with a line of the rule between it and the row above. */
const CELL =
	"h-9 px-3 [tr+tr>&]:shadow-[inset_0_1px_0_color-mix(in_oklch,var(--border)_55%,transparent)]";

/**
 * The bar of a sorted count, as the site draws it: a gold wash from the right edge of its cell, as
 * long as the count is against the most in the table, and an edge of gold as strong.
 */
const SORTED_BAR =
	"bg-[linear-gradient(to_left,color-mix(in_oklch,var(--primary-mark)_16%,transparent)_calc(var(--share)*100%),transparent_0)] shadow-[inset_-2px_0_0_color-mix(in_oklch,var(--primary-mark)_calc(var(--share)*90%),transparent)]";

/** Inputs for one row of the table. */
interface ModelMeasureRowProps {
	readonly row: MeasureRow;
	/** The measures of the table, in the order of its columns. */
	readonly measures: readonly Measure[];
	/** What the table is sorted by. */
	readonly sorted: MeasureKey;
	/** The most of that measure in the table, which a bar is drawn against. */
	readonly most: number;
	readonly look: KindLook;
	/** Whether the module is the one selected on the picture. */
	readonly lit: boolean;
	/** Whether the row holds the table's one tab stop. */
	readonly stop: boolean;
	readonly onChoose: (row: MeasureRow, beside: boolean) => void;
	readonly onFocusRow: (id: string) => void;
	readonly onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
}

/**
 * One module of the table: its kind and name, then each count in its own column. The name is the
 * row's one button, and it covers the whole row, so a press anywhere on the row selects the module
 * on its picture, beside the reading with Alt. An empty cell is a module with no such measure, and
 * a dash is a module the lens did not read, so neither looks like a count of none.
 * @param props The row and what choosing it does.
 * @returns The row.
 */
function ModelMeasureRow(props: ModelMeasureRowProps): JSX.Element {
	const { row, measures, sorted, most, look, lit, stop, onChoose, onFocusRow, onKeyDown } = props;
	const choose = useCallback(
		(event: MouseEvent<HTMLButtonElement>): void => onChoose(row, event.altKey),
		[onChoose, row],
	);
	const focus = useCallback((): void => onFocusRow(row.id), [onFocusRow, row.id]);
	return (
		<tr
			data-measure-row={row.id}
			data-row-id={row.id}
			className={cn(
				"group/row relative transition-colors",
				lit ? "bg-face shadow-[inset_0_-2px_0_var(--primary)]" : "hover:bg-face/50",
			)}
		>
			<th scope="row" className={cn(CELL, "text-left font-normal")}>
				<span className="flex min-w-0 items-center gap-2.5">
					<KindChip kind={row.kind} look={look} />
					<button
						type="button"
						tabIndex={stop ? 0 : -1}
						aria-current={lit ? "true" : undefined}
						title={row.title}
						onClick={choose}
						onFocus={focus}
						onKeyDown={onKeyDown}
						className="text-control focus-visible:after:ring-ring after:rounded-control min-w-0 truncate text-left outline-none after:absolute after:inset-0 after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-inset"
					>
						{row.name}
					</button>
				</span>
			</th>
			{measures.map((one) => (
				<Cell
					key={one.key}
					row={row}
					measure={one.key}
					starts={groupStarts(measures, one)}
					sorted={one.key === sorted}
					most={most}
				/>
			))}
		</tr>
	);
}

/**
 * One count of a row, or the cell that stands where a module has none.
 * @param props The row, the measure, whether the table is sorted by it and the most of it.
 * @param props.row The row.
 * @param props.measure The measure.
 * @param props.sorted Whether the table is sorted by it.
 * @param props.most The most of the measure in the table.
 * @returns The cell.
 */
function Cell(props: CellProps): JSX.Element {
	const count = measureOf(props.row, props.measure);
	if (count === undefined) return <EmptyCell {...props} />;
	if (props.measure === "codeFindings" && count === 0) return <ClearCell {...props} />;
	return <CountCell {...props} count={count} />;
}

/** Inputs for one cell of a row. */
interface CellProps {
	readonly row: MeasureRow;
	readonly measure: MeasureKey;
	/** Whether it starts a group of columns after another, so a rule stands before it. */
	readonly starts: boolean;
	readonly sorted: boolean;
	readonly most: number;
}

/** The kinds of export that the count of exports adds up, as a row says them. */
const EXPORT_KINDS = [
	["functions", "functions"],
	["classes", "classes"],
	["methods", "public methods"],
	["values", "values"],
	["types", "types"],
] as const;

/**
 * What a cell says beyond its count: the kinds behind a count of exports, and what a code pass
 * did not read of a module it read in part.
 * @param row The row.
 * @param measure The measure.
 * @returns The words, or nothing.
 */
function cellNote(row: MeasureRow, measure: MeasureKey): string | undefined {
	const { code } = row;
	if (code?.kind !== "read") return undefined;
	const partial = partialWords(code);
	if (measure === "codeExports") return [exportKinds(code), partial].join(" ").trim();
	return measure === "codeFindings" ? partial : undefined;
}

/** What the code pass says of a module it read. */
type ReadCode = Extract<NonNullable<MeasureRow["code"]>, { kind: "read" }>;

/**
 * A module's exports, kind by kind.
 * @param code What the pass says of it.
 * @returns The words.
 */
function exportKinds(code: ReadCode): string {
	return `${EXPORT_KINDS.map(([key, words]) => `${code.exports[key]} ${words}`).join(", ")}.`;
}

/**
 * What the pass did not read of a module.
 * @param code What the pass says of it.
 * @returns The words, or nothing for a whole read.
 */
function partialWords(code: ReadCode): string | undefined {
	return code.partial.length === 0 ? undefined : `Read in part: ${code.partial.join("; ")}.`;
}

/**
 * Whether the code pass read a module only in part.
 * @param row The row.
 * @returns True when it did.
 */
function partOnly(row: MeasureRow): boolean {
	return row.code?.kind === "read" && row.code.partial.length > 0;
}

/**
 * The rule before a cell that starts a group of columns.
 * @param starts Whether the cell starts one.
 * @returns The rule, or nothing.
 */
function edge(starts: boolean): string | undefined {
	return starts ? GROUP_START : undefined;
}

/**
 * Words that a cell says to assistive technology beyond what it shows.
 * @param props The words.
 * @param props.note The words, or nothing.
 * @returns The words, or nothing.
 */
function CellNote(props: { readonly note: string | undefined }): JSX.Element | null {
	if (props.note === undefined) return null;
	return <span className="sr-only">. {props.note}</span>;
}

/** What the findings cell of a module with none says: clean after a whole read, else partial. */
const CLEAR = { clean: "Clean", partial: "Partial" } as const;

/**
 * The findings cell of a module the code pass found nothing on: clean after a whole read, and
 * partial after a read in part, which never passes for clean.
 * @param props The row.
 * @returns The cell.
 */
function ClearCell(props: CellProps): JSX.Element {
	const { row, sorted, starts } = props;
	const kind = partOnly(row) ? "partial" : "clean";
	const note = cellNote(row, "codeFindings");
	return (
		<td
			data-measure="codeFindings"
			data-count={0}
			data-code={kind}
			data-sorted={sorted ? "" : undefined}
			title={note ?? "No finding on the module itself."}
			className={cn(CELL, "text-body text-right", QUIET_INK, edge(starts))}
		>
			{CLEAR[kind]}
			<CellNote note={note} />
		</td>
	);
}

/** The ink of a count: quieter for none, full for the sorted column, and prose ink for the rest. */
const COUNT_INK = { none: QUIET_INK, sorted: "text-foreground", other: "text-body-foreground" };

/**
 * The ink of a count.
 * @param count The count.
 * @param sorted Whether the table is sorted by it.
 * @returns The ink.
 */
function inkOf(count: number, sorted: boolean): string {
	if (count === 0) return COUNT_INK.none;
	return sorted ? COUNT_INK.sorted : COUNT_INK.other;
}

/**
 * How long the bar of a sorted count is, against the most in the table.
 * @param sorted Whether the table is sorted by it.
 * @param count The count.
 * @param most The most of the measure in the table.
 * @returns The length, or nothing for a count with no bar.
 */
function shareOf(sorted: boolean, count: number, most: number): CSSProperties | undefined {
	if (!sorted) return undefined;
	return { "--share": most === 0 ? 0 : count / most };
}

/**
 * A count. The sorted count stands on its bar, as long as it is against the most in the table.
 * @param props The row, the measure, its count, whether the table is sorted by it and the most of it.
 * @returns The cell.
 */
function CountCell(props: CellProps & { readonly count: number }): JSX.Element {
	const { row, measure, count, sorted, most, starts } = props;
	const note = cellNote(row, measure);
	const share = useMemo(() => shareOf(sorted, count, most), [sorted, count, most]);
	return (
		<td
			data-measure={measure}
			data-count={count}
			data-sorted={sorted ? "" : undefined}
			data-partial={partOnly(row) ? "" : undefined}
			style={share}
			title={note}
			className={cn(
				CELL,
				"text-technical text-right font-mono tabular-nums",
				sorted && SORTED_BAR,
				inkOf(count, sorted),
				edge(starts),
			)}
		>
			{count}
			<CellNote note={note} />
		</td>
	);
}

/**
 * A cell with no count: a dash for what the lens skipped, which says why to a reader who points at
 * it, and nothing for what the module does not have.
 * @param props The row and the measure.
 * @param props.row The row.
 * @param props.measure The measure.
 * @returns The cell.
 */
function EmptyCell(props: CellProps): JSX.Element {
	const { measure, starts } = props;
	const skipped = skippedOf(props.row, measure);
	if (skipped === undefined)
		return (
			<td className={cn(CELL, edge(starts))}>
				<span className="sr-only">No count</span>
			</td>
		);
	return (
		<td
			data-not-read={skipped.reason}
			title={skipped.words}
			className={cn(CELL, "text-technical text-right font-mono", QUIET_INK, edge(starts))}
		>
			<span aria-hidden="true">–</span>
			<span className="sr-only">{skipped.words}</span>
		</td>
	);
}

/**
 * Why a read skipped a module, for a measure that the read counts.
 * @param row The row.
 * @param measure The measure.
 * @returns The reason and its words, or nothing where the module has no such measure.
 */
function skippedOf(
	row: MeasureRow,
	measure: MeasureKey,
): { readonly reason: string; readonly words: string } | undefined {
	if (isCodeMeasure(measure)) return codeSkipped(row.code);
	const { history } = row;
	if (!isHistoryMeasure(measure) || history?.kind !== "skipped") return undefined;
	return { reason: history.reason, words: `Not read: ${NOT_READ[history.reason]}` };
}

/**
 * Why the code pass did not judge a module.
 * @param code What the pass says of it.
 * @returns The reason and its words, or nothing where the pass judged it or names it not.
 */
function codeSkipped(
	code: MeasureRow["code"],
): { readonly reason: string; readonly words: string } | undefined {
	if (code?.kind !== "skipped") return undefined;
	return { reason: code.reason, words: `Not judged: ${code.words}` };
}

export { ModelMeasureRow, NOT_READ };
