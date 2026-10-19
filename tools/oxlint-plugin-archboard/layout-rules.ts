// Rules about where a file sits and what it may contain: app entrypoints,
// mapped source paths, generic buckets, state purity, archive references and
// the TypeScript-only and inline-handler restrictions.
// oxlint-disable-next-line archboard/absolute-imports -- tools/ has no # imports; sibling imports stay relative
import { createRule, report, sourceImportVisitors, type AstNode, type NodeOf } from "./rule-api.ts";
import {
	getRepoRelativePath,
	hasGenericBucket,
	isEntrypoint,
	isFlatAppSource,
	isLegacyRoot,
	isProductSourcePath,
	isSourceFile,
	isStateFile,
	placementProblem,
	// oxlint-disable-next-line archboard/absolute-imports -- tools/ has no # imports; sibling imports stay relative
} from "./source-layout.ts";

const SIDE_EFFECT_IMPORTS = new Set([
	"node:child_process",
	"node:fs",
	"node:fs/promises",
	"node:process",
	"node:worker_threads",
	"child_process",
	"fs",
	"fs/promises",
]);

/**
 * A name that reads as a compatibility shim: `compat`, `compatibility` or `shim`
 * as a word of it, or `backward(s)` followed by one of the compat words. A
 * lone `backwards` is a direction, such as a relationship drawn backwards.
 */
const COMPATIBILITY_IDENTIFIER_PATTERN =
	/(?:^|_)(?:compat|compatibility|shim|backwards?_compat(?:ible|ibility)?)(?:$|_)/i;

const ARCHIVE_SEGMENT = /(?:^|[/\\])legacy(?:[/\\]|$)/u;

/** Callees for which a bare `"legacy"` argument names a filesystem path. */
const PATH_CALLEES = new Set([
	"join",
	"resolve",
	"URL",
	"static",
	"sendFile",
	"readFile",
	"readFileSync",
	"file",
]);

/**
 * Whether a declaration sits directly in the program or inside an `export`.
 * @param node The declaration node.
 * @returns Whether the declaration is top level.
 */
function isTopLevelDeclaration(node: AstNode): boolean {
	return node.parent?.type === "Program" || node.parent?.type === "ExportNamedDeclaration";
}

/**
 * Whether a variable initialiser is a function and the declaration is top level.
 * @param node The variable declarator.
 * @returns Whether it declares a top-level function value.
 */
function isTopLevelFunctionVariable(node: NodeOf<"VariableDeclarator">): boolean {
	return (
		(node.init?.type === "ArrowFunctionExpression" || node.init?.type === "FunctionExpression") &&
		node.parent.parent?.type === "Program"
	);
}

/**
 * Whether a file sits directly in an app's `src/` and is not a thin entrypoint.
 * @param relativePath The file's repository path.
 * @returns Whether the root-implementation rule refuses the file outright.
 */
function isFlatRootSource(relativePath: string): boolean {
	return isFlatAppSource(relativePath) && isSourceFile(relativePath) && !isEntrypoint(relativePath);
}

/**
 * The name a call is made through: `name(...)` or `object.name(...)`.
 * @param node The node whose parent may be a call.
 * @returns The callee name, or undefined when the parent is not such a call.
 */
function parentCalleeName(node: AstNode): string | undefined {
	const call = node.parent;
	if (call?.type !== "CallExpression" && call?.type !== "NewExpression") {
		return undefined;
	}
	return calleeName(call.callee);
}

/**
 * The name of a callee expression: the identifier itself or the member read.
 * @param callee The callee expression.
 * @returns The name, or undefined for computed or non-identifier callees.
 */
function calleeName(callee: NodeOf<"CallExpression">["callee"]): string | undefined {
	if (callee.type === "Identifier") {
		return callee.name;
	}
	if (callee.type !== "MemberExpression") {
		return undefined;
	}
	const { property } = callee;
	return property.type === "Identifier" || property.type === "PrivateIdentifier"
		? property.name
		: undefined;
}

/**
 * Whether a JSX attribute name is an event handler such as `onClick`.
 * @param name The attribute name node.
 * @returns Whether the name starts with `on` and a capital letter.
 */
function isEventHandlerName(name: NodeOf<"JSXAttribute">["name"]): boolean {
	return name.type === "JSXIdentifier" && /^on[A-Z]/.test(name.name);
}

/**
 * Whether a JSX attribute value is an inline function expression.
 * @param value The attribute value node, when present.
 * @returns Whether the value is an arrow or function expression.
 */
function isInlineFunction(value: NodeOf<"JSXAttribute">["value"]): boolean {
	if (value?.type !== "JSXExpressionContainer") {
		return false;
	}
	const { expression } = value;
	return expression.type === "ArrowFunctionExpression" || expression.type === "FunctionExpression";
}

/**
 * Whether a string literal is a Vite `fs.deny` entry in the Vite config; a
 * denial prohibits access and is not an active source reference.
 * @param filename The linted file's path.
 * @param node The string literal.
 * @returns Whether the literal is such an entry.
 */
function isViteDenyEntry(filename: string, node: NodeOf<"Literal">): boolean {
	const list = node.parent;
	const holder = list.parent;
	return (
		filename.endsWith("/vite.config.ts") &&
		list.type === "ArrayExpression" &&
		holder?.type === "Property" &&
		holder.key.type === "Identifier" &&
		holder.key.name === "deny"
	);
}

/**
 * Whether a string literal refers to the inert UI archive.
 * @param filename The linted file's path.
 * @param node The string literal.
 * @returns Whether the literal is an archive reference to report.
 */
function isArchiveReference(filename: string, node: NodeOf<"Literal">): boolean {
	if (typeof node.value !== "string" || !ARCHIVE_SEGMENT.test(node.value)) {
		return false;
	}
	if (isViteDenyEntry(filename, node)) {
		return false;
	}
	// A protocol value named legacy is not a filesystem reference.
	if (node.value === "legacy") {
		const name = parentCalleeName(node);
		return name !== undefined && PATH_CALLEES.has(name);
	}
	return true;
}

const noAnonymousJsxHandlers = createRule(
	{
		noInlineHandler: "Do not use anonymous inline JSX event handlers.",
	},
	(context) => ({
		/**
		 * Report an event-handler attribute whose value is an inline function.
		 * @param node The visited node.
		 */
		JSXAttribute(node) {
			if (isEventHandlerName(node.name) && isInlineFunction(node.value)) {
				report(context, node, "noInlineHandler");
			}
		},
	}),
);

const stateFilesPure = createRule(
	{
		noSideEffectImport: "State files must not import side-effectful runtime modules.",
	},
	(context) => {
		const relativePath = getRepoRelativePath(context);
		if (!isStateFile(relativePath)) {
			return {};
		}

		return sourceImportVisitors((source, node) => {
			if (SIDE_EFFECT_IMPORTS.has(source)) {
				report(context, node, "noSideEffectImport");
			}
		});
	},
);

const rootImplementationModules = createRule(
	{
		noRootImplementation:
			"The files directly in an app's src are reserved for thin binary, server and browser entrypoints.",
		noEntrypointImplementation:
			"Entrypoints may contain startup wiring, not function or class implementations.",
	},
	(context) => {
		const relativePath = getRepoRelativePath(context);
		if (isEntrypoint(relativePath)) {
			return {
				/**
				 * Report a top-level function in a thin entrypoint.
				 * @param node The visited node.
				 */
				FunctionDeclaration(node) {
					if (isTopLevelDeclaration(node)) {
						report(context, node, "noEntrypointImplementation");
					}
				},
				/**
				 * Report a top-level class in a thin entrypoint.
				 * @param node The visited node.
				 */
				ClassDeclaration(node) {
					if (isTopLevelDeclaration(node)) {
						report(context, node, "noEntrypointImplementation");
					}
				},
				/**
				 * Report a top-level function-valued variable in a thin entrypoint.
				 * @param node The visited node.
				 */
				VariableDeclarator(node) {
					if (isTopLevelFunctionVariable(node)) {
						report(context, node, "noEntrypointImplementation");
					}
				},
			};
		}
		if (isFlatRootSource(relativePath)) {
			return {
				/**
				 * Report the whole file: flat root source is not an entrypoint.
				 * @param node The visited node.
				 */
				Program(node) {
					report(context, node, "noRootImplementation");
				},
			};
		}
		return {};
	},
);

/**
 * The mapped-source-paths message a file earns, if any.
 * @param relativePath The file's repository path.
 * @returns The message id, or undefined when the file is placed correctly.
 */
function unmappedSourceMessage(relativePath: string): string | undefined {
	if (isLegacyRoot(relativePath)) {
		return "noLegacyRoot";
	}
	const problem = placementProblem(relativePath);
	if (problem === undefined) {
		return undefined;
	}
	return problem === "legacy-root" ? "noLegacyAppRoot" : "noUnmappedPath";
}

const mappedSourcePaths = createRule(
	{
		noLegacyRoot:
			"The top-level src/ and frontend/ folders are gone. Source belongs in packages/<name>/src or apps/<name>/src.",
		noLegacyAppRoot:
			"An app keeps source in apps/<name>/src and tests in apps/<name>/tests, never in a legacy root such as frontend or lib.",
		noUnmappedPath:
			"Source in an app lives in a role folder of an area (cli, runtime, server, shared or ui) under src/<area>/. Only the thin entrypoints of an app sit directly in its src.",
	},
	(context) => {
		const relativePath = getRepoRelativePath(context);
		const messageId = isSourceFile(relativePath) ? unmappedSourceMessage(relativePath) : undefined;
		if (!messageId) {
			return {};
		}

		return {
			/**
			 * Report the whole file: it sits outside the mapped layout.
			 * @param node The visited node.
			 */
			Program(node) {
				report(context, node, messageId);
			},
		};
	},
);

const noCatchAllExports = createRule(
	{
		noCatchAllExport:
			"Do not use catch-all export barrels; entrypoints must use explicit named exports.",
	},
	(context) => ({
		/**
		 * Report every `export * from` barrel.
		 * @param node The visited node.
		 */
		ExportAllDeclaration(node) {
			report(context, node, "noCatchAllExport");
		},
	}),
);

const noGenericBuckets = createRule(
	{
		noGenericBucket:
			"Do not put source in compatibility, core, lib, migration, misc, or utils folders; name the role of the folder.",
	},
	(context) => {
		const relativePath = getRepoRelativePath(context);
		if (!isProductSourcePath(relativePath) || !hasGenericBucket(relativePath)) {
			return {};
		}

		return {
			/**
			 * Report the whole file: its path passes through a generic bucket.
			 * @param node The visited node.
			 */
			Program(node) {
				report(context, node, "noGenericBucket");
			},
		};
	},
);

const noCompatibilityIdentifiers = createRule(
	{
		noCompatibilityIdentifier:
			"Do not keep compatibility or shim identifiers in source; update callers to the current contract.",
	},
	(context) => {
		const relativePath = getRepoRelativePath(context);
		if (!isProductSourcePath(relativePath)) {
			return {};
		}

		/**
		 * Report a node whose name or string value reads as a compatibility shim.
		 * @param node The identifier or literal.
		 * @param name The identifier name or string value.
		 */
		function checkName(node: AstNode, name: string): void {
			if (COMPATIBILITY_IDENTIFIER_PATTERN.test(name)) {
				report(context, node, "noCompatibilityIdentifier");
			}
		}

		return {
			/**
			 * Check every identifier name.
			 * @param node The visited node.
			 */
			Identifier(node) {
				checkName(node, node.name);
			},
			/**
			 * Check every string literal value.
			 * @param node The visited node.
			 */
			Literal(node) {
				if (typeof node.value === "string") {
					checkName(node, node.value);
				}
			},
		};
	},
);

const noArchiveReferences = createRule(
	{
		archived:
			"The local UI archive is inert. Restore required code into an active module under strict checks; never import, load, build or serve the archive.",
	},
	(context) => ({
		/**
		 * Report a string literal that names the archive.
		 * @param node The visited node.
		 */
		Literal(node) {
			if (isArchiveReference(context.filename, node)) {
				context.report({ node, messageId: "archived" });
			}
		},
		/**
		 * Report a template chunk that names the archive.
		 * @param node The visited node.
		 */
		TemplateElement(node) {
			if (ARCHIVE_SEGMENT.test(node.value.raw)) {
				context.report({ node, messageId: "archived" });
			}
		},
	}),
);

const typescriptSource = createRule(
	{
		useTypeScript:
			"Author UI source in TypeScript (.ts/.tsx); JavaScript source files are not allowed.",
	},
	(context) => ({
		/**
		 * Report the whole file when its extension is a JavaScript one.
		 * @param node The visited node.
		 */
		Program(node) {
			if (/\.[cm]?jsx?$/.test(context.filename)) report(context, node, "useTypeScript");
		},
	}),
);

export {
	mappedSourcePaths,
	noAnonymousJsxHandlers,
	noArchiveReferences,
	noCatchAllExports,
	noCompatibilityIdentifiers,
	noGenericBuckets,
	rootImplementationModules,
	stateFilesPure,
	typescriptSource,
};
