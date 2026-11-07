import { RiFileCodeLine } from "@remixicon/react";
import type { JSX } from "react";
import { useQuery } from "@tanstack/react-query";
import { sourceLinesQuery } from "#ui/architecture-drawing/model-reader/access/clients/source-lines.ts";
import type { CodeEvidence } from "#ui/architecture-drawing/canvas/presentation/components/SemanticInspectorCode.tsx";

/**
 * The source that a piece of evidence rests on, beside the card: the file, and the lines round the
 * evidence line with their numbers and that line marked. The lines come from the server, which
 * answers only for a place that a remembered finding names.
 * @param props The piece, and the pass that found it.
 * @param props.vault The vault of the reading.
 * @param props.evidence The piece, or nothing for a finding that names no code.
 * @param props.checkedAt When the pass ran.
 * @returns The excerpt, or what stands in its place.
 */
function ModelCodeSource(props: {
	readonly vault: string;
	readonly evidence: CodeEvidence | undefined;
	readonly checkedAt: string;
}): JSX.Element {
	const { evidence } = props;
	return (
		<figure
			data-slot="code-source"
			className="bg-tray-sink rounded-panel inset-ring-border m-0 flex min-h-0 flex-col overflow-hidden inset-ring"
		>
			<figcaption className="text-muted-foreground flex h-9 shrink-0 items-center gap-2 px-3.5 shadow-[inset_0_-1px_0_var(--border)]">
				<RiFileCodeLine aria-hidden="true" className="size-3.5 shrink-0" />
				{evidence === undefined ? (
					<span className="text-body">No source</span>
				) : (
					<>
						<span className="text-technical min-w-0 truncate font-mono" title={evidence.repo}>
							{evidence.path}
						</span>
						<span className="text-body ml-auto shrink-0">{evidence.kind}</span>
					</>
				)}
			</figcaption>
			{evidence === undefined ? (
				<p className="text-body text-muted-foreground p-3.5">
					This finding says that something is missing, so it names no line of code.
				</p>
			) : (
				<SourceExcerpt vault={props.vault} evidence={evidence} checkedAt={props.checkedAt} />
			)}
		</figure>
	);
}

/**
 * The lines round a piece of evidence, with the evidence line marked.
 * @param props The piece and the pass.
 * @param props.vault The vault of the reading.
 * @param props.evidence The piece.
 * @param props.checkedAt When the pass ran.
 * @returns The lines, or a quiet word while they come or when they cannot.
 */
function SourceExcerpt(props: {
	readonly vault: string;
	readonly evidence: CodeEvidence;
	readonly checkedAt: string;
}): JSX.Element {
	const { vault, evidence, checkedAt } = props;
	const query = useQuery(sourceLinesQuery(vault, evidence, checkedAt));
	if (query.isPending)
		return (
			<output data-slot="code-source-state" className="text-body text-muted-foreground p-3.5">
				Reading the source…
			</output>
		);
	if (query.data == null)
		return (
			<p
				data-slot="code-source-state"
				data-unavailable=""
				className="text-body text-muted-foreground p-3.5"
			>
				Source unavailable.
			</p>
		);
	const { first, lines } = query.data;
	const numbered = lines.map((text, index) => ({ number: first + index, text }));
	// A long line wraps, so nothing scrolls sideways and the excerpt needs no key of its own.
	return (
		<pre className="text-technical m-0 min-h-0 overflow-y-auto py-3.5 font-mono leading-[1.85]">
			<code className="block">
				{numbered.map(({ number, text }) => (
					<SourceLine key={number} number={number} text={text} marked={number === evidence.line} />
				))}
			</code>
		</pre>
	);
}

/**
 * One line of source, with its number. The evidence line is marked, as the site marks it: a wash and
 * an edge of the changed colour.
 * @param props The line.
 * @param props.number Its number in the file.
 * @param props.text Its text.
 * @param props.marked Whether it is the evidence line.
 * @returns The line.
 */
function SourceLine(props: {
	readonly number: number;
	readonly text: string;
	readonly marked: boolean;
}): JSX.Element {
	const { number, text, marked } = props;
	const words = (
		<>
			<span
				aria-hidden="true"
				className="text-muted-foreground/70 inline-block w-12 shrink-0 pr-4 text-right select-none"
			>
				{number}
			</span>
			<span className="min-w-0 [overflow-wrap:anywhere] whitespace-pre-wrap">{text}</span>
		</>
	);
	if (!marked)
		return (
			<span data-line={number} className="text-body-foreground flex">
				{words}
			</span>
		);
	return (
		<mark
			data-line={number}
			className="bg-standing-changed/16 text-foreground flex shadow-[inset_2px_0_0_var(--standing-changed)]"
		>
			<span className="sr-only">Evidence line {number}: </span>
			{words}
		</mark>
	);
}

export { ModelCodeSource };
