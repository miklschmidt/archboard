// The open file in the code view's column (TASK-648, TASK-649): a head on the column's chrome row
// with the file's name and folder, the modules that own it, and its lines. It lies on the chrome,
// as the conversation does, so the picture's sheet stays the one sheet. The server reads the file
// from the checkout on disk now, so a reading of a proposal or a saved reading says so over the
// lines.

import { useCallback, useMemo, type JSX, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { RiFileCodeLine } from "@remixicon/react";
import type { CodeFile } from "#ui/architecture-drawing/code-browser/clients/code-files.ts";
import { Button } from "@archboard/ui-kit/components";
import { textTokens } from "#ui/architecture-drawing/code-highlighting/clients/code-highlighter.ts";
import {
	codeFileQuery,
	type FilePlace,
	type OwnerReading,
} from "#ui/architecture-drawing/code-browser/clients/code-files.ts";
import { fileMarks } from "#ui/architecture-drawing/code-browser/rules/symbol-marks.ts";
import { CodeLines } from "#ui/architecture-drawing/code-browser/components/CodeLines.tsx";
import { CodeOwners } from "#ui/architecture-drawing/code-browser/components/CodeOwners.tsx";

/** What the code view does with the model's subjects. */
interface SubjectActions {
	/** Show a subject in the picture and select it. */
	readonly onShow: (subject: string) => void;
	/** Light a subject in the picture, or null for none. */
	readonly onPoint: (subject: string | null) => void;
	/** The name of a subject. */
	readonly nameOf: (subject: string) => string;
	/** The path a module's binding names. */
	readonly boundPathOf: (subject: string) => string | undefined;
}

/** Inputs for the code view. */
interface CodeSourceProps extends SubjectActions {
	readonly vault: string;
	/** The open file, or null while none is. */
	readonly place: FilePlace | null;
	readonly reading: OwnerReading;
	readonly selected: ReadonlySet<string>;
	/** Whether the reading is of something other than the live current state. */
	readonly elsewhere: boolean;
}

/**
 * The open file.
 * @param props The file, the reading its owners come from, and the selection.
 * @returns The sheet.
 */
function CodeSource(props: CodeSourceProps): JSX.Element {
	const { place } = props;
	return (
		<section
			data-slot="code-source"
			aria-label={place === null ? "Code" : `Code of ${place.path}`}
			className="bg-sidebar flex h-full min-h-0 w-full min-w-0 flex-col"
		>
			<SourceHead path={place?.path ?? null} />
			{place === null ? <NoFile /> : <OpenFile {...props} place={place} />}
		</section>
	);
}

/**
 * A path's last name, and the folder before it with its `/`.
 * @param path The path, or null while no file is open.
 * @returns The name, "Code" while no file is open, and the folder or null.
 */
function fileParts(path: string | null): { readonly name: string; readonly folder: string | null } {
	if (path === null) return { name: "Code", folder: null };
	const cut = path.lastIndexOf("/");
	return { name: path.slice(cut + 1), folder: cut < 0 ? null : path.slice(0, cut + 1) };
}

/**
 * The column's chrome row: the open file's name, and its folder in mono.
 * @param props The open file's path.
 * @param props.path The path, or null while no file is open.
 * @returns The head.
 */
function SourceHead(props: { readonly path: string | null }): JSX.Element {
	const { path } = props;
	const { name, folder } = fileParts(path);
	return (
		<header className="h-chrome flex shrink-0 items-center gap-2 px-4">
			<RiFileCodeLine aria-hidden="true" className="text-muted-foreground size-3.5 shrink-0" />
			<h2 className="text-control shrink-0 font-semibold">{name}</h2>
			{folder !== null && (
				<span
					className="text-technical text-muted-foreground min-w-0 truncate font-mono [direction:rtl]"
					title={path ?? undefined}
				>
					<bdi>{folder}</bdi>
				</span>
			)}
		</header>
	);
}

/**
 * What the view says while no file is open.
 * @returns The words.
 */
function NoFile(): JSX.Element {
	return (
		<p
			data-slot="code-source-state"
			className="text-body text-muted-foreground m-auto max-w-72 p-4 text-center"
		>
			Choose a file in the tree. The picture shows the modules that own it.
		</p>
	);
}

/**
 * One open file: its owners, then its lines, or what stands in their place.
 * @param props The view's inputs, with a file open.
 * @returns The file.
 */
function OpenFile(props: CodeSourceProps & { readonly place: FilePlace }): JSX.Element {
	const { vault, place, reading } = props;
	const query = useQuery(codeFileQuery(vault, place, reading));
	return (
		<>
			<div className="flex shrink-0 flex-col gap-1.5 px-4 pb-2.5 shadow-[inset_0_-1px_0_var(--border)]">
				{query.data !== undefined && (
					<CodeOwners owners={query.data.owners} path={place.path} {...props} />
				)}
				{props.elsewhere && (
					<p className="text-body text-muted-foreground">The code is the checkout on disk now.</p>
				)}
			</div>
			<FileBody key={JSON.stringify([place.repo, place.path])} query={query} {...props} />
		</>
	);
}

/**
 * The lines of a file, or why they are not here.
 * @param props The read and the view's inputs.
 * @param props.query The read of the file.
 * @returns The lines, or the words in their place.
 */
function FileBody(
	props: CodeSourceProps & {
		readonly place: FilePlace;
		readonly query: ReturnType<typeof useQuery<CodeFile>>;
	},
): JSX.Element {
	const { query } = props;
	if (query.isPending) return <SourceState>Reading the file…</SourceState>;
	if (query.isError) return <ReadFailure error={query.error} onRetry={query.refetch} />;
	const { source, owners } = query.data;
	if (source.status === "refused") return <SourceState>{source.error}</SourceState>;
	return <QuotedFile {...props} source={source} owners={owners} />;
}

/**
 * Why a file could not be read, and the key that reads it again.
 * @param props The failure.
 * @param props.error What happened.
 * @param props.onRetry Read the file again.
 * @returns The words and the key.
 */
function ReadFailure(props: {
	readonly error: Error;
	readonly onRetry: () => unknown;
}): JSX.Element {
	const { onRetry } = props;
	const retry = useCallback((): void => void onRetry(), [onRetry]);
	return (
		<SourceState>
			{props.error.message}
			<Button variant="outline" size="sm" className="mt-2" onClick={retry}>
				Read again
			</Button>
		</SourceState>
	);
}

/**
 * Words that stand in the place of a file's lines.
 * @param props The words.
 * @param props.children The words.
 * @returns The words.
 */
function SourceState(props: { readonly children: ReactNode }): JSX.Element {
	return (
		<div
			data-slot="code-source-state"
			className="text-body text-muted-foreground flex flex-col items-start p-4"
		>
			{props.children}
		</div>
	);
}

/**
 * The lines of a quoted file, plain at once and coloured once the colours are worked out.
 * @param props The file and the view's inputs.
 * @param props.source The file's text and the definitions found in it.
 * @param props.owners The file's owners.
 * @returns The lines.
 */
function QuotedFile(
	props: CodeSourceProps & {
		readonly place: FilePlace;
		readonly source: Extract<CodeFile["source"], { status: "quoted" }>;
		readonly owners: CodeFile["owners"];
	},
): JSX.Element {
	const { place, source, owners, selected } = props;
	const { text, definitions } = source;
	const digest = useMemo(() => textDigest(text), [text]);
	const lines = useMemo(() => text.split("\n"), [text]);
	const marks = useMemo(() => fileMarks(text, owners, definitions), [text, owners, definitions]);
	const tokens =
		useQuery({
			queryKey: ["code-file-tokens", place.repo, place.path, digest] as const,
			/**
			 * Work out the colours of the file.
			 * @returns The colours of each line, or null for plain text.
			 */
			queryFn: () => textTokens(place.path, text),
			staleTime: Number.POSITIVE_INFINITY,
			gcTime: 0,
			retry: false,
		}).data ?? null;
	const reveal = useMemo(
		() => revealedLine(marks.spans, owners, selected),
		[marks, owners, selected],
	);
	return (
		<CodeLines
			lines={lines}
			tokens={tokens}
			marks={marks}
			selected={selected}
			reveal={reveal}
			onShow={props.onShow}
			onPoint={props.onPoint}
			nameOf={props.nameOf}
		/>
	);
}

/**
 * The line to bring into view: the definition of the one module selected, or the anchor of the one
 * relationship selected, when the file holds it.
 * @param spans The bound definitions.
 * @param owners The file's owners.
 * @param selected The selection.
 * @returns The line, or null.
 */
function revealedLine(
	spans: ReturnType<typeof fileMarks>["spans"],
	owners: CodeFile["owners"],
	selected: ReadonlySet<string>,
): number | null {
	if (selected.size !== 1) return null;
	const [id] = selected;
	const span = spans.find((one) => one.subject === id);
	if (span !== undefined) return span.start;
	return owners.anchors.find((one) => one.subject === id)?.line ?? null;
}

/**
 * A short name for a text, so its colours are worked out once for each text and the query key
 * never holds the whole file.
 * @param text The text.
 * @returns Its length and a 32-bit FNV-1a hash of it.
 */
function textDigest(text: string): string {
	let hash = 0x811c9dc5;
	for (let index = 0; index < text.length; index += 1) {
		hash = Math.imul(hash ^ text.charCodeAt(index), 0x01000193);
	}
	return `${text.length}:${(hash >>> 0).toString(36)}`;
}

export { CodeSource, type SubjectActions };
