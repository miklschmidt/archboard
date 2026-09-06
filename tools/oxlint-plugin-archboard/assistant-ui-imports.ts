// TASK-150.05: assistant-ui is owned by two modules. The thread module holds
// the official assistant-ui presentation and its product composition; the
// runtime module holds the provider and external-store adapter over
// Archboard's own Codex-owned state. Ownership is by module, not by member:
// the safety rules below forbid the APIs that would introduce a second
// transport, cloud, thread list, queue, tool or voice owner.
import {
	createRule,
	isStringLiteral,
	report,
	unwrapExpression,
	type ExpressionNode,
	type ImportSpecifierNode,
	type MemberExpressionNode,
	type NodeOf,
	type ReportedNode,
	type RuleContext,
	type StringLiteralNode,
	type VisitedNode,
	// oxlint-disable-next-line archboard/absolute-imports -- tools/ has no alias root; @/ resolves only into src/
} from "./rule-api.ts";
// oxlint-disable-next-line archboard/absolute-imports -- tools/ has no alias root; @/ resolves only into src/
import { getRepoRelativePath } from "./source-layout.ts";

const ASSISTANT_UI_PACKAGE = "@assistant-ui/react";
const ASSISTANT_UI_AUXILIARY_PACKAGES = new Set(["assistant-cloud", "assistant-stream"]);
const ASSISTANT_UI_THREAD_OWNER = "src/ui/workbench-thread";
const ASSISTANT_UI_MARKDOWN_PACKAGE = "@assistant-ui/react-markdown";
const ASSISTANT_UI_OWNERS = new Set([ASSISTANT_UI_THREAD_OWNER, "src/ui/workbench-runtime"]);
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
/** Primitive members that are not part of Archboard's assistant-ui contract. */
const NESTED_MEMBERS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
	["ComposerPrimitive", new Set(["Queue", "Dictate", "StopDictation", "DictationTranscript"])],
	["MessagePrimitive", new Set(["GenerativeUI"])],
]);

type ImportKind = "import" | "re-export";

/**
 * The first argument of a call when it is a plain expression.
 * @param node The call expression.
 * @returns The argument, or null when absent or spread.
 */
function firstArgumentExpression(node: VisitedNode<"CallExpression">): ExpressionNode | null {
	const argument = node.arguments[0];
	return argument === undefined || argument.type === "SpreadElement" ? null : argument;
}

/**
 * The owning module of a file, when assistant-ui may be imported there.
 * @param relativePath The file's repository path.
 * @returns The owner root, or undefined outside both owners.
 */
function assistantUiOwner(relativePath: string): string | undefined {
	for (const owner of ASSISTANT_UI_OWNERS) {
		if (relativePath === owner || relativePath.startsWith(`${owner}/`)) {
			return owner;
		}
	}
	return undefined;
}

/**
 * The exported name a named import specifier refers to.
 * @param specifier The import specifier.
 * @returns The imported name, or undefined for default and namespace specifiers.
 */
function assistantUiImportedName(specifier: ImportSpecifierNode): string | undefined {
	if (specifier.type !== "ImportSpecifier") {
		return undefined;
	}
	return specifier.imported.type === "Identifier"
		? specifier.imported.name
		: specifier.imported.value;
}

/**
 * The name a binding-pattern property key spells, mirroring how a member
 * expression is read: identifiers by name, literals by value.
 * @param key The property key.
 * @returns The name, a non-string literal value, or undefined.
 */
function propertyKeyName(key: NodeOf<"Property">["key"]): unknown {
	if (key.type === "Identifier" || key.type === "PrivateIdentifier") {
		return key.name;
	}
	return key.type === "Literal" ? key.value : undefined;
}

/**
 * The member name a member expression reads, when it is spelled statically.
 * @param node The member expression.
 * @returns The property name, or undefined for computed non-literal access.
 */
function memberPropertyName(node: MemberExpressionNode): string | undefined {
	if (node.property.type === "PrivateIdentifier") {
		return node.property.name;
	}
	if (node.computed) {
		return isStringLiteral(node.property) ? node.property.value : undefined;
	}
	return node.property.name;
}

/**
 * Whether the package is an auxiliary assistant-ui package or a subpath of one.
 * @param source The specifier as written.
 * @returns Whether the source names assistant-cloud or assistant-stream.
 */
function isAuxiliaryPackage(source: string): boolean {
	return [...ASSISTANT_UI_AUXILIARY_PACKAGES].some(
		(packageName) => source === packageName || source.startsWith(`${packageName}/`),
	);
}

/**
 * The message a package outside the assistant-ui scope earns: Radix must go
 * through the Base UI layer and the auxiliary packages stay unimported.
 * @param source The specifier as written.
 * @returns The message id, or undefined when the package is not one of those.
 */
function foreignPackageMessage(source: string): string | undefined {
	if (source === "radix-ui" || source.startsWith("@radix-ui/")) {
		return "noDirectRadixImport";
	}
	return isAuxiliaryPackage(source) ? "noAssistantUiAuxiliaryPackage" : undefined;
}

/**
 * Whether a source is an `@assistant-ui/` package other than the markdown one,
 * so its specifiers are subject to the root-import rules.
 * @param source The specifier as written.
 * @returns Whether the specifier checks apply.
 */
function isSpecifierChecked(source: string): boolean {
	return source.startsWith("@assistant-ui/") && source !== ASSISTANT_UI_MARKDOWN_PACKAGE;
}

/**
 * The state one file's assistant-ui check accumulates. Node loads this
 * plugin in strip-only mode, so no parameter properties or enums here.
 */
class AssistantUiFile {
	readonly context: RuleContext;
	readonly owner: string | undefined;
	/** Local binding name to the assistant-ui root member it holds. */
	readonly localMembers = new Map<string, string>();

	/**
	 * Start the check for one file.
	 * @param context The rule context of the file being linted.
	 */
	constructor(context: RuleContext) {
		this.context = context;
		this.owner = assistantUiOwner(getRepoRelativePath(context));
	}

	/**
	 * The message a package source earns before its specifiers are examined.
	 * @param source The specifier as written.
	 * @param kind Whether the declaration imports or re-exports.
	 * @returns The message id, or undefined when the specifiers decide.
	 */
	private sourceMessage(source: string, kind: ImportKind): string | undefined {
		const foreign = foreignPackageMessage(source);
		if (foreign) {
			return foreign;
		}
		if (!source.startsWith("@assistant-ui/")) {
			return undefined;
		}
		if (source === ASSISTANT_UI_MARKDOWN_PACKAGE) {
			// The official thread renders assistant text through this package;
			// only the thread module may depend on it.
			return this.owner === ASSISTANT_UI_THREAD_OWNER ? undefined : "noAssistantUiOwner";
		}
		return this.rootSourceMessage(source, kind);
	}

	/**
	 * The message an `@assistant-ui/` source earns once the markdown package
	 * is ruled out: the wrong package, a subpath, the wrong owner or a re-export.
	 * @param source The specifier as written.
	 * @param kind Whether the declaration imports or re-exports.
	 * @returns The message id, or undefined when the specifiers decide.
	 */
	private rootSourceMessage(source: string, kind: ImportKind): string | undefined {
		if (!source.startsWith(ASSISTANT_UI_PACKAGE)) {
			return "noAssistantUiAlternatePackage";
		}
		if (source !== ASSISTANT_UI_PACKAGE) {
			return "noAssistantUiSubpath";
		}
		if (!this.owner) {
			return "noAssistantUiOwner";
		}
		return kind === "re-export" ? "noAssistantUiReExport" : undefined;
	}

	/**
	 * Check one module source and, for the assistant-ui root, each specifier.
	 * @param source The specifier as written.
	 * @param node The node to report source-level problems at.
	 * @param kind Whether the declaration imports or re-exports.
	 * @param specifiers The import specifiers, when the declaration has any.
	 */
	checkSource(
		source: string,
		node: ReportedNode,
		kind: ImportKind,
		specifiers: readonly ImportSpecifierNode[] = [],
	): void {
		const sourceMessage = this.sourceMessage(source, kind);
		if (sourceMessage) {
			report(this.context, node, sourceMessage);
			return;
		}
		if (!isSpecifierChecked(source)) {
			return;
		}
		if (specifiers.length === 0) {
			report(this.context, node, "noAssistantUiNamedImport");
			return;
		}
		for (const specifier of specifiers) {
			this.checkSpecifier(specifier);
		}
	}

	/**
	 * Check one specifier of an assistant-ui root import.
	 * @param specifier The import specifier.
	 */
	private checkSpecifier(specifier: ImportSpecifierNode): void {
		if (specifier.type === "ImportDefaultSpecifier") {
			report(this.context, specifier, "noAssistantUiDefault");
			return;
		}
		if (specifier.type === "ImportNamespaceSpecifier") {
			report(this.context, specifier, "noAssistantUiNamespace");
			return;
		}
		const importedName = assistantUiImportedName(specifier);
		if (!importedName) {
			report(this.context, specifier, "noAssistantUiNamedImport");
			return;
		}
		if (ASSISTANT_UI_FORBIDDEN_APIS.has(importedName)) {
			this.context.report({
				node: specifier,
				messageId: "noAssistantUiForbiddenApi",
				data: { member: importedName },
			});
			return;
		}
		if (specifier.local.name !== importedName) {
			this.context.report({
				node: specifier,
				messageId: "noAssistantUiAlias",
			});
		}
	}

	/**
	 * Remember which local bindings hold assistant-ui root members.
	 * @param node The import declaration.
	 */
	recordImport(node: VisitedNode<"ImportDeclaration">): void {
		this.checkSource(node.source.value, node.source, "import", node.specifiers);
		if (node.source.value !== ASSISTANT_UI_PACKAGE) {
			return;
		}
		for (const specifier of node.specifiers) {
			const importedName = assistantUiImportedName(specifier);
			if (importedName && specifier.local.name) {
				this.localMembers.set(specifier.local.name, importedName);
			}
		}
	}

	/**
	 * The assistant-ui root member an expression names through a local binding.
	 * @param expression The expression, possibly wrapped or absent.
	 * @returns The root member name, or undefined.
	 */
	memberOf(expression: ExpressionNode | null): string | undefined {
		const identifier = unwrapExpression(expression);
		return identifier?.type === "Identifier" ? this.localMembers.get(identifier.name) : undefined;
	}

	/**
	 * Report a member access that reaches into a primitive's forbidden internals.
	 * @param node The member expression.
	 */
	checkNestedMember(node: MemberExpressionNode): void {
		const importedName = this.memberOf(node.object);
		if (!importedName) {
			return;
		}
		const propertyName = memberPropertyName(node);
		if (!propertyName) {
			if (node.computed) {
				report(this.context, node, "noAssistantUiNonLiteral");
			}
			return;
		}
		this.reportNestedMember(node, importedName, propertyName);
	}

	/**
	 * Report a nested member when it is one Archboard's contract excludes.
	 * @param node The node to report at.
	 * @param importedName The assistant-ui root member.
	 * @param propertyName The member read from it.
	 */
	reportNestedMember(node: ReportedNode, importedName: string, propertyName: string): void {
		if (!NESTED_MEMBERS.get(importedName)?.has(propertyName)) {
			return;
		}
		this.context.report({
			node,
			messageId: "noAssistantUiNestedMember",
			data: { member: `${importedName}.${propertyName}` },
		});
	}

	/**
	 * Report a source that hides assistant-ui behind a non-literal specifier
	 * when the file is an owner; elsewhere the source rules already apply.
	 * @param source The specifier expression.
	 * @param node The node to report at.
	 */
	checkDynamicSource(source: ExpressionNode | null, node: ReportedNode): void {
		if (isStringLiteral(source)) {
			this.checkSource(source.value, source, "import");
		} else if (this.owner) {
			report(this.context, node, "noAssistantUiNonLiteral");
		}
	}

	/**
	 * Report an aliasing assignment and follow the alias.
	 * @param node The assignment expression.
	 */
	checkAssignment(node: VisitedNode<"AssignmentExpression">): void {
		const importedName = this.memberOf(node.right);
		if (!importedName) {
			return;
		}
		report(this.context, node, "noAssistantUiAlias");
		if (node.left.type === "Identifier") {
			this.localMembers.set(node.left.name, importedName);
		}
	}

	/**
	 * Report an aliasing declaration and destructuring of forbidden members.
	 * @param node The variable declarator.
	 */
	checkDeclarator(node: VisitedNode<"VariableDeclarator">): void {
		const importedName = this.memberOf(node.init);
		if (!importedName) {
			return;
		}
		if (node.id.type === "Identifier") {
			report(this.context, node, "noAssistantUiAlias");
			this.localMembers.set(node.id.name, importedName);
			return;
		}
		if (node.id.type === "ObjectPattern") {
			this.checkDestructuring(node.id, importedName);
		}
	}

	/**
	 * Check each destructured property of an assistant-ui root member.
	 * @param pattern The object pattern being bound.
	 * @param importedName The assistant-ui root member being destructured.
	 */
	private checkDestructuring(pattern: NodeOf<"ObjectPattern">, importedName: string): void {
		for (const property of pattern.properties) {
			if (property.type === "Property") {
				this.checkDestructuredProperty(property, importedName);
			}
		}
	}

	/**
	 * Report one destructured property of an assistant-ui root member.
	 * @param property The binding property.
	 * @param importedName The assistant-ui root member being destructured.
	 */
	private checkDestructuredProperty(property: NodeOf<"Property">, importedName: string): void {
		const propertyName = propertyKeyName(property.key);
		if (property.computed && typeof propertyName !== "string") {
			report(this.context, property, "noAssistantUiNonLiteral");
			return;
		}
		if (typeof propertyName === "string") {
			this.reportNestedMember(property, importedName, propertyName);
		}
	}
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
			"Only src/ui/workbench-thread and src/ui/workbench-runtime may import assistant-ui; move the import to its owning module and expose Archboard-owned behavior.",
		noAssistantUiNamedImport:
			"assistant-ui imports must be named imports from the package root; remove the side-effect, dynamic, or require form.",
		noAssistantUiDefault:
			"Do not use a default assistant-ui import; import one of the explicitly assigned named root members instead.",
		noAssistantUiNamespace:
			"Do not use a namespace assistant-ui import; import only the explicitly assigned named root members instead.",
		noAssistantUiReExport:
			"Do not re-export assistant-ui; keep the assigned named root import private to its owning Archboard module.",
		noAssistantUiForbiddenApi:
			"assistant-ui API '{{member}}' is a transport, thread-list, queue, tool, voice, or copied-Element API and is forbidden; keep that behavior in Archboard-owned modules.",
		noAssistantUiNestedMember:
			"assistant-ui nested member '{{member}}' is not part of Archboard's contract; use the Archboard-owned composition instead of reaching into primitive internals.",
		noAssistantUiAlias:
			"Do not alias an assistant-ui import; use the exact assigned local member name so ownership remains enforceable.",
		noAssistantUiNonLiteral:
			"Do not hide assistant-ui behind a non-literal dynamic import or require; use a static named root import so ownership is enforceable.",
	},
	(context) => {
		const file = new AssistantUiFile(context);

		/**
		 * Check a re-export's source when it has one.
		 * @param source The literal source, when present.
		 */
		function checkReExport(source: StringLiteralNode | null): void {
			if (source?.value) {
				file.checkSource(source.value, source, "re-export");
			}
		}

		return {
			/**
			 * Check a static import and remember its assistant-ui bindings.
			 * @param node The visited node.
			 */
			ImportDeclaration(node) {
				file.recordImport(node);
			},
			/**
			 * Check a named re-export's source.
			 * @param node The visited node.
			 */
			ExportNamedDeclaration(node) {
				checkReExport(node.source);
			},
			/**
			 * Check an `export * from` source.
			 * @param node The visited node.
			 */
			ExportAllDeclaration(node) {
				checkReExport(node.source);
			},
			/**
			 * Check a dynamic `import()`.
			 * @param node The visited node.
			 */
			ImportExpression(node) {
				file.checkDynamicSource(node.source, node);
			},
			/**
			 * Check an `import("...")` type.
			 * @param node The visited node.
			 */
			TSImportType(node) {
				if (node.source.value) {
					file.checkSource(node.source.value, node.source, "import");
				}
			},
			/**
			 * Check a `require(...)` call.
			 * @param node The visited node.
			 */
			CallExpression(node) {
				if (node.callee.type === "Identifier" && node.callee.name === "require") {
					file.checkDynamicSource(firstArgumentExpression(node), node);
				}
			},
			/**
			 * Follow and report aliasing assignments.
			 * @param node The visited node.
			 */
			AssignmentExpression(node) {
				file.checkAssignment(node);
			},
			/**
			 * Check member reads on assistant-ui bindings.
			 * @param node The visited node.
			 */
			MemberExpression(node) {
				file.checkNestedMember(node);
			},
			/**
			 * Check optional-chained member reads on assistant-ui bindings.
			 * @param node The visited node.
			 */
			ChainExpression(node) {
				if (node.expression.type === "MemberExpression") {
					file.checkNestedMember(node.expression);
				}
			},
			/**
			 * Follow aliasing declarations and check destructuring.
			 * @param node The visited node.
			 */
			VariableDeclarator(node) {
				file.checkDeclarator(node);
			},
		};
	},
);

export { assistantUiImports };
