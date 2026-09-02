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

const ROOT_SOURCE_ENTRYPOINTS = new Set(["src/bin.ts", "src/server.ts"]);

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
const SOURCE_ALIAS_PREFIX = "@/";
const ASSISTANT_UI_PACKAGE = "@assistant-ui/react";
const ASSISTANT_UI_AUXILIARY_PACKAGES = new Set(["assistant-cloud", "assistant-stream"]);
const ASSISTANT_UI_OWNERS = new Map([
	["src/ui/workbench-runtime/tests/provider-context-observer.ts", new Set(["useAui"])],
	[
		"src/ui/workbench-runtime",
		new Set([
			"useExternalStoreRuntime",
			"AssistantRuntimeProvider",
			"ReadonlyThreadProvider",
			"MessageNotSentError",
		]),
	],
	[
		"src/ui/workbench-timeline",
		new Set(["ThreadPrimitive", "MessagePrimitive", "MessagePartPrimitive"]),
	],
	["src/ui/workbench-composer", new Set(["ComposerPrimitive"])],
]);
const ASSISTANT_UI_MEMBER_OWNERS = new Map(
	[...ASSISTANT_UI_OWNERS].flatMap(([owner, members]) =>
		[...members].map((member) => [member, owner]),
	),
);
const ASSISTANT_UI_FORBIDDEN_APIS = new Set([
	"AssistantTransport",
	"useAssistantTransportRuntime",
	"useAssistantTransportSendCommand",
	"useAssistantTransportState",
	"ThreadListPrimitive",
	"ThreadListItemPrimitive",
	"ThreadListItemMorePrimitive",
	"useRemoteThreadListRuntime",
	"useCloudThreadListRuntime",
	"useCloudThreadListAdapter",
	"RemoteThreadList",
	"SingleThreadList",
	"InMemoryThreadList",
	"QueueItemPrimitive",
	"createMessageQueue",
	"MessageQueueController",
	"MessageQueueDriver",
	"useExternalStoreMessages",
	"getExternalStoreMessages",
	"AssistantState",
	"useAssistantState",
	"useAuiState",
	"useAuiEvent",
	"useThreadViewport",
	"useThreadViewportAutoScroll",
	"useThreadViewportStore",
	"Tool",
	"Tools",
	"tool",
	"AssistantTool",
	"AssistantToolUI",
	"useAssistantTool",
	"useAssistantToolUI",
	"useVoiceControls",
	"useVoiceState",
	"useVoiceVolume",
	"RealtimeVoiceAdapter",
	"createVoiceSession",
	"WebSpeechDictationAdapter",
	"WebSpeechSynthesisAdapter",
	"AssistantCloud",
	"McpAppsHost",
	"McpAppRenderer",
	"getMcpAppFromToolPart",
	"DevToolsHooks",
	"DevToolsProviderApi",
	"Orb",
	"CodeDiff",
	"ReviewableDiff",
]);
const GIT_PROCESS_OWNER = "src/runtime/engine/git.ts";
const SYNC_CHILD_APIS = new Set(["execFileSync", "execSync", "spawnSync"]);
const PROMISE_CONTINUATION_MEMBERS = new Set(["then", "catch", "finally"]);

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

function assistantUiOwner(relativePath) {
	for (const owner of ASSISTANT_UI_OWNERS.keys()) {
		if (relativePath === owner || relativePath.startsWith(`${owner}/`)) return owner;
	}
	return undefined;
}

function assistantUiImportedName(specifier) {
	if (specifier.type !== "ImportSpecifier") return undefined;
	return specifier.imported?.name ?? specifier.imported?.value;
}

function unwrapExpression(expression) {
	while (
		expression?.type === "TSAsExpression" ||
		expression?.type === "TSTypeAssertion" ||
		expression?.type === "TSNonNullExpression" ||
		expression?.type === "TSSatisfiesExpression" ||
		expression?.type === "ChainExpression" ||
		expression?.type === "ParenthesizedExpression"
	)
		expression = expression.expression;
	return expression;
}

function staticMemberName(expression) {
	const member = unwrapExpression(expression);
	if (member?.type !== "MemberExpression") return undefined;
	if (!member.computed && member.property?.type === "Identifier") return member.property.name;
	if (member.computed && member.property?.type === "Literal") {
		return typeof member.property.value === "string" ? member.property.value : undefined;
	}
	return undefined;
}

function staticObjectName(expression) {
	const member = unwrapExpression(expression);
	if (member?.type !== "MemberExpression") return undefined;
	const object = unwrapExpression(member.object);
	return object?.type === "Identifier" ? object.name : undefined;
}

function hasLoopAncestor(node) {
	for (let parent = node.parent; parent; parent = parent.parent) {
		if (
			parent.type === "FunctionDeclaration" ||
			parent.type === "FunctionExpression" ||
			parent.type === "ArrowFunctionExpression"
		)
			return false;
		if (
			parent.type === "WhileStatement" ||
			parent.type === "DoWhileStatement" ||
			parent.type === "ForStatement" ||
			parent.type === "ForInStatement" ||
			parent.type === "ForOfStatement"
		)
			return true;
	}
	return false;
}

const assistantUiImports = createRule(
	{
		noAssistantUiSubpath:
			"Import assistant-ui only from the exact @assistant-ui/react package root; subpath imports are not supported.",
		noAssistantUiAlternatePackage:
			"Do not import an assistant-ui alternate package; the workbench contract permits only named imports from the exact @assistant-ui/react root.",
		noAssistantUiAuxiliaryPackage:
			"Do not import assistant-ui's cloud or stream auxiliary package directly; keep the workbench headless and app-server-owned.",
		noDirectRadixImport:
			"Do not import Radix directly from application source; use the repository's Base UI layer or an Archboard-owned semantic control.",
		noAssistantUiOwner:
			"Only src/ui/workbench-runtime, src/ui/workbench-timeline, and src/ui/workbench-composer may import assistant-ui; move the import to its owning module and expose Archboard-owned behavior.",
		noAssistantUiNamedImport:
			"assistant-ui imports must be named imports from the package root; remove the side-effect, dynamic, or require form.",
		noAssistantUiDefault:
			"Do not use a default assistant-ui import; import one of the explicitly assigned named root members instead.",
		noAssistantUiNamespace:
			"Do not use a namespace assistant-ui import; import only the explicitly assigned named root members instead.",
		noAssistantUiReExport:
			"Do not re-export assistant-ui; keep the assigned named root import private to its owning Archboard module.",
		noAssistantUiMember:
			"assistant-ui member '{{member}}' is not in Archboard's assigned allowlist; use an Archboard-owned adapter or one of the exact assigned root members.",
		noAssistantUiForbiddenApi:
			"assistant-ui API '{{member}}' is a transport, thread-list, queue, tool, voice, or copied-Element API and is forbidden; keep that behavior in Archboard-owned modules.",
		noAssistantUiWrongOwner:
			"assistant-ui member '{{member}}' belongs to a different Archboard module; import it only from its named owner.",
		noAssistantUiNestedMember:
			"assistant-ui nested member '{{member}}' is not part of Archboard's contract; use the Archboard-owned composition instead of reaching into primitive internals.",
		noAssistantUiAlias:
			"Do not alias an assistant-ui import; use the exact assigned local member name so ownership remains enforceable.",
		noAssistantUiNonLiteral:
			"Do not hide assistant-ui behind a non-literal dynamic import or require; use a static named root import so ownership is enforceable.",
	},
	(context) => {
		const relativePath = getRepoRelativePath(context);
		const owner = assistantUiOwner(relativePath);
		const localAssistantUiMembers = new Map();
		const nestedMembers = new Map([
			["ComposerPrimitive", new Set(["Queue", "Dictate", "StopDictation", "DictationTranscript"])],
			["MessagePrimitive", new Set(["GenerativeUI"])],
		]);

		function checkSource(source, node, kind, specifiers = []) {
			if (source === "radix-ui" || source.startsWith("@radix-ui/")) {
				report(context, node, "noDirectRadixImport");
				return;
			}
			if (
				[...ASSISTANT_UI_AUXILIARY_PACKAGES].some(
					(packageName) => source === packageName || source.startsWith(`${packageName}/`),
				)
			) {
				report(context, node, "noAssistantUiAuxiliaryPackage");
				return;
			}
			if (!source.startsWith("@assistant-ui/")) return;
			if (!source.startsWith(ASSISTANT_UI_PACKAGE)) {
				report(context, node, "noAssistantUiAlternatePackage");
				return;
			}
			if (source !== ASSISTANT_UI_PACKAGE) {
				report(context, node, "noAssistantUiSubpath");
				return;
			}
			if (!owner) {
				report(context, node, "noAssistantUiOwner");
				return;
			}
			if (kind === "re-export") {
				report(context, node, "noAssistantUiReExport");
				return;
			}
			if (specifiers.length === 0) {
				report(context, node, "noAssistantUiNamedImport");
				return;
			}
			for (const specifier of specifiers) {
				if (specifier.type === "ImportDefaultSpecifier") {
					report(context, specifier, "noAssistantUiDefault");
					continue;
				}
				if (specifier.type === "ImportNamespaceSpecifier") {
					report(context, specifier, "noAssistantUiNamespace");
					continue;
				}
				const importedName = assistantUiImportedName(specifier);
				if (!importedName) {
					report(context, specifier, "noAssistantUiNamedImport");
					continue;
				}
				if (ASSISTANT_UI_FORBIDDEN_APIS.has(importedName)) {
					context.report({
						node: specifier,
						messageId: "noAssistantUiForbiddenApi",
						data: { member: importedName },
					});
					continue;
				}
				const expectedOwner = ASSISTANT_UI_MEMBER_OWNERS.get(importedName);
				if (!expectedOwner) {
					context.report({
						node: specifier,
						messageId: "noAssistantUiMember",
						data: { member: importedName },
					});
					continue;
				}
				if (expectedOwner !== owner)
					context.report({
						node: specifier,
						messageId: "noAssistantUiWrongOwner",
						data: { member: importedName },
					});
				if (specifier.local?.name !== importedName) {
					context.report({
						node: specifier,
						messageId: "noAssistantUiAlias",
					});
				}
			}
		}

		function checkNestedMember(node) {
			const object = unwrapExpression(node.object);
			if (object?.type !== "Identifier") return;
			const importedName = localAssistantUiMembers.get(object.name);
			if (!importedName) return;
			const propertyName = node.computed
				? node.property?.type === "Literal" && typeof node.property.value === "string"
					? node.property.value
					: undefined
				: node.property?.name;
			if (!propertyName) {
				if (node.computed) report(context, node, "noAssistantUiNonLiteral");
				return;
			}
			if (!nestedMembers.get(importedName)?.has(propertyName)) return;
			context.report({
				node,
				messageId: "noAssistantUiNestedMember",
				data: { member: `${importedName}.${propertyName}` },
			});
		}

		return {
			ImportDeclaration(node) {
				checkSource(node.source.value, node.source, "import", node.specifiers);
				if (node.source.value !== ASSISTANT_UI_PACKAGE) return;
				for (const specifier of node.specifiers) {
					const importedName = assistantUiImportedName(specifier);
					if (importedName && specifier.local?.name)
						localAssistantUiMembers.set(specifier.local.name, importedName);
				}
			},
			ExportNamedDeclaration(node) {
				if (node.source?.value) checkSource(node.source.value, node.source, "re-export");
			},
			ExportAllDeclaration(node) {
				if (node.source?.value) checkSource(node.source.value, node.source, "re-export");
			},
			ImportExpression(node) {
				if (node.source?.type === "Literal" && typeof node.source.value === "string")
					checkSource(node.source.value, node.source, "import");
				else if (owner) report(context, node, "noAssistantUiNonLiteral");
			},
			TSImportType(node) {
				if (node.source?.value && typeof node.source.value === "string")
					checkSource(node.source.value, node.source, "import");
			},
			CallExpression(node) {
				const argument = node.arguments[0];
				if (node.callee.type !== "Identifier" || node.callee.name !== "require") return;
				if (argument?.type === "Literal" && typeof argument.value === "string")
					checkSource(argument.value, argument, "import");
				else if (owner) report(context, node, "noAssistantUiNonLiteral");
			},
			AssignmentExpression(node) {
				const right = unwrapExpression(node.right);
				if (right?.type !== "Identifier") return;
				const importedName = localAssistantUiMembers.get(right.name);
				if (!importedName) return;
				if (node.left?.type !== "Identifier") {
					report(context, node, "noAssistantUiAlias");
					return;
				}
				report(context, node, "noAssistantUiAlias");
				localAssistantUiMembers.set(node.left.name, importedName);
			},
			MemberExpression: checkNestedMember,
			ChainExpression(node) {
				if (node.expression?.type === "MemberExpression") checkNestedMember(node.expression);
			},
			VariableDeclarator(node) {
				const init = unwrapExpression(node.init);
				if (init?.type !== "Identifier") return;
				const importedName = localAssistantUiMembers.get(init.name);
				if (node.id?.type === "Identifier" && importedName) {
					report(context, node, "noAssistantUiAlias");
					localAssistantUiMembers.set(node.id.name, importedName);
				}
				if (node.id?.type === "Identifier") return;
				if (node.id?.type !== "ObjectPattern" || !importedName) return;
				for (const property of node.id.properties ?? []) {
					const key = property.key;
					const propertyName = key?.name ?? key?.value;
					if (property.computed && typeof propertyName !== "string") {
						report(context, property, "noAssistantUiNonLiteral");
						continue;
					}
					if (
						typeof propertyName === "string" &&
						nestedMembers.get(importedName)?.has(propertyName)
					)
						context.report({
							node: property,
							messageId: "noAssistantUiNestedMember",
							data: { member: `${importedName}.${propertyName}` },
						});
				}
			},
		};
	},
);

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
	if (source.startsWith(SOURCE_ALIAS_PREFIX)) {
		const resolved = path.posix.normalize(
			path.posix.join("src", source.slice(SOURCE_ALIAS_PREFIX.length)),
		);
		return resolved === "src" || resolved.startsWith("src/") ? resolved : undefined;
	}

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

			if (!importedPath && source.startsWith(SOURCE_ALIAS_PREFIX)) {
				report(context, node, "noUnresolvedSourceAlias");
				return;
			}

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
			importerOwner && isJavaScriptLikeSource(relativePath) && !isTypedTestSource(relativePath)
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

function isDiscardedExpression(node) {
	let parent = node.parent;
	while (
		parent?.type === "ChainExpression" ||
		parent?.type === "TSAsExpression" ||
		parent?.type === "TSNonNullExpression" ||
		parent?.type === "ParenthesizedExpression"
	)
		parent = parent.parent;
	return (
		parent?.type === "ExpressionStatement" ||
		(parent?.type === "UnaryExpression" && parent.operator === "void")
	);
}

function assignedIdentifierName(node) {
	let expression = node;
	let parent = expression.parent;
	while (
		parent?.type === "ChainExpression" ||
		parent?.type === "TSAsExpression" ||
		parent?.type === "TSTypeAssertion" ||
		parent?.type === "TSNonNullExpression" ||
		parent?.type === "TSSatisfiesExpression" ||
		parent?.type === "ParenthesizedExpression"
	) {
		expression = parent;
		parent = parent.parent;
	}
	if (parent?.type === "VariableDeclarator" && parent.init === expression) {
		return parent.id?.type === "Identifier" ? parent.id.name : undefined;
	}
	if (parent?.type === "AssignmentExpression" && parent.right === expression) {
		return parent.left?.type === "Identifier" ? parent.left.name : undefined;
	}
	return undefined;
}

function exitPromiseHasOwner(node) {
	let expression = node;
	for (;;) {
		let parent = expression.parent;
		while (
			parent?.type === "ChainExpression" ||
			parent?.type === "TSAsExpression" ||
			parent?.type === "TSTypeAssertion" ||
			parent?.type === "TSNonNullExpression" ||
			parent?.type === "TSSatisfiesExpression" ||
			parent?.type === "ParenthesizedExpression"
		) {
			expression = parent;
			parent = parent.parent;
		}
		if (parent?.type === "AwaitExpression" && parent.argument === expression) return true;
		if (
			(parent?.type === "VariableDeclarator" &&
				parent.init === expression &&
				parent.id?.type === "Identifier") ||
			(parent?.type === "AssignmentExpression" &&
				parent.right === expression &&
				parent.left?.type === "Identifier") ||
			(parent?.type === "ReturnStatement" && parent.argument === expression)
		)
			return true;
		if (
			parent?.type === "MemberExpression" &&
			parent.object === expression &&
			PROMISE_CONTINUATION_MEMBERS.has(staticMemberName(parent)) &&
			parent.parent?.type === "CallExpression" &&
			parent.parent.callee === parent
		) {
			expression = parent.parent;
			continue;
		}
		return false;
	}
}

const gitProcessLifecycle = createRule(
	{
		noSyncChild:
			"Git identity must use the awaited asynchronous child owner; synchronous child APIs can deadlock Bun's supervisor.",
		noUnref:
			"Git identity must retain and await every child; unref would detach cleanup authority.",
		noPolling:
			"Git identity must observe promises and signals; do not poll child exit state or schedule polling intervals.",
		noFireAndForget: "Git identity must retain and await spawned children and their exit promises.",
	},
	(context) => {
		if (getRepoRelativePath(context) !== GIT_PROCESS_OWNER) return {};
		const spawnOwners = new Map();

		return {
			ImportSpecifier(node) {
				const imported = node.imported?.name ?? node.imported?.value;
				if (SYNC_CHILD_APIS.has(imported)) report(context, node, "noSyncChild");
			},
			Identifier(node) {
				if (SYNC_CHILD_APIS.has(node.name)) report(context, node, "noSyncChild");
			},
			CallExpression(node) {
				const callee = unwrapExpression(node.callee);
				const direct = callee?.type === "Identifier" ? callee.name : undefined;
				const member = staticMemberName(callee);
				const object = staticObjectName(callee);
				if (member === "unref") {
					report(context, node, "noUnref");
					return;
				}
				if (
					direct === "setInterval" ||
					member === "setInterval" ||
					(object === "Bun" && member === "sleep") ||
					(object === "Atomics" && member === "wait")
				) {
					report(context, node, "noPolling");
					return;
				}
				if (object === "Bun" && member === "spawn") {
					const owner = assignedIdentifierName(node);
					if (!owner || isDiscardedExpression(node)) {
						report(context, node, "noFireAndForget");
						return;
					}
					const owners = spawnOwners.get(owner) ?? [];
					owners.push({ node, exitOwned: false });
					spawnOwners.set(owner, owners);
				}
			},
			MemberExpression(node) {
				const member = staticMemberName(node);
				if (SYNC_CHILD_APIS.has(member)) report(context, node, "noSyncChild");
				if ((member === "exitCode" || member === "signalCode") && hasLoopAncestor(node)) {
					report(context, node, "noPolling");
				}
				if (member === "exited") {
					const object = unwrapExpression(node.object);
					if (object?.type === "Identifier" && exitPromiseHasOwner(node)) {
						for (const owner of spawnOwners.get(object.name) ?? []) owner.exitOwned = true;
					}
					if (isDiscardedExpression(node)) report(context, node, "noFireAndForget");
				}
			},
			"Program:exit"() {
				for (const owners of spawnOwners.values()) {
					for (const owner of owners) {
						if (!owner.exitOwned) report(context, owner.node, "noFireAndForget");
					}
				}
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
		"assistant-ui-imports": assistantUiImports,
		"git-process-lifecycle": gitProcessLifecycle,
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
