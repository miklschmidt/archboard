// Rules about how files reach each other: area dependency directions, module
// root entrypoints, test ownership and the @/ alias spelling.
// oxlint-disable-next-line archboard/absolute-imports -- tools/ has no alias root; @/ resolves only into src/
import { createRule, report, sourceImportVisitors, type RuleContext } from "./rule-api.ts";
import {
	exportedSubpaths,
	isTestingSubpath,
	resolveAppSpecifier,
	resolvePackageSpecifier,
	resolveSourcePath,
	// oxlint-disable-next-line archboard/absolute-imports -- tools/ has no alias root; @/ resolves only into src/
} from "./import-resolution.ts";
import {
	AREA_IMPORT_DENIALS,
	ROOT_WEB_IMPORT_PREFIX,
	SOURCE_ALIAS_PREFIX,
	areaOwnerAt,
	getRepoRelativePath,
	isModuleInternal,
	isRootSource,
	isSourceFile,
	isTestFile,
	isTypedTestSource,
	moduleAt,
	sameModule,
	sameTestOwner,
	testOwnerAt,
	workspaceAt,
	type AreaOwner,
	type SourceModule,
	type TestOwner,
	type WorkspaceFile,
	// oxlint-disable-next-line archboard/absolute-imports -- tools/ has no alias root; @/ resolves only into src/
} from "./source-layout.ts";

/**
 * Whether an import crosses an area direction that the documented map forbids.
 * Inside one module the folders are private to it, so nothing is judged. Inside
 * one package or app they are areas, and the same direction rules hold between them.
 * @param importer The importing file's area owner.
 * @param imported The imported file's area owner.
 * @returns Whether the import is refused.
 */
function isForbiddenAreaImport(importer: AreaOwner, imported: AreaOwner): boolean {
	if (importer.kind === "module" && importer.root === imported.root) {
		return false;
	}
	return AREA_IMPORT_DENIALS[importer.area]?.has(imported.area) === true;
}

const importBoundaries = createRule(
	{
		noForbiddenAreaImport:
			"This import crosses a forbidden Archboard area dependency. Use the documented direction in docs/agents/boundaries.md.",
	},
	(context) => {
		const relativePath = getRepoRelativePath(context);
		const importer = areaOwnerAt(relativePath);
		if (!importer) {
			return {};
		}

		return sourceImportVisitors((source, node) => {
			const importedPath = resolveSourcePath(context, relativePath, source);
			const imported = importedPath ? areaOwnerAt(importedPath) : undefined;
			if (imported && isForbiddenAreaImport(importer, imported)) {
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
 * only the app's own source and tests reach its files. The one exception is temporary: the
 * root `src/` modules and the browser entry in `frontend/` reach the web app through the root
 * `#web/*` import while it moves.
 * @param importer The importing file.
 * @param imported The imported file's app.
 * @param source The specifier as written.
 * @returns The message id, or undefined when the import is allowed.
 */
function appImportMessage(
	importer: Importer,
	imported: WorkspaceFile,
	source: string,
): string | undefined {
	if (workspaceAt(importer.relativePath)?.root === imported.root) {
		return undefined;
	}
	const throughRootEntry =
		imported.root === "apps/web" &&
		isRootSource(importer.relativePath) &&
		source.startsWith(ROOT_WEB_IMPORT_PREFIX);
	return throughRootEntry ? undefined : "noImportOfApp";
}

/**
 * The module-entrypoints message an import of a resolved file earns.
 * @param importer The importing file.
 * @param importedPath The imported file's repository path.
 * @param source The specifier as written.
 * @param requested The export subpath the specifier asked for, when it names a package.
 * @returns The message id, or undefined when the import is allowed.
 */
function importedFileMessage(
	importer: Importer,
	importedPath: string,
	source: string,
	requested?: string,
): string | undefined {
	const importedOwner = testOwnerAt(importedPath);
	if (importedOwner) {
		return testImportMessage(importer, importedOwner, importedPath);
	}
	const importedFile = workspaceAt(importedPath);
	if (importedFile) {
		return importedFile.kind === "app"
			? appImportMessage(importer, importedFile, source)
			: packageImportMessage(importer, importedFile, importedPath, requested);
	}
	const imported = moduleAt(importedPath);
	if (!imported || !isModuleInternal(imported)) {
		return undefined;
	}
	return deepImportMessage(importer, imported);
}

/**
 * The message a local-looking specifier earns when it names no existing file. A bare
 * package name is no local specifier, and a relative one is judged by `absolute-imports`.
 * @param source The specifier as written.
 * @returns The message id, or undefined for a specifier that is not an alias or a `#` import.
 */
function unresolvedMessage(source: string): string | undefined {
	if (source.startsWith(SOURCE_ALIAS_PREFIX)) {
		return "noUnresolvedSourceAlias";
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
			? importedFileMessage(importer, packageImport.target, source, packageImport.subpath)
			: "noDeepImportAcrossPackages";
	}
	const importedPath = resolveSourcePath(importer.context, importer.relativePath, source);
	if (!importedPath) {
		return unresolvedMessage(source);
	}
	return importedFileMessage(importer, importedPath, source);
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
		noDeepImportAcrossPackages:
			"Import another package only through a path that its package.json exports names. Every other file of a package is private.",
		noImportOfApp:
			"Nothing imports an app, by path or by its @archboard-app/ name: only the app's own source and tests reach its files, through # imports. Move shared behavior into a package and import it through the package's exports.",
		noUnresolvedSourceAlias:
			"Canonical @/ imports must resolve to a source module entrypoint and stay inside src/.",
		noUnresolvedSubpathImport:
			"A # import must name an existing file through the imports field of the package.json that owns the importing file: a package, an app, or the root for files in src/.",
		noProductTestImport:
			"Product, scripts, and tools must not import test-owned source or a package's ./testing export. Move shared behavior behind a product module root entrypoint or a package export.",
		noCrossOwnerTestImport:
			"Test-owned source may import helpers only from its own owner (its module, package or app tests folder, or tests/system), and the preload's real-time declaration.",
		noTestOutsideTestsDirectory:
			"Bun test files must live under src/<area>/<module>/tests, packages/<name>/tests, apps/<name>/tests or tests/system.",
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
			"Use an @/ alias for local imports in src/ and a # import in a package or an app; relative and filesystem-absolute imports are not allowed.",
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
