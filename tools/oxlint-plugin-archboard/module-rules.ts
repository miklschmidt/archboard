// Rules about how files reach each other: area dependency directions, module
// root entrypoints, test ownership and the @/ alias spelling.
// oxlint-disable-next-line archboard/absolute-imports -- tools/ has no alias root; @/ resolves only into src/
import { createRule, report, sourceImportVisitors, type RuleContext } from "./rule-api.ts";
import {
	AREA_IMPORT_DENIALS,
	SOURCE_ALIAS_PREFIX,
	getRepoRelativePath,
	isModuleInternal,
	isSourceFile,
	isTestFile,
	isTypedTestSource,
	moduleAt,
	resolveSourcePath,
	sameModule,
	sameTestOwner,
	testOwnerAt,
	type SourceModule,
	type TestOwner,
	// oxlint-disable-next-line archboard/absolute-imports -- tools/ has no alias root; @/ resolves only into src/
} from "./source-layout.ts";

const importBoundaries = createRule(
	{
		noForbiddenAreaImport:
			"This import crosses a forbidden Archboard area dependency. Use the documented direction in docs/agents/boundaries.md.",
	},
	(context) => {
		const relativePath = getRepoRelativePath(context);
		const importer = moduleAt(relativePath);
		if (!importer) {
			return {};
		}

		return sourceImportVisitors((source, node) => {
			const importedPath = resolveSourcePath(context, relativePath, source);
			const imported = importedPath ? moduleAt(importedPath) : undefined;
			if (!imported || sameModule(importer, imported)) {
				return;
			}

			if (AREA_IMPORT_DENIALS[importer.area]?.has(imported.area)) {
				report(context, node, "noForbiddenAreaImport");
			}
		});
	},
);

/** What the module-entrypoints rule knows about the importing file. */
interface Importer {
	context: RuleContext;
	relativePath: string;
	module: SourceModule | undefined;
	owner: TestOwner | undefined;
}

/**
 * The message a test-owned import target earns: product code may not import
 * it at all, and tests may only import their own owner's support.
 * @param importer The importing file.
 * @param importedOwner The imported file's test owner.
 * @returns The message id, or undefined when the import is allowed.
 */
function testImportMessage(importer: Importer, importedOwner: TestOwner): string | undefined {
	if (!importer.owner) {
		return "noProductTestImport";
	}
	return sameTestOwner(importer.owner, importedOwner) ? undefined : "noCrossOwnerTestImport";
}

/**
 * The message a private (below-root) module file earns when imported.
 * @param importer The importing file.
 * @param imported The imported file's module.
 * @returns The message id, or undefined when the import stays inside one module.
 */
function deepImportMessage(importer: Importer, imported: SourceModule): string | undefined {
	if (importer.owner) {
		return "testsThroughEntrypoints";
	}
	if (!importer.module) {
		return "noDeepImportFromOutside";
	}
	return sameModule(importer.module, imported) ? undefined : "noDeepImportAcrossModules";
}

/**
 * The module-entrypoints message one import earns.
 * @param importer The importing file.
 * @param source The specifier as written.
 * @returns The message id, or undefined when the import is allowed.
 */
function entrypointMessage(importer: Importer, source: string): string | undefined {
	const importedPath = resolveSourcePath(importer.context, importer.relativePath, source);
	if (!importedPath) {
		return source.startsWith(SOURCE_ALIAS_PREFIX) ? "noUnresolvedSourceAlias" : undefined;
	}
	const importedOwner = testOwnerAt(importedPath);
	if (importedOwner) {
		return testImportMessage(importer, importedOwner);
	}
	const imported = moduleAt(importedPath);
	if (!imported || !isModuleInternal(imported)) {
		return undefined;
	}
	return deepImportMessage(importer, imported);
}

/**
 * The messages the importing file itself earns: a runnable test outside the
 * two owners, and test-owned source that the root program cannot type-check.
 * @param importer The importing file.
 * @returns The message ids in report order.
 */
function placementMessages(importer: Importer): string[] {
	const messages: string[] = [];
	if (isTestFile(importer.relativePath) && !importer.owner) {
		messages.push("noTestOutsideTestsDirectory");
	}
	if (
		importer.owner &&
		isSourceFile(importer.relativePath) &&
		!isTypedTestSource(importer.relativePath)
	) {
		messages.push("untypedTestSource");
	}
	return messages;
}

const moduleEntrypoints = createRule(
	{
		noDeepImportFromOutside:
			"Code outside a module may import only that module's root entrypoint files, never implementation subfolders.",
		noDeepImportAcrossModules:
			"Import another module through one of its root entrypoint files, not through its implementation subfolders.",
		noUnresolvedSourceAlias:
			"Canonical @/ imports must resolve to a source module entrypoint and stay inside src/.",
		noProductTestImport:
			"Product, scripts, and tools must not import test-owned source. Move shared behavior behind a product module root entrypoint.",
		noCrossOwnerTestImport:
			"Test-owned source may import helpers only from its own module tests folder or the tests/system owner.",
		noTestOutsideTestsDirectory:
			"Bun test files must live under src/<area>/<module>/tests or tests/system.",
		testsThroughEntrypoints:
			"Tests must import product modules through module-root entrypoint files; implementation subfolders are private.",
		untypedTestSource:
			"Test-owned JavaScript-like source must use .ts, .tsx, .mts or .cts. Convert it to TypeScript so the root tsconfig checks it.",
	},
	(context) => {
		const relativePath = getRepoRelativePath(context);
		const importer: Importer = {
			context,
			relativePath,
			module: moduleAt(relativePath),
			owner: testOwnerAt(relativePath),
		};

		const visitors = sourceImportVisitors((source, node) => {
			const messageId = entrypointMessage(importer, source);
			if (messageId) {
				report(context, node, messageId);
			}
		});

		const placement = placementMessages(importer);
		if (placement.length > 0) {
			/**
			 * Report the file-level placement problems at the program node.
			 * @param node The visited node.
			 */
			visitors.Program = (node) => {
				for (const messageId of placement) {
					report(context, node, messageId);
				}
			};
		}

		return visitors;
	},
);

const absoluteImports = createRule(
	{
		useAlias:
			"Use an @/ alias for local imports; relative and filesystem-absolute imports are not allowed.",
	},
	(context) =>
		sourceImportVisitors((source, node) => {
			if (source.startsWith(".") || source.startsWith("/") || source.startsWith("file:")) {
				report(context, node, "useAlias");
			}
		}),
);

export { absoluteImports, importBoundaries, moduleEntrypoints };
