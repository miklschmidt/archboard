// The answers of the code browser's two routes (TASK-648, ADR 0080): the files of a checkout, and
// one whole file with the modules of a reading that own it. Browser-safe: no Node import.

import { z } from "zod";

/**
 * The answer of `GET /api/code/files`: every file of one registered checkout that Git lists,
 * tracked or new and not ignored, relative to the checkout with `/` between names, sorted.
 * `neverQuoted` holds the listed files that the file route never quotes, such as Terraform state
 * and env files, so a tree can dim them before anyone opens one.
 */
const CodeFilesSchema = z.object({
	/** The repository identity, as a binding names it. */
	repo: z.string(),
	files: z.array(z.string()),
	neverQuoted: z.array(z.string()),
});

/** One definition of a file, as its code facts give it: lines from 1, offsets in UTF-16. */
const CodeFileDefinitionSchema = z.object({
	symbol: z.string(),
	kind: z.enum(["function", "class", "value"]),
	start: z.int().positive(),
	end: z.int().positive(),
	/** The declaration's offsets in the file's text: inclusive start, exclusive end. */
	source: z.object({ start: z.int().nonnegative(), end: z.int().nonnegative() }).optional(),
});

/**
 * The file's text, or why the route does not quote it. `SOURCE_REFUSED` names a file the route
 * never quotes (never-quoted, a Kubernetes Secret, larger than 1 MiB, binary or not UTF-8, or
 * ignored by Git). `SOURCE_UNAVAILABLE` names a file that cannot be read here now.
 */
const CodeFileSourceSchema = z.discriminatedUnion("status", [
	z.object({
		status: z.literal("quoted"),
		text: z.string(),
		/**
		 * The file's definitions, in source order; empty for a file no grammar reads, and for an
		 * answer to a request that named no model.
		 */
		definitions: z.array(CodeFileDefinitionSchema),
	}),
	z.object({
		status: z.literal("refused"),
		code: z.enum(["SOURCE_REFUSED", "SOURCE_UNAVAILABLE"]),
		error: z.string(),
	}),
]);

/**
 * The modules of the reading that own the file, by the code check's rule (ADR 0046, "Bound code").
 * `file` holds the narrowest modules bound to the file as a whole: bound to it, to its C or C++
 * pair, or else to the deepest directory above it. `symbols` holds each module bound to a symbol in
 * the file, with the lines of its definition, or null where the code facts find no such definition.
 * `anchors` holds each relationship whose anchor names the file, with the line of its symbol: a
 * definition's first line, else the first line that references it, else null.
 */
const CodeFileOwnersSchema = z.object({
	file: z.array(z.string()),
	symbols: z.array(
		z.object({
			subject: z.string(),
			symbol: z.string(),
			definition: CodeFileDefinitionSchema.nullable(),
		}),
	),
	anchors: z.array(
		z.object({
			subject: z.string(),
			symbol: z.string(),
			line: z.int().positive().nullable(),
		}),
	),
});

/**
 * The answer of `GET /api/code/file`: one whole file of a registered checkout, as the checkout holds
 * it on disk now, and the modules that own it in the reading the request names. The owners come
 * from the bindings alone, so a file the route refuses to quote still has them. A request that
 * names no model reads none, so its answer has no `owners` and no definitions.
 */
const CodeFileSchema = z.object({
	repo: z.string(),
	path: z.string(),
	source: CodeFileSourceSchema,
	owners: CodeFileOwnersSchema.optional(),
});

export { CodeFileSchema, CodeFilesSchema };

/**
 * The schema `CodeFileSchema`, for callers that parse it or build on it.
 * @returns The schema.
 */
export function codeFileSchema(): typeof CodeFileSchema {
	return CodeFileSchema;
}

/**
 * The schema `CodeFilesSchema`, for callers that parse it or build on it.
 * @returns The schema.
 */
export function codeFilesSchema(): typeof CodeFilesSchema {
	return CodeFilesSchema;
}
