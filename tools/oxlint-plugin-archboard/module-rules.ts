// Rules about how files reach each other: area dependency directions, module
// root entrypoints, test ownership and the @/ alias spelling.
// oxlint-disable-next-line archboard/absolute-imports -- tools/ has no alias root; @/ resolves only into src/
import { createRule, report, sourceImportVisitors, type RuleContext } from "./rule-api.ts";
import {
	AREA_IMPORT_DENIALS,
	SOURCE_ALIAS_PREFIX,
	areaOwnerAt,
	exportedSubpaths,
	getRepoRelativePath,
	isModuleInternal,
	isSourceFile,
	isTestFile,
	isTestingSubpath,
	isTypedTestSource,
	moduleAt,
	packageAt,
	resolvePackageSpecifier,
	resolveSourcePath,
	sameModule,
	sameTestOwner,
	testOwnerAt,
	type AreaOwner,
	type PackageFile,
	type SourceModule,
	type TestOwner,
	// oxlint-disable-next-line archboard/absolute-imports -- tools/ has no alias root; @/ resolves only into src/
} from "./source-layout.ts";

/**
 * Whether an import crosses an area direction that the documented map forbids.
 * Inside one module the folders are private to it, so nothing is judged. Inside
 * one package they are areas, and the same direction rules hold between them.
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
 * code never imports test support. Another package may import only what
 * `exports` names.
 * @param importer The importing file.
 * @param imported The imported file's package.
 * @param importedPath The imported file's repository path.
 * @param requested The export subpath the specifier asked for. A path import has none, and
 * then every export that names the file counts.
 * @returns The message id, or undefined when the import is allowed.
 */
function packageImportMessage(
	importer: Importer,
	imported: PackageFile,
	importedPath: string,
	requested: string | undefined,
): string | undefined {
	const subpaths = exportedSubpaths(importer.context, imported, importedPath, requested);
	if (!importer.owner && subpaths.some(isTestingSubpath)) {
		return "noProductTestImport";
	}
	const isPrivate =
		subpaths.length === 0 && packageAt(importer.relativePath)?.name !== imported.name;
	return isPrivate ? "noDeepImportAcrossPackages" : undefined;
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
	const importedPackage = packageAt(importedPath);
	if (importedPackage) {
		return packageImportMessage(importer, importedPackage, importedPath, requested);
	}
	const imported = moduleAt(importedPath);
	if (!imported || !isModuleInternal(imported)) {
		return undefined;
	}
	return deepImportMessage(importer, imported);
}

/**
 * The module-entrypoints message one import earns.
 * @param importer The importing file.
 * @param source The specifier as written.
 * @returns The message id, or undefined when the import is allowed.
 */
function entrypointMessage(importer: Importer, source: string): string | undefined {
	const packageImport = resolvePackageSpecifier(importer.context, source);
	if (packageImport) {
		return packageImport.target
			? importedFileMessage(importer, packageImport.target, packageImport.subpath)
			: "noDeepImportAcrossPackages";
	}
	const importedPath = resolveSourcePath(importer.context, importer.relativePath, source);
	if (!importedPath) {
		return source.startsWith(SOURCE_ALIAS_PREFIX) ? "noUnresolvedSourceAlias" : undefined;
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
		noDeepImportFromOutside:
			"Code outside a module may import only that module's root entrypoint files, never implementation subfolders.",
		noDeepImportAcrossModules:
			"Import another module through one of its root entrypoint files, not through its implementation subfolders.",
		noDeepImportAcrossPackages:
			"Import another package only through a path that its package.json exports names. Every other file of a package is private.",
		noUnresolvedSourceAlias:
			"Canonical @/ imports must resolve to a source module entrypoint and stay inside src/.",
		noProductTestImport:
			"Product, scripts, and tools must not import test-owned source or a package's ./testing export. Move shared behavior behind a product module root entrypoint or a package export.",
		noCrossOwnerTestImport:
			"Test-owned source may import helpers only from its own owner (its module tests folder, or tests/system), and the preload's real-time declaration.",
		noTestOutsideTestsDirectory:
			"Bun test files must live under src/<area>/<module>/tests, packages/<name>/tests or tests/system.",
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
			"Use an @/ alias for local imports in src/ and a # import in a package; relative and filesystem-absolute imports are not allowed.",
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
