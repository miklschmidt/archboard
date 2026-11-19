// The code browser's reads (TASK-648): the files of a checkout, and one whole file with the modules
// of a reading that own it. A checkout changes under an agent's hands, so both read again when the
// page comes back into focus, and a file reads again for each revision of the model it is read
// with, because its owners come from that model's bindings. A refusal to list a repository is an
// error, and a refusal to quote a file is part of the answer, because its owners still hold.

import { queryOptions } from "@tanstack/react-query";
import type { z } from "zod";
import { codeFileSchema, codeFilesSchema } from "@archboard/code-intel/code-check";
import { inVault } from "@archboard/server-requests";
import { architectureModelKeys } from "#ui/architecture-drawing/model-reader/access/clients/queries.ts";

/** The files of a checkout. */
type CodeFiles = z.infer<ReturnType<typeof codeFilesSchema>>;

/** One file, with the owners that a read naming a reading always has. */
type CodeFile = z.infer<ReturnType<typeof codeFileSchema>> & {
	readonly owners: NonNullable<z.infer<ReturnType<typeof codeFileSchema>>["owners"]>;
};

/** The reading a file's owners come from. */
interface OwnerReading {
	readonly model: string;
	/** The selected state, or null for the current one. */
	readonly state: string | null;
	/** The exact checkpoint, or null for the live inputs. */
	readonly checkpoint: string | null;
	/** The source ref holding the selected model inputs, or null for the live inputs. */
	readonly ref: string | null;
	/** The digest of the reading's inputs, so a new revision reads the owners again. */
	readonly revision: string;
}

/** One file of one repository. */
interface FilePlace {
	readonly repo: string;
	readonly path: string;
}

/**
 * The error a refused read answers with, or a plain one that names the status.
 * @param response The refused response.
 * @param what What could not be read.
 * @returns The error.
 */
async function refusalOf(response: Response, what: string): Promise<Error> {
	const body: unknown = await response.json().catch(() => null);
	const said =
		typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
			? body.error
			: `${what} could not be read (${response.status}).`;
	return new Error(said);
}

/**
 * The files of one repository's checkout.
 * @param vault The vault of the reading.
 * @param repo The repository, or undefined for the vault's own.
 * @returns The query options, whose data names the repository and lists its files.
 */
function codeFilesQuery(vault: string, repo: string | undefined) {
	return queryOptions({
		queryKey: [...architectureModelKeys.vault(vault), "code-files", repo ?? null] as const,
		/**
		 * List the files.
		 * @param context The query cancellation signal.
		 * @returns The repository and its files.
		 */
		queryFn: async (context): Promise<CodeFiles> => {
			const query = repo === undefined ? "" : `&${new URLSearchParams({ repo })}`;
			const response = await fetch(`${inVault("/api/code/files", vault)}${query}`, {
				signal: context.signal,
			});
			if (!response.ok) throw await refusalOf(response, "The files");
			return codeFilesSchema().parse(await response.json());
		},
		refetchOnWindowFocus: true,
	});
}

/**
 * One whole file, with the modules of a reading that own it.
 * @param vault The vault of the reading.
 * @param place The file.
 * @param reading The reading its owners come from.
 * @returns The query options, whose data is the file's text or refusal, and its owners.
 */
function codeFileQuery(vault: string, place: FilePlace, reading: OwnerReading) {
	const { repo, path } = place;
	const { model, state, checkpoint, ref, revision } = reading;
	return queryOptions({
		queryKey: [
			...architectureModelKeys.vault(vault),
			"code-file",
			repo,
			path,
			model,
			state,
			checkpoint,
			ref,
			revision,
		] as const,
		/**
		 * Read the file.
		 * @param context The query cancellation signal.
		 * @returns The file and its owners.
		 */
		queryFn: async (context): Promise<CodeFile> => {
			const parameters = new URLSearchParams({ repo, path, model });
			if (state !== null) parameters.set("state", state);
			if (checkpoint !== null) parameters.set("checkpoint", checkpoint);
			if (ref !== null) parameters.set("ref", ref);
			const response = await fetch(`${inVault("/api/code/file", vault)}&${parameters}`, {
				signal: context.signal,
			});
			if (!response.ok) throw await refusalOf(response, path);
			const file = codeFileSchema().parse(await response.json());
			if (file.owners === undefined) throw new Error(`The server named no owners of ${path}.`);
			return { ...file, owners: file.owners };
		},
		refetchOnWindowFocus: true,
	});
}

export {
	codeFileQuery,
	codeFilesQuery,
	type CodeFile,
	type CodeFiles,
	type FilePlace,
	type OwnerReading,
};
