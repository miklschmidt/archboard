// A definition that compose merges from several blocks (ADR 0046,
// TASK-367.20): an override file's `services.web` block adds to the
// `services.web` of the file it overrides, and so does a later YAML document
// of one file, so a part bound to the service owns each of its blocks in the
// project (compose-project.ts).

import path from "node:path";
import {
	COMPOSE_FILE_NAMES,
	projectFiles,
} from "#runtime/operations/code-facts/compose/compose-project.ts";
import type { Definition } from "#runtime/operations/code-facts/facts.ts";
import type { CheckoutFiles } from "#runtime/operations/code-facts/modules/module-resolution.ts";
import type { FactsPass } from "#runtime/services/code-facts/reader.ts";

/**
 * The other blocks of a definition that a file's tool merges with it: each
 * block of the same symbol in the files merged with the file, and in the
 * file's later documents. The file's first block is the definition itself,
 * as a symbol finds it.
 * @param pass The pass.
 * @param checkout The checkout and the files the pass may read.
 * @param file The file that defines it, relative to the checkout.
 * @param symbol The definition's whole symbol, such as `services.web`.
 * @returns Each other block, in merge order; none for a file no tool merges.
 */
async function mergedDefinitions(
	pass: FactsPass,
	checkout: CheckoutFiles,
	file: string,
	symbol: string,
): Promise<{ readonly path: string; readonly definition: Definition }[]> {
	if (!COMPOSE_FILE_NAMES.includes(path.posix.basename(file))) return [];
	const project = projectFiles(checkout, file);
	const read = await Promise.all(project.map((each) => pass.read(checkout, each)));
	return read.flatMap((facts, index) => {
		if (facts === undefined || facts.adapter === "text") return [];
		const blocks = facts.definitions.filter((each) => each.symbol === symbol);
		const others = project[index] === file ? blocks.slice(1) : blocks;
		return others.map((definition) => ({ path: facts.path, definition }));
	});
}

export { mergedDefinitions };
