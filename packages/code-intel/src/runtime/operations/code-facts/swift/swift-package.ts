// What `Package.swift` declares (ADR 0046, TASK-367.12), read from its syntax
// tree and never run. A manifest is Swift code, and only a build evaluates
// it, so the check reads what it spells out: each target factory call
// (`.target(name: "Core", dependencies: ["Util"], path: "Sources/Core")`) and
// each library product. A name, a path or a dependency the manifest computes
// is not read.
//
// The facts of a manifest are those of any Swift file, and beside them each
// target is a definition (its visibility is its kind, such as `target` or
// `testTarget`, and it is exposed when a library product names it) and each
// dependency of a target is a `build-dependency` use of the name it names,
// on the line it names it. The resolver reads the package from these facts
// (swift-resolution.ts).

import type { Node, Tree } from "web-tree-sitter";
import type { Definition, ParsedFacts, Reference } from "#runtime/operations/code-facts/facts.ts";
import type { Grammar } from "#runtime/services/code-facts/grammars.ts";
import { swiftFacts } from "#runtime/operations/code-facts/swift/swift-adapter.ts";

/** The calls that declare a target, by the name of the factory. */
const TARGET_KINDS = new Set([
	"target",
	"executableTarget",
	"testTarget",
	"macro",
	"plugin",
	"systemLibrary",
	"binaryTarget",
]);

/** The calls in a target's dependencies that name a target or a product. */
const DEPENDENCY_KINDS = new Set(["target", "byName", "product"]);

/** One dependency of a target: the target or product it names, and its line. */
interface SwiftDependency {
	readonly name: string;
	readonly line: number;
}

/** One target a manifest declares. */
interface SwiftTarget {
	readonly name: string;
	/** The factory: `target`, `executableTarget`, `testTarget` and so on. */
	readonly kind: string;
	readonly start: number;
	readonly end: number;
	/** The directory `path:` names, relative to the package. */
	readonly path?: string;
	readonly dependencies: readonly SwiftDependency[];
}

/** What one manifest declares. */
interface SwiftPackage {
	readonly targets: readonly SwiftTarget[];
	/** The targets some library product names. */
	readonly libraries: readonly string[];
}

/** The facts of a manifest, with the package it declares. */
type ManifestFacts = ParsedFacts & { readonly package: SwiftPackage };

/**
 * The text of a string literal with no interpolation.
 * @param node The node.
 * @returns The text, or undefined for anything else.
 */
function literal(node: Node | null | undefined): string | undefined {
	if (node?.type !== "line_string_literal") return undefined;
	const parts = node.namedChildren;
	return parts.every((part) => part.type === "line_str_text")
		? parts.map((part) => part.text).join("")
		: undefined;
}

/**
 * The name `.target` spells.
 * @param callee The callee, a prefix expression.
 * @returns The name after the `.`.
 */
function implicitMember(callee: Node): string | undefined {
	return callee.childForFieldName("target")?.text;
}

/**
 * The name `Target.target` spells.
 * @param callee The callee, a navigation.
 * @returns The name after the `.`.
 */
function explicitMember(callee: Node): string | undefined {
	return callee.childForFieldName("suffix")?.childForFieldName("suffix")?.text;
}

/** Where the name of a factory is, by how the call spells it. */
const FACTORY_NAME: Readonly<Record<string, (callee: Node) => string | undefined>> = {
	prefix_expression: implicitMember,
	navigation_expression: explicitMember,
};

/**
 * The factory a call names: `.target(...)` or `Target.target(...)`.
 * @param call The call.
 * @returns The factory's name, or undefined.
 */
function factoryOf(call: Node): string | undefined {
	const callee = call.namedChildren[0];
	return callee === undefined ? undefined : FACTORY_NAME[callee.type]?.(callee);
}

/**
 * The arguments of a call, by their labels.
 * @param call The call.
 * @returns Each labelled argument's value.
 */
function argumentsOf(call: Node): Map<string, Node> {
	const suffix = call.namedChildren.find((child) => child.type === "call_suffix");
	const values = suffix?.namedChildren.find((child) => child.type === "value_arguments");
	return new Map(
		(values?.namedChildren ?? []).flatMap((argument) => {
			const label = argument.childForFieldName("name");
			const value = argument.childForFieldName("value");
			return label === null || value === null ? [] : [[label.text, value] as const];
		}),
	);
}

/**
 * The strings an array literal holds.
 * @param array The array.
 * @returns Each string and its node.
 */
function elementsOf(array: Node | undefined): Node[] {
	return array?.type === "array_literal" ? array.childrenForFieldName("element") : [];
}

/**
 * One dependency of a target: a name, `.target(name:)`, `.byName(name:)` or
 * `.product(name:package:)`.
 * @param element An element of the dependencies.
 * @returns The dependency, or undefined for one the manifest computes.
 */
function dependencyOf(element: Node): SwiftDependency | undefined {
	const line = element.startPosition.row + 1;
	const name = literal(element);
	if (name !== undefined) return { name, line };
	if (element.type !== "call_expression") return undefined;
	const factory = factoryOf(element) ?? "";
	const named = literal(argumentsOf(element).get("name"));
	if (!DEPENDENCY_KINDS.has(factory) || named === undefined) return undefined;
	return { name: named, line };
}

/** The arguments whose calls name a target or a product rather than declare a target. */
const NOT_TARGETS = new Set(["dependencies", "products"]);

/**
 * Whether a call stands among the dependencies of a target or of the package,
 * or among its products: `.plugin(name:targets:)` is a product there.
 * @param call The call.
 * @returns True when such an argument holds it.
 */
function namesOthers(call: Node): boolean {
	for (let at = call.parent; at !== null; at = at.parent) {
		const label = at.type === "value_argument" ? at.childForFieldName("name")?.text : undefined;
		if (label !== undefined && NOT_TARGETS.has(label)) return true;
	}
	return false;
}

/**
 * The target one call declares.
 * @param call A call.
 * @returns The target, or undefined when the call declares none.
 */
function targetOf(call: Node): SwiftTarget | undefined {
	const kind = factoryOf(call);
	if (kind === undefined || !TARGET_KINDS.has(kind) || namesOthers(call)) return undefined;
	const named = argumentsOf(call);
	const name = literal(named.get("name"));
	if (name === undefined) return undefined;
	const path = literal(named.get("path"));
	return {
		name,
		kind,
		start: call.startPosition.row + 1,
		end: call.endPosition.row + 1,
		...(path === undefined ? {} : { path }),
		dependencies: elementsOf(named.get("dependencies")).flatMap(
			(element) => dependencyOf(element) ?? [],
		),
	};
}

/**
 * What a manifest declares.
 * @param root The manifest's syntax tree.
 * @returns The package.
 */
function packageOf(root: Node): SwiftPackage {
	const calls = root.descendantsOfType("call_expression");
	const targets = calls.flatMap((call) => targetOf(call) ?? []);
	const libraries = calls.flatMap((call) =>
		factoryOf(call) === "library"
			? elementsOf(argumentsOf(call).get("targets")).flatMap((element) => literal(element) ?? [])
			: [],
	);
	return { targets, libraries };
}

/**
 * The facts of a manifest: those of its Swift, its targets as definitions and
 * their dependencies as build-dependency uses.
 * @param tree The manifest's syntax tree.
 * @param grammar The grammar it was parsed with.
 * @returns Its facts, with the package it declares.
 */
function manifestFacts(tree: Tree, grammar: Grammar): ManifestFacts {
	const code = swiftFacts(tree, grammar);
	const declared = packageOf(tree.rootNode);
	const libraries = new Set(declared.libraries);
	const definitions = declared.targets.map((target): Definition => ({
		symbol: target.name,
		kind: "value",
		start: target.start,
		end: target.end,
		visibility: target.kind,
		exposed: libraries.has(target.name),
	}));
	const references = declared.targets.flatMap((target) =>
		target.dependencies.map((dependency): Reference => ({
			symbol: dependency.name,
			line: dependency.line,
			via: "code",
			kind: "build-dependency",
			typeOnly: false,
		})),
	);
	return {
		...code,
		definitions: [...code.definitions, ...definitions],
		references: [...code.references, ...references],
		package: declared,
	};
}

/**
 * Whether facts are a manifest's.
 * @param facts The facts a file gave.
 * @returns True for the facts of a `Package.swift`.
 */
function isManifest(facts: ParsedFacts): facts is ManifestFacts {
	return "package" in facts;
}

export { type SwiftPackage, type SwiftTarget, isManifest, manifestFacts };
