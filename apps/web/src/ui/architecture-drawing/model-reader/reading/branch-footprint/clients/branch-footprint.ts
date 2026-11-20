import type { z } from "zod";
import type { Model } from "@archboard/model-rules";
import type { architectureHistoryResultSchema } from "@archboard/code-intel/history";
import { historyQuery } from "#ui/architecture-drawing/model-reader/access/clients/queries.ts";

/** A branch footprint as the route answers it, with the identity of the reading it read. */
type BranchFootprintAnswer = Extract<
	z.infer<ReturnType<typeof architectureHistoryResultSchema>>,
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
	return historyQuery(
		vault,
		{ analysis: "footprint", base: range.base, state, head: range.head ?? undefined },
		{
			key: ["footprint", model.manifest.id, state, model.revision.digest, range.base, range.head],
			/**
			 * Keep the footprint paired with the model it was asked for.
			 * @param result The footprint answer.
			 * @returns The footprint, when it reads the model on screen.
			 */
			accept: (result): BranchFootprintAnswer => {
				if (result.model !== model.manifest.id || result.state?.id !== state)
					throw new Error(
						"The architecture changed while the footprint was read. Refresh the architecture and try again.",
					);
				return result;
			},
		},
	);
}

/** A range whose base and head are both named. */
interface NamedRange {
	readonly base: string;
	readonly head: string;
}

/** The branches of the repositories that a reading binds, as the route answers them. */
type SourceRefsAnswer = Extract<
	z.infer<ReturnType<typeof architectureHistoryResultSchema>>,
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
	model: Pick<Model, "manifest" | "selectedState" | "revision" | "sourceRef">,
) {
	const state = model.selectedState?.id;
	const ref = model.sourceRef?.ref;
	return historyQuery(
		vault,
		{ analysis: "refs", state, ref },
		{
			key: ["refs", ref, model.manifest.id, state, model.revision.digest],
			/**
			 * Leave out the branch of the history archive.
			 * @param result The refs answer.
			 * @returns The refs.
			 */
			accept: (result): SourceRefsAnswer => ({
				...result,
				refs: result.refs.filter((one) => one.name !== HISTORY_ARCHIVE_BRANCH),
			}),
		},
	);
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
	model: Pick<Model, "manifest" | "selectedState" | "revision" | "sourceRef">,
	range: NamedRange,
) {
	const state = model.selectedState?.id;
	const ref = model.sourceRef?.ref;
	return historyQuery(
		vault,
		{ analysis: "refs", base: range.base, head: range.head, state, ref },
		{
			key: [
				"merge-base",
				ref,
				model.manifest.id,
				state,
				model.revision.digest,
				range.base,
				range.head,
			],
			/**
			 * Keep only the range.
			 * @param result The refs answer.
			 * @returns The range, or null.
			 */
			accept: (result): SourceRefsAnswer["range"] => result.range ?? null,
		},
	);
}

export {
	branchFootprintQuery,
	mergeBaseQuery,
	sourceRefsQuery,
	type BranchFootprintAnswer,
	type NamedRange,
	type SourceRefsAnswer,
};
