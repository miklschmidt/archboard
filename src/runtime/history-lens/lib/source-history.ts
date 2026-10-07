// Immutable Git sources for declaration attribution. No checkout files are read.
import { createSourceFacts, isTerraformFile, neverRead, pairOf } from "@/runtime/code-facts/index";
import { gitBytes, gitText, type GitRunOptions } from "@/runtime/history-lens/lib/git";
import { filesOfBinding } from "@/shared/code-target/index";

/** A source blob in one tree; symbolic links are never followed. */
interface SourceEntry {
	readonly file: string;
	readonly id: string;
}

/**
 * Decode one batch record, leaving binary blobs unavailable to source parsers.
 * @param bytes The complete batch output.
 * @param at The record's starting byte.
 * @param id The requested blob.
 * @returns Its text and the start of the next record.
 */
function blobAt(bytes: Uint8Array, at: number, id: string) {
	const end = bytes.indexOf(10, at);
	const decoder = new TextDecoder();
	const size = Number(decoder.decode(bytes.subarray(at, end)).split(" ")[2]);
	if (end < 0 || !Number.isSafeInteger(size) || size < 0 || end + size + 1 >= bytes.length)
		throw new Error(`Cannot read Git blob ${id}.`);
	const blob = bytes.subarray(end + 1, end + 1 + size);
	return { text: blob.includes(0) ? undefined : decoder.decode(blob), next: end + size + 2 };
}

/**
 * Read selected blobs in one process, preserving byte lengths and file names.
 * @param root The checkout.
 * @param ids The blob ids to read.
 * @param options The request's cancellation signal.
 * @returns Text by blob id; binary blobs have no text.
 */
async function readBlobs(
	root: string,
	ids: readonly string[],
	options: GitRunOptions,
): Promise<Map<string, string | undefined>> {
	const bytes = await gitBytes(root, ["cat-file", "--batch"], {
		...options,
		input: `${ids.join("\n")}\n`,
	});
	const result = new Map<string, string | undefined>();
	let at = 0;
	for (const id of ids) {
		const record = blobAt(bytes, at, id);
		result.set(id, record.text);
		at = record.next;
	}
	return result;
}

/**
 * Read a listed blob's identity, excluding symbolic links and forbidden sources.
 * @param line One NUL-delimited ls-tree entry.
 * @returns Its source entry, when it is readable.
 */
function sourceEntry(line: string): SourceEntry[] {
	const split = line.indexOf("\t");
	const [mode, kind, id] = line.slice(0, split).split(" ");
	const file = line.slice(split + 1);
	return kind === "blob" && mode !== "120000" && id !== undefined && !neverRead(file)
		? [{ file, id }]
		: [];
}

/**
 * Retain bound sources and Terraform definitions outside bound root directories.
 * @param entries The revision's readable files.
 * @param paths The bound paths.
 * @returns The files whose source texts this reading needs.
 */
function neededEntries(entries: readonly SourceEntry[], paths: readonly string[]): SourceEntry[] {
	const files = entries.map(({ file }) => file);
	const listed = new Set(files);
	const selected = new Set(paths.flatMap((path) => filesOfBinding(path, files)));
	// A header's companion selects its grammar. Objective-C also reads SDK
	// macro wrappers from every header, including ones outside the bound path.
	for (const file of selected) for (const paired of pairOf(file, listed)) selected.add(paired);
	const objectiveC = [...selected].some((file) => /\.(?:h|m)$/u.test(file));
	const flake = [...selected].some((file) => /(?:^|\/)flake[.]nix$/u.test(file));
	return entries.filter(
		({ file }) =>
			selected.has(file) ||
			isTerraformFile(file) ||
			(objectiveC && /\.(?:h|pch)$/u.test(file)) ||
			(flake && file.endsWith(".nix")),
	);
}

/**
 * Fill the cache with unread blobs, including unavailable binary results.
 * @param root The checkout.
 * @param entries The sources needed for the revision.
 * @param blobs The walk's text cache.
 * @param options The request's cancellation signal.
 * @returns Completion after every missing blob has been read.
 */
async function fillBlobs(
	root: string,
	entries: readonly SourceEntry[],
	blobs: Map<string, string | undefined>,
	options: GitRunOptions,
): Promise<void> {
	const missing = [...new Set(entries.map(({ id }) => id).filter((id) => !blobs.has(id)))];
	if (missing.length === 0) return;
	for (const [id, text] of await readBlobs(root, missing, options)) blobs.set(id, text);
}

/**
 * Assemble available source texts without inventing empty texts for binary files.
 * @param entries The revision's needed sources.
 * @param blobs The walk's blob cache.
 * @returns Source texts keyed by file name.
 */
function sourceTexts(
	entries: readonly SourceEntry[],
	blobs: ReadonlyMap<string, string | undefined>,
) {
	return new Map(
		entries.flatMap(({ file, id }) => {
			const text = blobs.get(id);
			return text === undefined ? [] : [[file, text] as const];
		}),
	);
}

/**
 * Share a source reader across every part and revision of one repository walk.
 * @param root The checkout.
 * @param paths The bound paths whose sources the walk reads.
 * @param options The request's cancellation signal.
 * @returns A reader of immutable Git revisions.
 */
function sourceHistory(root: string, paths: readonly string[], options: GitRunOptions) {
	const facts = createSourceFacts();
	const blobs = new Map<string, string | undefined>();
	/**
	 * Read a revision, including local module definitions outside bound roots.
	 * @param revision The commit id; undefined represents the empty parent tree.
	 * @returns The revision's source texts and shared code-facts pass.
	 */
	const read = async (revision: string | undefined) => {
		const listing =
			revision === undefined ? "" : await gitText(root, ["ls-tree", "-r", "-z", revision], options);
		const entries = listing.split("\0").filter(Boolean).flatMap(sourceEntry);
		const files = new Set(entries.map(({ file }) => file));
		const needed = neededEntries(entries, paths);
		await fillBlobs(root, needed, blobs, options);
		const sources = sourceTexts(needed, blobs);
		const checkout = { root, files };
		return { checkout, sources, pass: facts.pass(checkout, sources, options.signal) };
	};
	return { read };
}

type SourceRevision = Awaited<ReturnType<ReturnType<typeof sourceHistory>["read"]>>;
export { sourceHistory, type SourceRevision };
