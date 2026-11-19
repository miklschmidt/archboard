// The lines of an open file (TASK-648): plain at once, in their language's colours once those are
// worked out, with each name that the model binds or anchors as a button. A long line wraps within
// the column. Its numbers start 16px in, under the head's words, and its text stops 8px before the
// picture, as the navigator keeps 8px to its edge. Lines stand
// in chunks that the browser lays out only near the screen, so a long file costs what is on screen.
// A chunk off screen is held at one row a line until it is laid out once, and keeps its height after.

import { memo, useEffect, useMemo, useRef, type CSSProperties, type JSX } from "react";
import type { CodeToken } from "#ui/architecture-drawing/code-highlighting/clients/code-highlighter.ts";
import type {
	BoundSpan,
	FileMarks,
	NameMark,
} from "#ui/architecture-drawing/code-browser/rules/symbol-marks.ts";
import {
	lineSegments,
	type Piece,
} from "#ui/architecture-drawing/code-browser/rules/line-segments.ts";
import { cn } from "@archboard/ui-kit/components";
import { useSubjectKey } from "#ui/architecture-drawing/code-browser/hooks/use-subject-key.ts";

/** How many lines stand in one chunk. */
const CHUNK = 64;

/** The height of one row, in pixels, so a chunk not yet laid out holds about its place. */
const LINE_HEIGHT = 20;

/** What a name does when it is pressed or pointed at. */
interface NameActions {
	/** Show the subject in the picture and select it. */
	readonly onShow: (subject: string) => void;
	/** Light a subject in the picture while the pointer or the keys rest on its name, or null. */
	readonly onPoint: (subject: string | null) => void;
	/** The name of a subject, for what its button says. */
	readonly nameOf: (subject: string) => string;
}

/** Inputs for the lines. */
interface CodeLinesProps extends NameActions {
	readonly lines: readonly string[];
	/** Each line's colours, once they are worked out. */
	readonly tokens: readonly (readonly CodeToken[])[] | null;
	readonly marks: FileMarks;
	readonly selected: ReadonlySet<string>;
	/** A line to bring into view, such as the definition of the one module picked. */
	readonly reveal: number | null;
}

/**
 * The lines of a file.
 * @param props The lines, their colours and marks, and what the selection is.
 * @returns The lines, in a scroll of their own.
 */
function CodeLines(props: CodeLinesProps): JSX.Element {
	const { lines, tokens, marks, selected, reveal } = props;
	const scroll = useRef<HTMLDivElement | null>(null);
	useEffect(() => {
		if (reveal === null) return;
		scroll.current
			?.querySelector(`[data-line="${reveal}"]`)
			?.scrollIntoView({ block: "center", behavior: "instant" });
	}, [reveal]);
	const chunks = useMemo(
		() => Array.from({ length: Math.ceil(lines.length / CHUNK) }, (_, index) => index * CHUNK),
		[lines.length],
	);
	const digits = String(lines.length).length;
	const style = useMemo(
		(): CSSProperties => ({ "--gutter": `${digits}ch`, lineHeight: `${LINE_HEIGHT}px` }),
		[digits],
	);
	return (
		<div
			ref={scroll}
			data-slot="code-lines"
			className="text-technical min-h-0 flex-1 overflow-x-hidden overflow-y-auto py-2 pr-2 pl-4 font-mono"
			style={style}
		>
			<code className="block" data-highlighted={tokens === null ? undefined : ""}>
				{chunks.map((first) => (
					<CodeChunk
						key={first}
						first={first}
						lines={lines.slice(first, first + CHUNK)}
						tokens={tokens?.slice(first, first + CHUNK) ?? null}
						marks={marks}
						lit={litIn(marks, first, selected)}
						onShow={props.onShow}
						onPoint={props.onPoint}
						nameOf={props.nameOf}
					/>
				))}
			</code>
		</div>
	);
}

/**
 * The selected subjects that a chunk marks, as one key, so a chunk draws again only when its own
 * marks change.
 * @param marks The file's marks.
 * @param first The index of the chunk's first line.
 * @param selected The selection.
 * @returns The key.
 */
function litIn(marks: FileMarks, first: number, selected: ReadonlySet<string>): string {
	const spans = marks.spans.filter((span) => span.start <= first + CHUNK && span.end > first);
	const names = Array.from(
		{ length: CHUNK },
		(_, index) => marks.names.get(first + index + 1) ?? [],
	);
	const subjects = [...spans, ...names.flat()].map((one) => one.subject);
	return [...new Set(subjects.filter((subject) => selected.has(subject)))].toSorted().join(",");
}

/** Inputs for one chunk of lines. */
interface CodeChunkProps extends NameActions {
	readonly first: number;
	readonly lines: readonly string[];
	readonly tokens: readonly (readonly CodeToken[])[] | null;
	readonly marks: FileMarks;
	/** The selected subjects it marks, joined by commas. */
	readonly lit: string;
}

/**
 * A chunk of lines, laid out only near the screen.
 * @param props The lines and what marks them.
 * @returns The chunk.
 */
const CodeChunk = memo(function CodeChunk(props: CodeChunkProps): JSX.Element {
	const { first, lines, tokens, marks } = props;
	const lit = useMemo(() => new Set(props.lit === "" ? [] : props.lit.split(",")), [props.lit]);
	const size = useMemo(
		(): CSSProperties => ({ containIntrinsicSize: `auto ${lines.length * LINE_HEIGHT}px` }),
		[lines.length],
	);
	return (
		<div className="[content-visibility:auto]" style={size}>
			{lines.map((text, index) => {
				const number = first + index + 1;
				return (
					<CodeLine
						key={number}
						number={number}
						text={text.replace(/\r$/u, "")}
						tokens={tokens?.[index]}
						names={marks.names.get(number) ?? NO_NAMES}
						span={spanAt(marks.spans, number, lit)}
						lit={lit}
						actions={props}
					/>
				);
			})}
		</div>
	);
});

const NO_NAMES: readonly NameMark[] = [];

/**
 * Whether a line lies in a bound definition, and whether that definition's module is selected.
 * @param spans The bound definitions.
 * @param line The line.
 * @param lit The selected subjects.
 * @returns `lit`, `bound` or nothing.
 */
function spanAt(
	spans: readonly BoundSpan[],
	line: number,
	lit: ReadonlySet<string>,
): "lit" | "bound" | undefined {
	const holding = spans.filter((span) => span.start <= line && line <= span.end);
	if (holding.length === 0) return undefined;
	return holding.some((span) => lit.has(span.subject)) ? "lit" : "bound";
}

/**
 * One line, with its number and the edge of a bound definition beside it.
 * @param props The line.
 * @param props.number Its number in the file.
 * @param props.text Its text.
 * @param props.tokens Its colours, once they are worked out.
 * @param props.names The names marked on it.
 * @param props.span Whether it lies in a bound definition, and whether that one is selected.
 * @param props.lit The selected subjects.
 * @param props.actions What a name does.
 * @returns The line.
 */
function CodeLine(props: {
	readonly number: number;
	readonly text: string;
	readonly tokens: readonly CodeToken[] | undefined;
	readonly names: readonly NameMark[];
	readonly span: "lit" | "bound" | undefined;
	readonly lit: ReadonlySet<string>;
	readonly actions: NameActions;
}): JSX.Element {
	const { number, text, tokens, names, span, lit, actions } = props;
	return (
		<div data-line={number} data-span={span} className="text-body-foreground flex">
			<span
				aria-hidden="true"
				className="text-muted-foreground w-(--gutter) shrink-0 text-right select-none"
			>
				{number}
			</span>
			<span
				aria-hidden="true"
				className={cn(
					"mx-3 w-0.5 shrink-0",
					span === "bound" && "bg-border",
					span === "lit" && "bg-primary-mark",
				)}
			/>
			<span className="min-w-0 flex-1 [overflow-wrap:anywhere] whitespace-pre-wrap">
				{lineSegments(text, tokens, names).map((segment) =>
					segment.kind === "text" ? (
						<Pieces key={segment.at} pieces={segment.pieces} />
					) : (
						<CodeName
							key={segment.at}
							mark={segment.mark}
							pieces={segment.pieces}
							pressed={lit.has(segment.mark.subject)}
							actions={actions}
						/>
					),
				)}
			</span>
		</div>
	);
}

/**
 * Runs of text in their colours.
 * @param props The runs.
 * @param props.pieces The runs.
 * @returns The runs.
 */
function Pieces(props: { readonly pieces: readonly Piece[] }): JSX.Element {
	return (
		<>
			{props.pieces.map(({ at, content, style }) => (
				<span key={at} style={style}>
					{content}
				</span>
			))}
		</>
	);
}

/**
 * A name that the model binds or anchors: a button that shows its subject in the picture, and
 * lights it there while the pointer or the keys rest on it.
 * @param props The name.
 * @param props.mark What it stands for.
 * @param props.pieces Its text in its colours.
 * @param props.pressed Whether its subject is selected.
 * @param props.actions What it does.
 * @returns The button.
 */
function CodeName(props: {
	readonly mark: NameMark;
	readonly pieces: readonly Piece[];
	readonly pressed: boolean;
	readonly actions: NameActions;
}): JSX.Element {
	const { mark, pressed, actions } = props;
	const { subject, kind } = mark;
	const handlers = useSubjectKey(subject, actions);
	const name = actions.nameOf(subject);
	const label =
		kind === "binding" ? `${mark.symbol}, bound by ${name}` : `${mark.symbol}, anchor of ${name}`;
	return (
		<button
			type="button"
			data-slot="code-name"
			data-kind={kind}
			aria-pressed={pressed}
			aria-label={label}
			title={label}
			{...handlers}
			className={cn(
				"focus-visible:ring-ring cursor-pointer rounded-[3px] underline underline-offset-[3px] outline-hidden focus-visible:ring-2",
				"hover:bg-face-hover aria-pressed:bg-primary-mark/18 aria-pressed:decoration-primary-mark aria-pressed:decoration-solid",
				kind === "binding"
					? "bg-foreground/5 decoration-muted-foreground decoration-[1.5px]"
					: "decoration-muted-foreground/70 decoration-dashed",
			)}
		>
			<Pieces pieces={props.pieces} />
		</button>
	);
}

export { CodeLines };
