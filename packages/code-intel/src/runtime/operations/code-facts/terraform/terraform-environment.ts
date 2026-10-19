// The environment values a Terraform or OpenTofu resource sets for the code it
// runs (ADR 0046, TASK-367.23): each name is a reference by `environment`, at
// the line that gives its value, where the references of that value stand
// too. The code check joins it with the code that reads the name.
//
// The check reads the shapes the providers in common use share, by their
// names and never by provider:
//
// - a map under `variables` in an `environment` block: `aws_lambda_function`;
// - a map in an `environment_variables`, `runtime_environment_variables` or
//   `app_settings` argument: Google Cloud Functions, AWS App Runner, Azure
//   App Service and Functions, and the containers of an Azure container group;
// - an `env` block with a literal `name` and a `value`: Google Cloud Run and
//   the containers of the `kubernetes` provider.
//
// A name another expression computes, and a value inside an encoded string
// such as an ECS `container_definitions = jsonencode(...)`, are not read.
//
// The same shapes say which references in a resource are environment values,
// which the rules of every provider make configured paths
// (terraform-providers.ts).

import type { Node } from "web-tree-sitter";
import type { Reference } from "#runtime/operations/code-facts/facts.ts";

/** The arguments whose map is the environment, wherever they stand in a block. */
const ENVIRONMENT_MAPS = new Set([
	"environment_variables",
	"runtime_environment_variables",
	"app_settings",
]);

/** The block whose `variables` map is the environment. */
const ENVIRONMENT_BLOCK = { block: "environment", map: "variables" } as const;

/** The block that sets one environment value: its literal name and its value. */
const ENV_BLOCK = { block: "env", name: "name", value: "value" } as const;

/**
 * Whether an argument of a resource is one of its environment values, in the
 * shapes this file reads.
 * @param argument The argument's path, outermost name first, such as
 * `environment.variables` or `template.containers.env.value`.
 * @returns True when it is.
 */
function isEnvironmentArgument(argument: readonly string[]): boolean {
	return argument.some(
		(name, index) =>
			ENVIRONMENT_MAPS.has(name) ||
			(name === ENVIRONMENT_BLOCK.block && argument[index + 1] === ENVIRONMENT_BLOCK.map) ||
			(name === ENV_BLOCK.block &&
				argument[index + 1] === ENV_BLOCK.value &&
				index + 2 === argument.length),
	);
}

/** A string with no interpolation and no directive. */
const LITERAL = /^"((?:[^"\\$%]|\\.)*)"$/u;

/**
 * A block's name and its body.
 * @param block The block.
 * @returns Its first identifier and its body.
 */
function blockParts(block: Node): { readonly kind: string; readonly body: Node | undefined } {
	const [kind] = block.namedChildren;
	return {
		kind: kind?.type === "identifier" ? kind.text : "",
		body: block.namedChildren.find((node) => node.type === "body"),
	};
}

/**
 * The attributes and blocks directly in a body.
 * @param body The body.
 * @returns Each attribute with its name and value, and each block.
 */
function membersOf(body: Node | undefined) {
	const children = body?.namedChildren ?? [];
	return {
		attributes: children.flatMap((node) => {
			const [name, value] = node.type === "attribute" ? node.namedChildren : [];
			return name === undefined || value === undefined ? [] : [{ name: name.text, value }];
		}),
		blocks: children.filter((node) => node.type === "block"),
	};
}

/**
 * The name a key of a map writes: a bare name, or a literal string.
 * @param key The key's expression.
 * @returns The name, or undefined for a key another expression computes.
 */
function keyName(key: Node): string | undefined {
	const [inner] = key.namedChildren;
	if (inner?.type === "variable_expr" && inner.namedChildren.length === 1) return inner.text;
	return LITERAL.exec(key.text.trim())?.[1];
}

/**
 * One environment name, at a line.
 * @param symbol The name.
 * @param at The node whose first line gives the value.
 * @returns The reference.
 */
function named(symbol: string, at: Node): Reference {
	return { symbol, line: at.startPosition.row + 1, via: "environment", typeOnly: false };
}

/**
 * The names a map sets, each at the line of its item.
 * @param value The map's expression.
 * @returns One reference per key it writes.
 */
function mapNames(value: Node): Reference[] {
	const object = value.descendantsOfType("object")[0];
	return (object?.namedChildren ?? []).flatMap((item) => {
		const [key] = item.type === "object_elem" ? item.namedChildren : [];
		const name = key === undefined ? undefined : keyName(key);
		return name === undefined ? [] : [named(name, item)];
	});
}

/**
 * The text a literal string writes.
 * @param value The string's expression, if any.
 * @returns The text, or undefined for anything else.
 */
function literalOf(value: Node | undefined): string | undefined {
	return value === undefined ? undefined : LITERAL.exec(value.text.trim())?.[1];
}

/**
 * The name an `env` block sets, at the line of its value.
 * @param body The block's body.
 * @returns The reference, or none for a name another expression computes.
 */
function envBlockName(body: Node | undefined): Reference[] {
	const values = new Map(membersOf(body).attributes.map((each) => [each.name, each.value]));
	const name = values.get(ENV_BLOCK.name);
	const literal = literalOf(name);
	const at = values.get(ENV_BLOCK.value) ?? name;
	return literal === undefined || at === undefined ? [] : [named(literal, at)];
}

/**
 * The environment names a body sets, in it and in every block inside it.
 * @param body The body.
 * @param holder The name of the block that holds it.
 * @returns The references.
 */
function namesIn(body: Node | undefined, holder: string): Reference[] {
	const { attributes, blocks } = membersOf(body);
	const maps = attributes.filter(
		(each) =>
			ENVIRONMENT_MAPS.has(each.name) ||
			(holder === ENVIRONMENT_BLOCK.block && each.name === ENVIRONMENT_BLOCK.map),
	);
	return [
		...maps.flatMap((each) => mapNames(each.value)),
		...blocks.flatMap((block) => {
			const { kind, body: inner } = blockParts(block);
			return kind === ENV_BLOCK.block ? envBlockName(inner) : namesIn(inner, kind);
		}),
	];
}

/**
 * The environment values a top-level resource block sets.
 * @param block A top-level block.
 * @returns One reference per name; none for any other kind of block.
 */
function environmentOf(block: Node): Reference[] {
	const { kind, body } = blockParts(block);
	return kind === "resource" ? namesIn(body, kind) : [];
}

export { environmentOf, isEnvironmentArgument };
