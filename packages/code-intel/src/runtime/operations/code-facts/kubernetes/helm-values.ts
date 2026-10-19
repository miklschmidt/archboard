// A Helm chart exposes the keys of values.yaml (ADR 0044, TASK-436.08).
// Facts keep their dotted paths and source spans, never their default values.
// The adapter is selected only where Chart.yaml identifies the chart.

import path from "node:path";
import {
	yamlLines,
	type YamlLines,
	type YamlPath,
} from "#runtime/operations/code-facts/compose/compose-lines.ts";
import type { Definition, ParsedFacts } from "#runtime/operations/code-facts/facts.ts";
import { isMapping } from "#runtime/operations/code-facts/kubernetes/kubernetes-values.ts";
import type { CheckoutFiles } from "#runtime/operations/code-facts/modules/module-resolution.ts";

/**
 * Whether a values file belongs to a chart.
 * @param checkout The checkout's files.
 * @param file The values file.
 * @returns True where Chart.yaml is beside it.
 */
function isHelmValues(checkout: CheckoutFiles, file: string): boolean {
	return (
		path.posix.basename(file) === "values.yaml" &&
		checkout.files.has(path.posix.join(path.posix.dirname(file), "Chart.yaml"))
	);
}

/**
 * The keys of a mapping, including the paths below each mapping it holds.
 * @param value The mapping's value.
 * @param at Its path from the top.
 * @param lines The file's source spans.
 * @param above Mapping values already on this path, to end a recursive YAML alias.
 * @returns Its definitions.
 */
function keysOf(
	value: unknown,
	at: YamlPath,
	lines: YamlLines,
	above: ReadonlySet<unknown>,
): Definition[] {
	if (!isMapping(value) || above.has(value)) return [];
	const seen = new Set([...above, value]);
	return Object.entries(value).flatMap(([name, child]) => {
		const key = [...at, name];
		const span = lines.spanOf(0, key);
		const own: Definition[] =
			span === undefined
				? []
				: [
						{
							symbol: key.join("."),
							kind: "value",
							start: span.start,
							end: span.end,
							visibility: "value",
							exposed: true,
						},
					];
		return [...own, ...keysOf(child, key, lines, seen)];
	});
}

/**
 * A chart's values as exposed names, or a parse skip with only key names.
 * @param text The file's text.
 * @returns Its facts.
 */
function helmValuesFacts(text: string): ParsedFacts {
	const lines = yamlLines(text);
	try {
		const value: unknown = Bun.YAML.parse(text);
		return {
			definitions: keysOf(value, [], lines, new Set()),
			references: [],
			imports: [],
			unparsed: [],
		};
	} catch {
		return {
			definitions: [],
			references: [],
			imports: [],
			unparsed: [{ start: 1, end: text.split("\n").length, names: lines.names }],
		};
	}
}

export { helmValuesFacts, isHelmValues };
