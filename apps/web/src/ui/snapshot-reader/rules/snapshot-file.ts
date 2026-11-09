// What a snapshot page makes of its address and of the file that the address names.

import type { z } from "zod";
import { ModelSnapshotSchema } from "@archboard/model/contract";

type ModelSnapshot = z.output<typeof ModelSnapshotSchema>;

/** The format versions of a snapshot file that this page reads. */
const READABLE_FORMATS: readonly unknown[] = [ModelSnapshotSchema.shape.format.value];

/** What the page found at the address: a snapshot it draws, or why it draws nothing. */
type OpenedSnapshot =
	| { readonly kind: "open"; readonly snapshot: ModelSnapshot }
	| { readonly kind: "refused"; readonly reason: string };

/** The query parameter that names the snapshot file. */
const SNAPSHOT_PARAMETER = "snapshot";

/**
 * The snapshot file that a page's address names. A relative name resolves against the page, so a
 * build and its snapshots can sit together under any path of a static host.
 * @param search The query string of the page's address.
 * @param base The base URL of the page.
 * @returns The file's URL, or null when the address names none that a URL can name.
 */
function snapshotLocation(search: string, base: string): URL | null {
	const named = new URLSearchParams(search).get(SNAPSHOT_PARAMETER);
	if (named === null || named.trim() === "") return null;
	return URL.parse(named, base);
}

/**
 * Read a file's content as a snapshot. A file of another format version is refused by name, so a
 * reader knows to open it with another version of the page.
 * @param content The parsed JSON of the file.
 * @returns The snapshot, or why the page refuses it.
 */
function openedSnapshot(content: unknown): OpenedSnapshot {
	const format = formatOf(content);
	if (format !== undefined && !READABLE_FORMATS.includes(format)) {
		return { kind: "refused", reason: unknownFormat(format) };
	}
	const parsed = ModelSnapshotSchema.safeParse(content);
	return parsed.success
		? { kind: "open", snapshot: parsed.data }
		: { kind: "refused", reason: notSnapshot(parsed.error) };
}

/**
 * The format version that a file names.
 * @param content The parsed JSON of the file.
 * @returns The version, or nothing when the file names none.
 */
function formatOf(content: unknown): unknown {
	return typeof content === "object" && content !== null && "format" in content
		? content.format
		: undefined;
}

/**
 * The refusal of a file that is no snapshot of a readable version.
 * @param error Why the snapshot's schema refused it.
 * @returns The words, which name the first problem.
 */
function notSnapshot(error: z.ZodError): string {
	const [issue] = error.issues;
	const where = issue === undefined || issue.path.length === 0 ? "" : ` at ${issue.path.join(".")}`;
	return `The file is not a model snapshot${where}: ${issue?.message ?? "it holds nothing"}. Write one with archboard model snapshot.`;
}

/**
 * The refusal of a file of another format version.
 * @param format The version that the file names.
 * @returns The words, which name the versions this page reads.
 */
function unknownFormat(format: unknown): string {
	const versions = READABLE_FORMATS.join(", ");
	const noun = READABLE_FORMATS.length === 1 ? "version" : "versions";
	return `This snapshot has format version ${JSON.stringify(format)}. This page reads format ${noun} ${versions}. Open it with the version of Archboard that wrote it, or write the snapshot again.`;
}

export {
	openedSnapshot,
	snapshotLocation,
	SNAPSHOT_PARAMETER,
	type ModelSnapshot,
	type OpenedSnapshot,
};
