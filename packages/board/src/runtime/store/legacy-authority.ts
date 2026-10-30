import { existsSync } from "node:fs";
import { join } from "node:path";
import { modelBoundaryFailure } from "#runtime/store/model-state.ts";
/**
 * Keep legacy readers and writers behind the same installation authority.
 * @param vault The explicitly addressed vault.
 * @returns Its refusal, or absence for legacy authority.
 */
function legacyAuthorityProblem(vault: string): string | undefined {
	const blocked = modelBoundaryFailure(vault);
	if (blocked !== undefined) return `${blocked.code}: ${blocked.diagnostics[0]!.recovery}`;
	if (existsSync(join(vault, "model.json")))
		return "CANONICAL_AUTHORITY: Read and author this vault through model commands. Open former board addresses through the installed migration map.";
	return undefined;
}
export { legacyAuthorityProblem };
