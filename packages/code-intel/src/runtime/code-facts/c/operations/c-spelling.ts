// How C++ spells a name (ADR 0046, TASK-367.09): the names of a qualified one
// joined by `::`, with no template arguments and no spaces, as the
// definitions qualify a name and the references spell a use.

import type { Node } from "web-tree-sitter";

/**
 * How C++ spells a name with a qualifier: its scope and its name joined by `::`.
 * @param node The qualified name.
 * @returns The spelling.
 */
function spellQualified(node: Node): string {
	const scope = node.childForFieldName("scope");
	const name = node.childForFieldName("name");
	const rest = name === null ? "" : spell(name);
	return scope === null ? rest : `${spell(scope)}::${rest}`;
}

/**
 * How C++ spells a template's name: without its arguments.
 * @param node The template type, function or method.
 * @returns The spelling.
 */
function spellTemplate(node: Node): string {
	const name = node.childForFieldName("name");
	return name === null ? node.text : spell(name);
}

/** How each kind of qualified name is spelled. */
const SPELLINGS: Readonly<Record<string, (node: Node) => string>> = {
	qualified_identifier: spellQualified,
	template_type: spellTemplate,
	template_function: spellTemplate,
	template_method: spellTemplate,
};

/**
 * How C++ spells a name: the names of a qualified one joined by `::`, with
 * no template arguments and no spaces.
 * @param node The name.
 * @returns The spelling.
 */
function spell(node: Node): string {
	return SPELLINGS[node.type]?.(node) ?? node.text.replaceAll(/\s+/gu, "");
}

export { spell };
