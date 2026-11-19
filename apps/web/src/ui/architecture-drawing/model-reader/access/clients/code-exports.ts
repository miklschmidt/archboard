import { queryOptions } from "@tanstack/react-query";
import { CodeCheckAnswerSchema, type CodeCheckAnswer } from "@archboard/code-intel/code-check";
import { inVault } from "@archboard/server-requests";
import { architectureModelKeys } from "#ui/architecture-drawing/model-reader/access/clients/queries.ts";

/** One module the pass measured, with the names of its exports. */
type MeasuredModule = NonNullable<CodeCheckAnswer["depth"]>[number];

/** The answer of the route: the part of a code-check answer that measures modules, for one module. */
const MeasuredSchema = CodeCheckAnswerSchema.pick({ depth: true });

/** The pass whose exports of one module are asked for, by the reading it read and when it ran. */
interface ExportsOfPass {
	readonly model: string;
	readonly state: string | null;
	/** The digest of the version of the reading the pass read. */
	readonly revision: string;
	readonly checkedAt: string;
	readonly module: string;
}

/**
 * The exports of one module that one remembered code pass counted (TASK-646.08). The answer that
 * every canvas reads leaves the names out, so only the About page of a module reads them, for that
 * module alone. A pass counts its names once, so they stay as they are, and the next pass has its
 * own key. A 404 says that the server no longer remembers the pass, as after a restart.
 * @param vault The vault of the reading.
 * @param pass The pass and the module.
 * @returns The query options, whose data is the module with its exports, or null for a pass the
 * server forgot.
 */
function codeExportsQuery(vault: string, pass: ExportsOfPass) {
	const { model, state, revision, checkedAt, module } = pass;
	return queryOptions({
		queryKey: [
			...architectureModelKeys.vault(vault),
			"code-exports",
			model,
			state,
			revision,
			module,
			checkedAt,
		] as const,
		/**
		 * Read the exports.
		 * @param context The query cancellation signal.
		 * @returns The module, or null when the server remembers no such pass.
		 */
		queryFn: async (context): Promise<MeasuredModule | null> => {
			const parameters = new URLSearchParams({ model, revision, module });
			if (state !== null) parameters.set("state", state);
			const response = await fetch(`${inVault("/api/vault/code-exports", vault)}&${parameters}`, {
				signal: context.signal,
			});
			if (response.status === 404) return null;
			if (!response.ok) throw new Error(`The code exports could not be read (${response.status}).`);
			return MeasuredSchema.parse(await response.json()).depth?.[0] ?? null;
		},
		staleTime: Number.POSITIVE_INFINITY,
		retry: false,
	});
}

export { codeExportsQuery };
