// An `#include` of a C, C++ or Objective-C file (ADR 0046, TASK-367.09): every
// name of the header in scope, and of every header it includes, as an import
// of `*`. Where a use leads is found through the includes in order
// (include-scope.ts).

import type { Node } from "web-tree-sitter";
import type { Import } from "#runtime/code-facts/operations/facts.ts";

/**
 * The path of an include as written: `ledger.h` for `"ledger.h"`, and
 * `<vector>` with its angle brackets.
 * @param path The include's path.
 * @returns The path, or undefined for an include of a macro.
 */
function includePath(path: Node | null): string | undefined {
	if (path?.type === "system_lib_string") return path.text;
	return path?.type === "string_literal" ? path.namedChildren[0]?.text : undefined;
}

/**
 * One `#include`: every name of the header in scope, under its path as
 * written, `<vector>` with its angle brackets.
 * @param node The include directive.
 * @returns The import, or undefined for an include of a macro.
 */
function includeOf(node: Node): Import | undefined {
	const specifier = includePath(node.childForFieldName("path"));
	if (specifier === undefined || specifier === "") return undefined;
	return {
		specifier,
		line: node.startPosition.row + 1,
		names: [{ imported: "*", local: "*", typeOnly: false }],
		typeOnly: false,
		reexport: false,
	};
}

export { includeOf };
