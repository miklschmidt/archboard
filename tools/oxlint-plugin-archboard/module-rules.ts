// Rules about how files reach each other: area dependency directions, the exports
// of a package, the closed doors of an app, test ownership and the # import spelling.
// oxlint-disable-next-line archboard/absolute-imports -- tools/ has no # imports; sibling imports stay relative
import { createRule, report, sourceImportVisitors, type RuleContext } from "./rule-api.ts";
import {
	exportedSubpaths,
	isTestingSubpath,
	resolveAppSpecifier,
	resolvePackageSpecifier,
	resolveSourcePath,
	// oxlint-disable-next-line archboard/absolute-imports -- tools/ has no # imports; sibling imports stay relative
} from "./import-resolution.ts";
import {
	AREA_IMPORT_DENIALS,
	areaAt,
	getRepoRelativePath,
	isSourceFile,
	isTestFile,
	isTypedTestSource,
	sameTestOwner,
	testOwnerAt,
	workspaceAt,
	type TestOwner,
	type WorkspaceFile,
	// oxlint-disable-next-line archboard/absolute-imports -- tools/ has no # imports; sibling imports stay relative
} from "./source-layout.ts";

/** The spelling of the retired source alias. Nothing resolves it any more. */
const RETIRED_ALIAS_PREFIX = "@/";

/**
 * Whether an import crosses an area direction that the documented map forbids. The folders of
 * one package or app are areas, and the same direction rules hold between them.
 * @param importer The importing file's area.
 * @param imported The imported file's area.
 * @returns Whether the import is refused.
 */
function isForbiddenAreaImport(importer: string, imported: string): boolean {
	return AREA_IMPORT_DENIALS[importer]?.has(imported) === true;
}

const importBoundaries = createRule(
	{
		noForbiddenAreaImport:
			"This import crosses a forbidden Archboard area dependency. Use the documented direction in docs/agents/boundaries.md.",
	},
	(context) => {
		const relativePath = getRepoRelativePath(context);
		const importer = areaAt(relativePath);
		if (importer === undefined) {
			return {};
		}

		return sourceImportVisitors((source, node) => {
			const importedPath = resolveSourcePath(context, relativePath, source);
			const imported = importedPath ? areaAt(importedPath) : undefined;
			if (imported !== undefined && isForbiddenAreaImport(importer, imported)) {
				report(context, node, "noForbiddenAreaImport");
			}
		});
	},
);

/** What the module-entrypoints rule knows about the importing file. */
interface Importer {
	context: RuleContext;
	relativePath: string;
	owner: TestOwner | undefined;
}

/**
 * The real-time declaration of the preload that measures every Bun case:
 * since it governs every test owner, every test owner may declare through it.
 */
const WALL_CLOCK_DECLARATION = "tests/system/repository-policy/support/test-wall-clock.ts";

/**
 * The message a test-owned import target earns: product code may not import
 * it at all, and tests may only import their own owner's support and the
 * preload's real-time declaration.
 * @param importer The importing file.
 * @param importedOwner The imported file's test owner.
 * @param importedPath The imported file's repository path.
 * @returns The message id, or undefined when the import is allowed.
 */
function testImportMessage(
	importer: Importer,
	importedOwner: TestOwner,
	importedPath: string,
): string | undefined {
	if (!importer.owner) {
		return "noProductTestImport";
	}
	if (importedPath === WALL_CLOCK_DECLARATION) {
		return undefined;
	}
	return sameTestOwner(importer.owner, importedOwner) ? undefined : "noCrossOwnerTestImport";
}

/**
 * The message a file of a package earns when another file imports it. Production
 * code never imports test support. Another owner may import only what `exports` names.
 * @param importer The importing file.
 * @param imported The imported file's package.
 * @param importedPath The imported file's repository path.
 * @param requested The export subpath the specifier asked for. A path import has none, and
 * then every export that names the file counts.
 * @returns The message id, or undefined when the import is allowed.
 */
function packageImportMessage(
	importer: Importer,
	imported: WorkspaceFile,
	importedPath: string,
	requested: string | undefined,
): string | undefined {
	const subpaths = exportedSubpaths(importer.context, imported, importedPath, requested);
	if (!importer.owner && subpaths.some(isTestingSubpath)) {
		return "noProductTestImport";
	}
	const isPrivate =
		subpaths.length === 0 && workspaceAt(importer.relativePath)?.root !== imported.root;
	return isPrivate ? "noDeepImportAcrossPackages" : undefined;
}

/**
 * The message a file of an app earns when another file imports it. Nothing imports an app:
 * only the app's own source and tests reach its files.
 * @param importer The importing file.
 * @param imported The imported file's app.
 * @returns The message id, or undefined when the import is allowed.
 */
function appImportMessage(importer: Importer, imported: WorkspaceFile): string | undefined {
	return workspaceAt(importer.relativePath)?.root === imported.root ? undefined : "noImportOfApp";
}

/**
 * The module-entrypoints message an import of a resolved file earns.
 * @param importer The importing file.
 * @param importedPath The imported file's repository path.
 * @param requested The export subpath the specifier asked for, when it names a package.
 * @returns The message id, or undefined when the import is allowed.
 */
function importedFileMessage(
	importer: Importer,
	importedPath: string,
	requested?: string,
): string | undefined {
	const importedOwner = testOwnerAt(importedPath);
	if (importedOwner) {
		return testImportMessage(importer, importedOwner, importedPath);
	}
	const importedFile = workspaceAt(importedPath);
	if (!importedFile) {
		return undefined;
	}
	return importedFile.kind === "app"
		? appImportMessage(importer, importedFile)
		: packageImportMessage(importer, importedFile, importedPath, requested);
}

/**
 * The message a local-looking specifier earns when it names no existing file. A bare
 * package name is no local specifier, and a relative one is judged by `absolute-imports`.
 * @param source The specifier as written.
 * @returns The message id, or undefined for a specifier that is not the retired alias or a `#` import.
 */
function unresolvedMessage(source: string): string | undefined {
	if (source.startsWith(RETIRED_ALIAS_PREFIX)) {
		return "noRetiredAlias";
	}
	return source.startsWith("#") ? "noUnresolvedSubpathImport" : undefined;
}

/**
 * The module-entrypoints message one import earns.
 * @param importer The importing file.
 * @param source The specifier as written.
 * @returns The message id, or undefined when the import is allowed.
 */
function entrypointMessage(importer: Importer, source: string): string | undefined {
	// The workspace name of an app reaches its files through node_modules. No app exports
	// anything, so no importer may use the name, the app itself included: it uses `#` imports.
	if (resolveAppSpecifier(importer.context, source)) {
		return "noImportOfApp";
	}
	const packageImport = resolvePackageSpecifier(importer.context, source);
	if (packageImport) {
		return packageImport.target
			? importedFileMessage(importer, packageImport.target, packageImport.subpath)
			: "noDeepImportAcrossPackages";
	}
	const importedPath = resolveSourcePath(importer.context, importer.relativePath, source);
	if (!importedPath) {
		return unresolvedMessage(source);
	}
	return importedFileMessage(importer, importedPath);
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
		noDeepImportAcrossPackages:
			"Import another package only through a path that its package.json exports names. Every other file of a package is private.",
		noImportOfApp:
			"Nothing imports an app, by path or by its @archboard-app/ name: only the app's own source and tests reach its files, through # imports. Move shared behavior into a package and import it through the package's exports.",
		noRetiredAlias:
			"The @/ alias is gone. Import a file of your own package or app with a # import, and another package through an @archboard/<name> export.",
		noUnresolvedSubpathImport:
			"A # import must name an existing file through the imports field of the package.json of the package or app that owns the importing file. Scripts, tools and root tests have no # imports.",
		noProductTestImport:
			"Product, scripts, and tools must not import test-owned source or a package's ./testing export. Move shared behavior behind a package export.",
		noCrossOwnerTestImport:
			"Test-owned source may import helpers only from its own owner (its package or app tests folder, or tests/system), and the preload's real-time declaration.",
		noTestOutsideTestsDirectory:
			"Bun test files must live under packages/<name>/tests, apps/<name>/tests or tests/system.",
		untypedTestSource:
			"Test-owned JavaScript-like source must use .ts, .tsx, .mts or .cts. Convert it to TypeScript so the root tsconfig checks it.",
	},
	(context) => {
		const relativePath = getRepoRelativePath(context);
		const importer: Importer = {
			context,
			relativePath,
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
			"Use a # import for local files in a package or an app; relative and filesystem-absolute imports are not allowed.",
	},
	(context) => {
		return sourceImportVisitors((source, node) => {
			if (source.startsWith(".") || source.startsWith("/") || source.startsWith("file:")) {
				report(context, node, "useAlias");
			}
		});
	},
);

export { absoluteImports, importBoundaries, moduleEntrypoints };
