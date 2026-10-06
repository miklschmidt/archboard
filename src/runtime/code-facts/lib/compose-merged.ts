// A definition that compose merges from several files (ADR 0046,
// TASK-367.20): an override file's `services.web` block adds to the
// `services.web` of the file it overrides, so a part bound to the service owns
// its block in every file of the project (compose-project.ts).

import { COMPOSE_FILE_NAMES, projectFiles } from "@/runtime/code-facts/lib/compose-project";
import type { Definition } from "@/runtime/code-facts/lib/facts";
import type { CheckoutFiles } from "@/runtime/code-facts/lib/module-resolution";
import type { FactsPass } from "@/runtime/code-facts/lib/reader";
import path from "node:path";

/**
 * The same definition in the other files that a file's tool merges with it.
 * @param pass The pass.
 * @param checkout The checkout and the files the pass may read.
 * @param file The file that defines it, relative to the checkout.
 * @param symbol The definition's whole symbol, such as `services.web`.
 * @returns Each other file's definition of it, in merge order; none for a file no tool merges.
 */
async function mergedDefinitions(
	pass: FactsPass,
	checkout: CheckoutFiles,
	file: string,
	symbol: string,
): Promise<{ readonly path: string; readonly definition: Definition }[]> {
	if (!COMPOSE_FILE_NAMES.includes(path.posix.basename(file))) return [];
	const others = projectFiles(checkout, file).filter((each) => each !== file);
	const read = await Promise.all(others.map((other) => pass.read(checkout, other)));
	return read.flatMap((facts) => {
		if (facts === undefined || facts.adapter === "text") return [];
		const definition = facts.definitions.find((each) => each.symbol === symbol);
		return definition === undefined ? [] : [{ path: facts.path, definition }];
	});
}

export { mergedDefinitions };
