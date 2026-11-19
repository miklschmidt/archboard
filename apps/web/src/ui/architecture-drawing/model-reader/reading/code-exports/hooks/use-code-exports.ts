import { useQuery } from "@tanstack/react-query";
import { codeExportsQuery } from "#ui/architecture-drawing/model-reader/access/clients/code-exports.ts";
import type { ModelCodeReading } from "#ui/architecture-drawing/model-reader/reading/hooks/use-model-code-findings.ts";

/**
 * Read the exports of one module that the pass on screen counted, from the server's memory. It
 * never starts a pass (ADR 0046), and it reads nothing for a module the pass counted no export of.
 * @param vault The vault of the reading.
 * @param reading The pass that read the reading on screen.
 * @param module The module.
 * @param wanted Whether the pass counted an export of the module.
 * @returns The read.
 */
function useCodeExports(vault: string, reading: ModelCodeReading, module: string, wanted: boolean) {
	const { model, state, checkedAt } = reading;
	const revision = reading.revision.digest;
	return useQuery({
		...codeExportsQuery(vault, { model, state, revision, checkedAt, module }),
		enabled: wanted,
	});
}

export { useCodeExports };
