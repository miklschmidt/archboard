// The frontend concern placement and naming rules of docs/agents/frontend.md,
// for authored source under src/ui/<module>. A module keeps its concerns in
// named private folders, components are PascalCase, hooks are use-prefixed
// kebab-case, and everything else is scoped kebab-case. React lives in
// components and hooks; a module's root files are its public interface and may
// hold an intentionally public component, hook or API.
import {
	createRule,
	report,
	type RuleContext,
	type RuleVisitors,
	type VisitedNode,
	// oxlint-disable-next-line archboard/absolute-imports -- tools/ has no alias root; @/ resolves only into src/
} from "./rule-api.ts";
import {
	getRepoRelativePath,
	moduleAt,
	// oxlint-disable-next-line archboard/absolute-imports -- tools/ has no alias root; @/ resolves only into src/
} from "./source-layout.ts";

/** The concern folders a UI module may keep private implementation in. */
const CONCERN_FOLDERS = new Set(["api", "components", "hooks", "lib", "state", "tests", "types"]);

/** The concerns whose files are plain scoped kebab-case, not components or hooks. */
const SCOPED_CONCERNS = new Set(["api", "lib", "state", "types"]);

/** The extensions this rule names; JavaScript is refused by `typescript-source`. */
const TYPESCRIPT_SOURCE = /\.tsx?$/u;

const PASCAL_CASE = /^[A-Z][A-Za-z0-9]*\.tsx?$/u;
const KEBAB_CASE = /^[a-z0-9]+(?:-[a-z0-9]+)*\.tsx?$/u;
const HOOK_FILE = /^use-[a-z0-9]+(?:-[a-z0-9]+)*\.tsx?$/u;
const HOOK_NAME = /^use[A-Z]/u;

/** Where one authored UI file sits: its module-private concern and its name. */
interface UiFilePlacement {
	/** The concern folder, or "" for a file at the module root. */
	concern: string;
	basename: string;
}

/**
 * Whether the rule owns a file at all: authored TypeScript in a UI module,
 * outside the test owner, which names its files after the contract it tests.
 * @param relativePath The file's repository path.
 * @returns Whether the placement rules apply.
 */
function isAuthoredUiSource(relativePath: string): boolean {
	const module = moduleAt(relativePath);
	if (module?.area !== "ui" || !TYPESCRIPT_SOURCE.test(relativePath)) {
		return false;
	}
	if (relativePath.endsWith(".d.ts")) {
		return false;
	}
	return !module.rest.startsWith("tests/") && module.rest !== "tests";
}

/**
 * Where an authored UI file sits inside its module.
 * @param relativePath The file's repository path.
 * @returns The placement, or undefined when the rule does not own the file.
 */
function uiPlacementOf(relativePath: string): UiFilePlacement | undefined {
	const module = moduleAt(relativePath);
	if (!module || !isAuthoredUiSource(relativePath)) {
		return undefined;
	}
	const segments = module.rest.split("/");
	const concern = segments.length > 1 ? segments[0] : "";
	return { concern: concern ?? "", basename: segments.at(-1) ?? "" };
}

/**
 * The naming message a module-root file's basename earns. Root files are the
 * module's public interface: `index` keeps its conventional name, a component
 * is PascalCase, and everything else is scoped kebab-case.
 * @param basename The file's name.
 * @returns The message id, or undefined when the name is right.
 */
function rootNamingMessage(basename: string): string | undefined {
	if (basename === "index.ts" || basename === "index.tsx") {
		return undefined;
	}
	if (basename.endsWith(".tsx")) {
		return PASCAL_CASE.test(basename) ? undefined : "rootComponentFileName";
	}
	return KEBAB_CASE.test(basename) ? undefined : "scopedFileName";
}

/**
 * The naming message a scoped concern's basename earns.
 * @param basename The file's name.
 * @returns The message id, or undefined when the name is right.
 */
function scopedNamingMessage(basename: string): string | undefined {
	if (basename.startsWith("use-")) {
		return "hookOutsideHooks";
	}
	return KEBAB_CASE.test(basename) ? undefined : "scopedFileName";
}

/**
 * The naming message a file's basename earns where it sits.
 * @param placement The file's concern and name.
 * @returns The message id, or undefined when the name is right.
 */
function namingMessage(placement: UiFilePlacement): string | undefined {
	const { concern, basename } = placement;
	if (concern === "components") {
		return PASCAL_CASE.test(basename) ? undefined : "componentFileName";
	}
	if (concern === "hooks") {
		return HOOK_FILE.test(basename) ? undefined : "hookFileName";
	}
	return SCOPED_CONCERNS.has(concern) ? scopedNamingMessage(basename) : rootNamingMessage(basename);
}

/**
 * The message ids a file earns for where it sits and what it is named.
 * @param placement The file's concern and name.
 * @returns The message ids in report order.
 */
function placementMessages(placement: UiFilePlacement): string[] {
	const messages: string[] = [];
	if (placement.concern !== "" && !CONCERN_FOLDERS.has(placement.concern)) {
		messages.push("unknownConcern");
		return messages;
	}
	const naming = namingMessage(placement);
	if (naming) {
		messages.push(naming);
	}
	return messages;
}

/**
 * Whether React markup may be written in a file at this placement.
 * @param placement The file's concern and name.
 * @returns True for the components concern and the module's own root files.
 */
function holdsMarkup(placement: UiFilePlacement): boolean {
	return placement.concern === "components" || placement.concern === "";
}

/**
 * Whether a React hook may be exported from a file at this placement.
 * @param placement The file's concern and name.
 * @returns True for the hooks concern and the module's own root files.
 */
function holdsHooks(placement: UiFilePlacement): boolean {
	return placement.concern === "hooks" || placement.concern === "";
}

/**
 * The visitors that report markup outside components and hook exports outside
 * hooks, plus the file's own placement messages.
 * @param context The rule context of the file being linted.
 * @param placement The file's concern and name.
 * @returns The visitor object.
 */
function concernVisitors(context: RuleContext, placement: UiFilePlacement): RuleVisitors {
	const messages = placementMessages(placement);
	const markupAllowed = holdsMarkup(placement);
	const hooksAllowed = holdsHooks(placement);
	let markupReported = false;
	return {
		/**
		 * Report the file's placement and naming problems once.
		 * @param node The visited node.
		 */
		Program(node) {
			for (const messageId of messages) {
				report(context, node, messageId);
			}
		},
		/**
		 * Report the first React element written outside a component file.
		 * @param node The visited node.
		 */
		JSXElement(node) {
			if (!markupAllowed && !markupReported) {
				markupReported = true;
				report(context, node, "markupOutsideComponents");
			}
		},
		/**
		 * Report the first React fragment written outside a component file.
		 * @param node The visited node.
		 */
		JSXFragment(node) {
			if (!markupAllowed && !markupReported) {
				markupReported = true;
				report(context, node, "markupOutsideComponents");
			}
		},
		/**
		 * Report a hook re-exported by name from a file that does not own hooks.
		 * @param node The visited node.
		 */
		ExportSpecifier(node) {
			const exported = node.exported;
			const name = exported.type === "Identifier" ? exported.name : null;
			if (!hooksAllowed && name !== null && HOOK_NAME.test(name)) {
				report(context, node, "hookOutsideHooks");
			}
		},
		/**
		 * Report a hook declared and exported in place by a file that does not
		 * own hooks, which no export specifier would name.
		 * @param node The visited node.
		 */
		ExportNamedDeclaration(node) {
			if (hooksAllowed) {
				return;
			}
			for (const name of exportedValueNames(node.declaration ?? null)) {
				if (HOOK_NAME.test(name)) {
					report(context, node, "hookOutsideHooks");
				}
			}
		},
	};
}

/** What an `export ...` declaration can bind, as the visitor receives it. */
type ExportedDeclaration = NonNullable<VisitedNode<"ExportNamedDeclaration">["declaration"]>;

/**
 * The value names one exported declaration binds: `export function useX`,
 * `export const useX =`, and every declarator of a multiple declaration.
 * @param declaration The exported declaration, when the export has one.
 * @returns The bound names, in source order.
 */
function exportedValueNames(declaration: ExportedDeclaration | null): string[] {
	if (declaration === null) {
		return [];
	}
	if (declaration.type === "VariableDeclaration") {
		return declaration.declarations
			.map((declarator) => (declarator.id.type === "Identifier" ? declarator.id.name : null))
			.filter((name): name is string => name !== null);
	}
	return declaredFunctionName(declaration);
}

/**
 * The name a function or class declaration binds, if it names one.
 * @param declaration The exported declaration.
 * @returns A one-name list, or none for any other declaration.
 */
function declaredFunctionName(declaration: ExportedDeclaration): string[] {
	if (declaration.type !== "FunctionDeclaration" && declaration.type !== "ClassDeclaration") {
		return [];
	}
	return declaration.id ? [declaration.id.name] : [];
}

const uiConcernPlacement = createRule(
	{
		unknownConcern:
			"A UI module keeps private code in api, components, hooks, lib, state, tests or types; name the concern the file belongs to.",
		componentFileName: "Name a component file in PascalCase after the component it exports.",
		hookFileName: "Name a hook file in kebab-case with a use- prefix.",
		scopedFileName: "Name a non-React file in scoped kebab-case.",
		rootComponentFileName:
			"A module-root component file is PascalCase; only index.tsx keeps its conventional name.",
		hookOutsideHooks:
			"React hooks belong to the module's hooks concern, or to an intentionally public module-root entrypoint.",
		markupOutsideComponents:
			"React markup belongs to the module's components concern, or to an intentionally public module-root entrypoint.",
	},
	(context) => {
		const placement = uiPlacementOf(getRepoRelativePath(context));
		return placement ? concernVisitors(context, placement) : {};
	},
);

/**
 * Whether a file is authored UI source, tests included: the React import
 * convention holds wherever UI source is written.
 * @param relativePath The file's repository path.
 * @returns Whether the named-import rule owns the file.
 */
function isAuthoredUiFile(relativePath: string): boolean {
	const module = moduleAt(relativePath);
	return module?.area === "ui" && TYPESCRIPT_SOURCE.test(relativePath);
}

/**
 * Whether an identifier is the local name a React import binds, which the
 * import visitor already reports; the same node must not be reported twice.
 * @param node The identifier.
 * @returns Whether an import specifier binds it.
 */
function isImportBinding(node: VisitedNode<"Identifier">): boolean {
	const parent = node.parent.type;
	return (
		parent === "ImportDefaultSpecifier" ||
		parent === "ImportNamespaceSpecifier" ||
		parent === "ImportSpecifier"
	);
}

const namedReactImports = createRule(
	{
		noReactNamespace:
			'Use named React imports, including types: import { useState, type JSX } from "react" rather than the React namespace.',
		noReactNamespaceImport:
			'Import from "react" by name. A default or namespace import binds the whole React namespace whatever it is called, which is what the named-import rule exists to prevent.',
	},
	(context) => {
		if (!isAuthoredUiFile(getRepoRelativePath(context))) {
			return {};
		}
		return {
			/**
			 * Report a default or namespace import of React, under any local name.
			 * @param node The visited node.
			 */
			ImportDeclaration(node) {
				if (node.source.value !== "react") {
					return;
				}
				for (const specifier of node.specifiers) {
					if (
						specifier.type === "ImportDefaultSpecifier" ||
						specifier.type === "ImportNamespaceSpecifier"
					) {
						report(context, specifier, "noReactNamespaceImport");
					}
				}
			},
			/**
			 * Report a value or type reached through the ambient React namespace,
			 * which needs no import at all.
			 * @param node The visited node.
			 */
			Identifier(node) {
				if (node.name === "React" && !isImportBinding(node)) {
					report(context, node, "noReactNamespace");
				}
			},
			/**
			 * Report React markup reached through the ambient React namespace.
			 * @param node The visited node.
			 */
			JSXIdentifier(node) {
				if (node.name === "React") {
					report(context, node, "noReactNamespace");
				}
			},
		};
	},
);

export { namedReactImports, uiConcernPlacement };
