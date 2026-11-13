import { queryOptions } from "@tanstack/react-query";
import type { z } from "zod";
import type { Model } from "@archboard/model/content";
import { ArchitectureHistoryResultSchema } from "@archboard/code-intel/history";
import { inVault } from "@archboard/server-requests";
import {
	architectureModelKeys,
	ArchitectureReadError,
	readReply,
} from "#ui/architecture-drawing/model-reader/access/clients/queries.ts";

/** A branch footprint as the route answers it, with the identity of the reading it read. */
type BranchFootprintAnswer = Extract<
	z.infer<typeof ArchitectureHistoryResultSchema>,
	{ analysis: "footprint" }
>;

/** The range and the state that one footprint reads. */
interface FootprintRange {
	/** The ref that the range starts from, as the reader named it. */
	readonly base: string;
	/** The ref that the range runs up to, or null for the HEAD of each checkout. */
	readonly head: string | null;
	/** The state the commits are set against, in the vault that the footprint reads. */
	readonly state: string;
}

/**
 * Read the branch footprint of a model, from a base to a head, set against one state. The answer
 * is kept for the model revision, the state and the range, and nothing reads it again until the
 * reader presses Refresh: the server keeps no footprint, and a HEAD can move without a new revision.
 * @param vault The explicitly addressed vault.
 * @param model The coherent model on screen.
 * @param range The base, the head and the state.
 * @returns One cached footprint request.
 */
function branchFootprintQuery(
	vault: string,
	model: Pick<Model, "manifest" | "revision">,
	range: FootprintRange,
) {
	const { state } = range;
	const parameters = new URLSearchParams({ base: range.base, state });
	if (range.head !== null) parameters.set("head", range.head);
	return queryOptions({
		queryKey: [
			...architectureModelKeys.vault(vault),
			"footprint",
			model.manifest.id,
			state,
			model.revision.digest,
			range.base,
			range.head,
		],
		/**
		 * Read the footprint and keep it paired with the model it was asked for.
		 * @returns The footprint, or an explicit refusal.
		 */
		queryFn: async (): Promise<BranchFootprintAnswer> => {
			const result = await readReply(
				`${inVault("/api/architecture/footprint", vault)}&${parameters}`,
				ArchitectureHistoryResultSchema,
			);
			if (!result.success) throw new ArchitectureReadError(result);
			if (result.analysis !== "footprint")
				throw new Error("The history response contains another analysis. Retry the read.");
			if (result.model !== model.manifest.id || result.state?.id !== state)
				throw new Error(
					"The architecture changed while the footprint was read. Refresh the architecture and try again.",
				);
			return result;
		},
		staleTime: Number.POSITIVE_INFINITY,
		retry: false,
		retryOnMount: false,
		refetchOnReconnect: false,
		refetchOnWindowFocus: false,
	});
}

/** A range whose base and head are both named. */
interface NamedRange {
	readonly base: string;
	readonly head: string;
}

/** The branches of the repositories that a reading binds, as the route answers them. */
type SourceRefsAnswer = Extract<
	z.infer<typeof ArchitectureHistoryResultSchema>,
	{ analysis: "refs" }
>;

/** The branch where Archboard keeps its history archive, which is no source branch. */
const HISTORY_ARCHIVE_BRANCH = "archboard-history";

/**
 * Read the branches that a footprint can start from or run up to, for the state on screen. The
 * answer is kept until the reader presses Refresh, because a branch moves without a new revision.
 * @param vault The explicitly addressed vault.
 * @param model The coherent model and the state on screen.
 * @returns One cached request for the source refs.
 */
function sourceRefsQuery(
	vault: string,
	model: Pick<Model, "manifest" | "selectedState" | "revision">,
) {
	const state = model.selectedState?.id;
	const parameters = new URLSearchParams(state === undefined ? {} : { state });
	return queryOptions({
		queryKey: [
			...architectureModelKeys.vault(vault),
			"refs",
			model.manifest.id,
			state,
			model.revision.digest,
		],
		/**
		 * Read the source refs, without the branch of the history archive.
		 * @returns The refs, or an explicit refusal.
		 */
		queryFn: async (): Promise<SourceRefsAnswer> => {
			const result = await readReply(
				`${inVault("/api/architecture/refs", vault)}&${parameters}`,
				ArchitectureHistoryResultSchema,
			);
			if (!result.success) throw new ArchitectureReadError(result);
			if (result.analysis !== "refs")
				throw new Error("The history response contains another analysis. Retry the read.");
			return { ...result, refs: result.refs.filter((one) => one.name !== HISTORY_ARCHIVE_BRANCH) };
		},
		staleTime: Number.POSITIVE_INFINITY,
		retry: false,
		retryOnMount: false,
		refetchOnReconnect: false,
		refetchOnWindowFocus: false,
	});
}

/**
 * Read where a range runs in the vault's repository: the merge base of the base and the head. It
 * is kept until the reader presses Refresh, as the branches are.
 * @param vault The explicitly addressed vault.
 * @param model The coherent model and the state on screen.
 * @param range The base and the head, as the reader named them.
 * @returns One cached request for the range, which answers null where the repository has none.
 */
function mergeBaseQuery(
	vault: string,
	model: Pick<Model, "manifest" | "selectedState" | "revision">,
	range: NamedRange,
) {
	const state = model.selectedState?.id;
	const parameters = new URLSearchParams({ base: range.base, head: range.head });
	if (state !== undefined) parameters.set("state", state);
	return queryOptions({
		queryKey: [
			...architectureModelKeys.vault(vault),
			"merge-base",
			model.manifest.id,
			state,
			model.revision.digest,
			range.base,
			range.head,
		],
		/**
		 * Read the range from the refs listing.
		 * @returns The range, or null.
		 */
		queryFn: async (): Promise<SourceRefsAnswer["range"]> => {
			const result = await readReply(
				`${inVault("/api/architecture/refs", vault)}&${parameters}`,
				ArchitectureHistoryResultSchema,
			);
			if (!result.success) throw new ArchitectureReadError(result);
			if (result.analysis !== "refs")
				throw new Error("The history response contains another analysis. Retry the read.");
			return result.range ?? null;
		},
		staleTime: Number.POSITIVE_INFINITY,
		retry: false,
		retryOnMount: false,
		refetchOnReconnect: false,
		refetchOnWindowFocus: false,
	});
}

export {
	branchFootprintQuery,
	mergeBaseQuery,
	sourceRefsQuery,
	type BranchFootprintAnswer,
	type FootprintRange,
	type NamedRange,
	type SourceRefsAnswer,
};
