// CSS uses the same manifest resolver and boundary predicates as TypeScript.
import fs from "node:fs";
import path from "node:path";
import { transform, type UnknownAtRule, type Url } from "lightningcss";
import {
	ENTRYPOINT_MESSAGES,
	entrypointMessage,
	isForbiddenAreaImport,
	requiresAlias,
	// oxlint-disable-next-line archboard/absolute-imports -- tools/ has no manifest imports
} from "./oxlint-plugin-archboard/module-rules.ts";
import {
	resolvePackageSpecifier,
	resolveSourcePath,
	type ImportContext,
	// oxlint-disable-next-line archboard/absolute-imports -- tools/ has no manifest imports
} from "./oxlint-plugin-archboard/import-resolution.ts";
import {
	areaAt,
	testOwnerAt,
	// oxlint-disable-next-line archboard/absolute-imports -- tools/ has no manifest imports
} from "./oxlint-plugin-archboard/source-layout.ts";

/** A dependency and its location, as the native CSS parser reports them. */
type CssReference = Pick<Url, "url" | "loc">;

/** One boundary refusal, with stable rule and reason identifiers. */
interface CssProblem extends CssReference {
	file: string;
	rule: string;
	messageId: string;
	message: string;
}

/**
 * Read imports, Tailwind file references, and asset URLs without reading comments as code.
 * @param code The authored stylesheet.
 * @param filename The path used in parser diagnostics.
 * @returns Local and package dependencies, excluding network URLs and document fragments.
 */
function cssReferences(code: string, filename: string): CssReference[] {
	const found: CssReference[] = [];
	/**
	 * Keep file dependencies and omit remote resources.
	 * @param reference The parser's dependency.
	 */
	const add = (reference: CssReference): void => {
		if (reference.url && !/^(?:[a-z][\w+.-]*:|\/\/)/i.test(reference.url)) {
			found.push(reference);
		} else if (reference.url.startsWith("file:")) {
			found.push(reference);
		}
	};
	transform({
		filename,
		code: Buffer.from(code),
		// Tailwind extends CSS, including @import's source(none). Recovery retains
		// the import node before that extension. Vite/Tailwind own compilation;
		// this scan reads references and never uses the transformed stylesheet.
		errorRecovery: true,
		visitor: {
			Rule: {
				/**
				 * Read a standard import, including one with Tailwind extensions.
				 * @param rule The parsed import.
				 */
				import(rule) {
					const { url, loc } = rule.value;
					add({ url, loc: { line: loc.line + 1, column: loc.column } });
				},
				/**
				 * Read Tailwind directives that load files, excluding source scan globs.
				 * @param rule The parsed directive.
				 */
				unknown(rule: UnknownAtRule) {
					if (!["reference", "plugin", "config"].includes(rule.name)) return;
					const first = rule.prelude[0];
					if (first?.type === "token" && first.value.type === "string") {
						add({
							url: first.value.value,
							loc: { line: rule.loc.line + 1, column: rule.loc.column },
						});
					}
				},
			},
			/**
			 * Read an asset URL, excluding a fragment in the same document.
			 * @param reference The parsed URL.
			 */
			Url(reference) {
				// CSS url(#mask) names a document fragment, not a manifest import.
				if (!reference.url.startsWith("#")) add(reference);
			},
		},
	});
	return found;
}

/**
 * Judge every reference through the existing package and area policy.
 * @param cwd The repository directory.
 * @param file The stylesheet's repository-relative path.
 * @param code The authored stylesheet.
 * @returns Every import boundary refusal.
 */
function cssProblems(cwd: string, file: string, code: string): CssProblem[] {
	return cssReferences(code, file).flatMap((reference) =>
		referenceProblems({ cwd }, file, reference),
	);
}

/**
 * Whether a resolved CSS reference crosses a forbidden execution area.
 * @param context The repository directory.
 * @param file The importing stylesheet.
 * @param source The written dependency.
 * @returns Whether the shared area policy refuses the reference.
 */
function forbiddenArea(context: ImportContext, file: string, source: string): boolean {
	const target = resolveSourcePath(context, file, source);
	const from = areaAt(file);
	const to = target ? areaAt(target) : undefined;
	return from !== undefined && to !== undefined && isForbiddenAreaImport(from, to);
}

/**
 * Whether a CSS path bypasses its manifest, including a bare adjacent filename.
 * @param context The repository directory.
 * @param file The importing stylesheet.
 * @param source The written dependency.
 * @returns Whether the path needs an import or export name.
 */
function cssAliasRequired(context: ImportContext, file: string, source: string): boolean {
	if (requiresAlias(source)) return true;
	if (source.startsWith("#") || resolvePackageSpecifier(context, source)) return false;
	return resolveSourcePath(context, file, source) !== undefined;
}

/**
 * Apply the shared boundary predicates to one dependency.
 * @param context The repository directory.
 * @param file The importing stylesheet.
 * @param reference The dependency and its location.
 * @returns Every refusal for that dependency.
 */
function referenceProblems(
	context: ImportContext,
	file: string,
	reference: CssReference,
): CssProblem[] {
	const problems: CssProblem[] = [];
	/**
	 * Attach a shared policy refusal to the CSS source location.
	 * @param rule The lint rule name.
	 * @param messageId The stable refusal identifier.
	 * @param message The explanation.
	 */
	const add = (rule: string, messageId: string, message: string): void => {
		problems.push({ ...reference, file, rule, messageId, message });
	};
	const importer = { context, relativePath: file, owner: testOwnerAt(file) };
	const entry = entrypointMessage(importer, reference.url);
	if (entry) add("module-entrypoints", entry, ENTRYPOINT_MESSAGES[entry] ?? entry);
	if (forbiddenArea(context, file, reference.url)) {
		add(
			"import-boundaries",
			"noForbiddenAreaImport",
			"Use the documented area dependency direction in docs/agents/boundaries.md.",
		);
	}
	if (cssAliasRequired(context, file, reference.url)) {
		add(
			"absolute-imports",
			"useAlias",
			"Use a manifest import or a declared package export for this file.",
		);
	}
	return problems;
}

/**
 * Discover every authored stylesheet in the workspace roots, including package assets.
 * @param cwd The repository directory.
 * @returns Repository-relative stylesheet paths in stable order.
 */
function stylesheetFiles(cwd: string): string[] {
	return ["packages", "apps"]
		.flatMap((root) =>
			fs
				.readdirSync(path.join(cwd, root), { recursive: true, encoding: "utf8" })
				.filter(
					(file) =>
						file.endsWith(".css") &&
						!file
							.split(path.sep)
							.some((part) => ["node_modules", "dist", "generated", ".git"].includes(part)),
				)
				.map((file) => `${root}/${file.split(path.sep).join("/")}`),
		)
		.toSorted();
}

export { cssProblems, cssReferences, stylesheetFiles };
