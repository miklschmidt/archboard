import fs from "node:fs";
import path from "node:path";

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

const ROOT_SOURCE_ENTRYPOINTS = new Set(["src/bin.ts", "src/dev-canvas.ts", "src/server.ts"]);

const TEMPORARY_UNTYPED_TEST_SOURCE = "src/cli/command-contract/tests/public-runner-fixture.mjs";

const MODULE_AREAS = new Set([
	"cli",
	"domain",
	"privileged",
	"runtime",
	"server",
	"shared",
	"transformers",
	"ui",
]);

const GENERIC_BUCKET_SEGMENTS = new Set(["compatibility", "core", "migration", "misc", "utils"]);

const AREA_IMPORT_DENIALS = {
	cli: new Set(["privileged", "server", "ui"]),
	domain: new Set(["cli", "privileged", "runtime", "server", "transformers", "ui"]),
	privileged: new Set(["cli", "runtime", "server", "ui"]),
	runtime: new Set(["cli", "ui"]),
	server: new Set(["cli", "ui"]),
	shared: new Set(["cli", "domain", "privileged", "runtime", "server", "transformers", "ui"]),
	transformers: new Set(["cli", "privileged", "runtime", "server", "ui"]),
	ui: new Set(["cli", "privileged", "runtime", "server"]),
};

const COMPATIBILITY_IDENTIFIER_PATTERN = /(?:^|_)(?:compat|compatibility|shim|backwards?)(?:$|_)/i;

function createRule(messages, create) {
	return {
		meta: {
			type: "problem",
			messages,
		},
		create,
	};
}

function sourceImportVisitors(onSource) {
	function visitSource(node) {
		if (node.source?.value && typeof node.source.value === "string") {
			onSource(node.source.value, node.source);
		}
	}

	return {
		ImportDeclaration: visitSource,
		ExportNamedDeclaration: visitSource,
		ExportAllDeclaration: visitSource,
		ImportExpression(node) {
			if (node.source?.type === "Literal" && typeof node.source.value === "string") {
				onSource(node.source.value, node.source);
			}
		},
		TSImportType: visitSource,
		CallExpression(node) {
			const argument = node.arguments[0];
			if (
				node.callee.type === "Import" &&
				argument?.type === "Literal" &&
				typeof argument.value === "string"
			) {
				onSource(argument.value, argument);
				return;
			}

			if (
				node.callee.type === "Identifier" &&
				node.callee.name === "require" &&
				argument?.type === "Literal" &&
				typeof argument.value === "string"
			) {
				onSource(argument.value, argument);
			}
		},
	};
}

function report(context, node, messageId) {
	context.report({
		node,
		messageId,
	});
}

function normalizedRelativePath(from, to) {
	return path.relative(from, to).split(path.sep).join("/");
}

function normalizePath(filePath) {
	return filePath.split(path.sep).join("/");
}

function getRepoRelativePath(context) {
	const relativePath = normalizedRelativePath(context.cwd, context.filename);
	return relativePath.startsWith("..") ? normalizePath(context.filename) : relativePath;
}

function isSourceFile(relativePath) {
	return /\.[cm]?[jt]sx?$/.test(relativePath);
}

function isStateFile(relativePath) {
	return (
		/(^|\/)state\/[^/]+\.[jt]sx?$/.test(relativePath) || /(^|\/)state\.[jt]sx?$/.test(relativePath)
	);
}

function sourceToRepoPath(fromRelativePath, source) {
	if (!source.startsWith(".")) {
		return undefined;
	}

	const resolved = path.posix.normalize(
		path.posix.join(path.posix.dirname(fromRelativePath), source),
	);
	return resolved.startsWith("../") ? undefined : resolved;
}

function stripQueryAndFragment(source) {
	return source.split(/[?#]/, 1)[0];
}

function resolveSourcePath(context, fromRelativePath, source) {
	const unresolvedPath = sourceToRepoPath(fromRelativePath, stripQueryAndFragment(source));
	if (!unresolvedPath) {
		return undefined;
	}

	const extension = path.posix.extname(unresolvedPath);
	const candidates = [unresolvedPath];
	if (!extension) {
		candidates.push(
			`${unresolvedPath}.ts`,
			`${unresolvedPath}.tsx`,
			`${unresolvedPath}/index.ts`,
			`${unresolvedPath}/index.tsx`,
		);
	} else if (extension === ".js" || extension === ".jsx") {
		const stem = unresolvedPath.slice(0, -extension.length);
		candidates.push(`${stem}.ts`, `${stem}.tsx`);
	} else if (extension === ".mjs") {
		candidates.push(`${unresolvedPath.slice(0, -extension.length)}.mts`);
	} else if (extension === ".cjs") {
		candidates.push(`${unresolvedPath.slice(0, -extension.length)}.cts`);
	}

	return candidates.find((candidate) => {
		try {
			return fs.statSync(path.resolve(context.cwd, candidate)).isFile();
		} catch {
			return false;
		}
	});
}

function moduleAt(relativePath) {
	const match = /^src\/([^/]+)\/([^/]+)\/(.+)$/.exec(relativePath);
	if (!match || !MODULE_AREAS.has(match[1])) {
		return undefined;
	}

	return {
		area: match[1],
		name: match[2],
		root: `src/${match[1]}/${match[2]}`,
		rest: match[3],
	};
}

function sameModule(left, right) {
	return left?.root === right?.root;
}

function isModuleInternal(module) {
	return module.rest.includes("/");
}

function isModuleTest(module) {
	return module.rest === "tests" || module.rest.startsWith("tests/");
}

function isTestFile(relativePath) {
	return /(^|\/)[^/]+(?:\.|_)(?:test|spec)\.[jt]sx?$/.test(relativePath);
}

function testOwnerAt(relativePath) {
	const module = moduleAt(relativePath);
	if (module && isModuleTest(module)) {
		return {
			kind: "module",
			root: `${module.root}/tests`,
			moduleRoot: module.root,
		};
	}

	if (relativePath === "tests/system" || relativePath.startsWith("tests/system/")) {
		return { kind: "system", root: "tests/system", moduleRoot: undefined };
	}

	return undefined;
}

function sameTestOwner(left, right) {
	return left?.root === right?.root;
}

function isJavaScriptLikeSource(relativePath) {
	return /\.[cm]?[jt]sx?$/.test(relativePath);
}

function isTypedTestSource(relativePath) {
	return relativePath.endsWith(".ts");
}

function isTopLevelDeclaration(node) {
	return node.parent?.type === "Program" || node.parent?.type === "ExportNamedDeclaration";
}

function hasGenericBucket(relativePath) {
	return relativePath.split("/").some((segment) => GENERIC_BUCKET_SEGMENTS.has(segment));
}

const noAnonymousJsxHandlers = createRule(
	{
		noInlineHandler: "Do not use anonymous inline JSX event handlers.",
	},
	(context) => ({
		JSXAttribute(node) {
			const name = node.name?.name;
			if (typeof name !== "string" || !/^on[A-Z]/.test(name)) {
				return;
			}

			const expression = node.value?.expression;
			if (
				expression?.type === "ArrowFunctionExpression" ||
				expression?.type === "FunctionExpression"
			) {
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
			"Root src files are reserved for thin package, binary, server, and development entrypoints.",
		noEntrypointImplementation:
			"Root src entrypoints may contain startup wiring, not function or class implementations.",
	},
	(context) => {
		const relativePath = getRepoRelativePath(context);
		if (ROOT_SOURCE_ENTRYPOINTS.has(relativePath)) {
			return {
				FunctionDeclaration(node) {
					if (isTopLevelDeclaration(node)) report(context, node, "noEntrypointImplementation");
				},
				ClassDeclaration(node) {
					if (isTopLevelDeclaration(node)) report(context, node, "noEntrypointImplementation");
				},
				VariableDeclarator(node) {
					if (
						(node.init?.type === "ArrowFunctionExpression" ||
							node.init?.type === "FunctionExpression") &&
						node.parent?.parent?.type === "Program"
					) {
						report(context, node, "noEntrypointImplementation");
					}
				},
			};
		}
		if (
			relativePath.startsWith("src/") &&
			isSourceFile(relativePath) &&
			!relativePath.slice("src/".length).includes("/") &&
			!ROOT_SOURCE_ENTRYPOINTS.has(relativePath)
		) {
			return {
				Program(node) {
					report(context, node, "noRootImplementation");
				},
			};
		}
		return {};
	},
);

const mappedSourcePaths = createRule(
	{
		noLegacyFrontendRoot:
			"Browser source belongs in a deep module under src/ui/<module>, not frontend/src.",
		noUnmappedSourcePath:
			"Source must be a thin root entrypoint or live in a deep module under src/<area>/<module>.",
	},
	(context) => {
		const relativePath = getRepoRelativePath(context);
		if (!isSourceFile(relativePath)) {
			return {};
		}

		let messageId;
		if (relativePath.startsWith("frontend/src/")) {
			messageId = "noLegacyFrontendRoot";
		} else if (
			relativePath.startsWith("src/") &&
			!ROOT_SOURCE_ENTRYPOINTS.has(relativePath) &&
			!moduleAt(relativePath)
		) {
			messageId = "noUnmappedSourcePath";
		}

		if (!messageId) {
			return {};
		}

		return {
			Program(node) {
				report(context, node, messageId);
			},
		};
	},
);

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

const moduleEntrypoints = createRule(
	{
		noDeepImportFromOutside:
			"Code outside a module may import only that module's root entrypoint files, never implementation subfolders.",
		noDeepImportAcrossModules:
			"Import another module through one of its root entrypoint files, not through its implementation subfolders.",
		noProductTestImport:
			"Product, scripts, and tools must not import test-owned source. Move shared behavior behind a product module root entrypoint.",
		noCrossOwnerTestImport:
			"Test-owned source may import helpers only from its own module tests folder or the tests/system owner.",
		noTestOutsideTestsDirectory:
			"Bun test files must live under src/<area>/<module>/tests or tests/system.",
		testsThroughEntrypoints:
			"Tests must import product modules through module-root entrypoint files; implementation subfolders are private.",
		untypedTestSource:
			"Test-owned JavaScript-like source must be a .ts file. Convert it to TypeScript so the root tsconfig checks it.",
	},
	(context) => {
		const relativePath = getRepoRelativePath(context);
		const importer = moduleAt(relativePath);
		const importerOwner = testOwnerAt(relativePath);
		const runnableTest = isTestFile(relativePath);

		const visitors = sourceImportVisitors((source, node) => {
			const importedPath = resolveSourcePath(context, relativePath, source);
			const importedOwner = importedPath ? testOwnerAt(importedPath) : undefined;
			const imported = importedPath ? moduleAt(importedPath) : undefined;

			if (importedOwner) {
				if (!importerOwner) {
					report(context, node, "noProductTestImport");
				} else if (!sameTestOwner(importerOwner, importedOwner)) {
					report(context, node, "noCrossOwnerTestImport");
				}
				return;
			}

			if (!imported) {
				return;
			}

			if (!isModuleInternal(imported)) {
				return;
			}

			if (importerOwner) {
				report(context, node, "testsThroughEntrypoints");
				return;
			}

			if (!importer) {
				report(context, node, "noDeepImportFromOutside");
			} else if (!sameModule(importer, imported)) {
				report(context, node, "noDeepImportAcrossModules");
			}
		});

		const placementMessage =
			runnableTest && !importerOwner ? "noTestOutsideTestsDirectory" : undefined;
		const untypedMessage =
			importerOwner &&
			isJavaScriptLikeSource(relativePath) &&
			!isTypedTestSource(relativePath) &&
			relativePath !== TEMPORARY_UNTYPED_TEST_SOURCE
				? "untypedTestSource"
				: undefined;
		if (placementMessage || untypedMessage) {
			visitors.Program = (node) => {
				if (placementMessage) report(context, node, placementMessage);
				if (untypedMessage) report(context, node, untypedMessage);
			};
		}

		return visitors;
	},
);

const noCatchAllExports = createRule(
	{
		noCatchAllExport:
			"Do not use catch-all export barrels; entrypoints must use explicit named exports.",
	},
	(context) => ({
		ExportAllDeclaration(node) {
			report(context, node, "noCatchAllExport");
		},
	}),
);

const noGenericBuckets = createRule(
	{
		noGenericBucket:
			"Do not put source in compatibility, core, migration, misc, or utils buckets; name the owning module.",
	},
	(context) => {
		const relativePath = getRepoRelativePath(context);
		if (!relativePath.startsWith("src/") || !hasGenericBucket(relativePath)) {
			return {};
		}

		return {
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
		if (!relativePath.startsWith("src/")) {
			return {};
		}

		function checkName(node, name) {
			if (COMPATIBILITY_IDENTIFIER_PATTERN.test(name)) {
				report(context, node, "noCompatibilityIdentifier");
			}
		}

		return {
			Identifier(node) {
				checkName(node, node.name);
			},
			Literal(node) {
				if (typeof node.value === "string") {
					checkName(node, node.value);
				}
			},
		};
	},
);

const plugin = {
	meta: {
		name: "eslint-plugin-archboard",
		version: "0.0.0",
	},
	rules: {
		"no-anonymous-jsx-handlers": noAnonymousJsxHandlers,
		"no-catch-all-exports": noCatchAllExports,
		"no-compatibility-identifiers": noCompatibilityIdentifiers,
		"no-generic-buckets": noGenericBuckets,
		"mapped-source-paths": mappedSourcePaths,
		"import-boundaries": importBoundaries,
		"module-entrypoints": moduleEntrypoints,
		"root-implementation-modules": rootImplementationModules,
		"state-files-pure": stateFilesPure,
	},
};

export default plugin;
