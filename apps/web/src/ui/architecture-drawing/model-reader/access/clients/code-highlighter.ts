// The colours of a source excerpt (TASK-590.15), from shiki.
//
// One highlighter core serves the page, with the JavaScript regular-expression engine, so no
// WebAssembly is loaded. Its one theme names CSS variables in place of colours (`--code-*`), and
// app.css sets them from the theme's tokens, so a theme switch recolours an excerpt without
// highlighting it again. A grammar is imported only when the first excerpt of its language is
// drawn, and only the languages the code check reads have one: the release carries no other.
// A file of another language, or a grammar that fails to load, keeps its plain text.

import { queryOptions } from "@tanstack/react-query";
import { createCssVariablesTheme, createHighlighterCore, type HighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import {
	GRAMMARS,
	type CodeLanguage,
} from "#ui/architecture-drawing/model-reader/access/clients/code-grammars.ts";

/** The language of each file extension the excerpt colours. */
const EXTENSIONS: Readonly<Record<string, CodeLanguage>> = {
	ts: "typescript",
	mts: "typescript",
	cts: "typescript",
	tsx: "tsx",
	js: "javascript",
	mjs: "javascript",
	cjs: "javascript",
	jsx: "jsx",
	py: "python",
	pyi: "python",
	cs: "csharp",
	swift: "swift",
	c: "c",
	h: "c",
	cc: "cpp",
	cpp: "cpp",
	cxx: "cpp",
	hh: "cpp",
	hpp: "cpp",
	hxx: "cpp",
	m: "objective-c",
	rs: "rust",
	go: "go",
	nix: "nix",
	tf: "terraform",
	tofu: "terraform",
	tfvars: "terraform",
	hcl: "terraform",
	yaml: "yaml",
	yml: "yaml",
	json: "json",
};

/** One run of characters of a line, in the colour its token takes. */
interface CodeToken {
	readonly content: string;
	/** A CSS colour that names one of the `--code-*` variables, or nothing for the plain colour. */
	readonly color: string | undefined;
}

/** The name of the theme. */
const THEME_NAME = "archboard-code";

/** The theme, whose colours are the `--code-*` variables of app.css. */
const THEME = createCssVariablesTheme({
	name: THEME_NAME,
	variablePrefix: "--code-",
	fontStyle: false,
});

let highlighter: Promise<HighlighterCore> | undefined;

/**
 * The page's one highlighter, made on first use.
 * @returns The highlighter, with no language loaded until one is asked for.
 */
function core(): Promise<HighlighterCore> {
	highlighter ??= createHighlighterCore({
		themes: [THEME],
		langs: [],
		engine: createJavaScriptRegexEngine({ forgiving: true }),
	});
	return highlighter;
}

/**
 * The language of a file, by its name.
 * @param path The file's path.
 * @returns The language, or null for a file the excerpt does not colour.
 */
function languageOf(path: string): CodeLanguage | null {
	const name = path.split("/").at(-1) ?? path;
	if (name === "Dockerfile" || name.endsWith(".Dockerfile")) return "dockerfile";
	const extension = name.includes(".") ? name.split(".").at(-1)!.toLowerCase() : "";
	return EXTENSIONS[extension] ?? null;
}

/**
 * The tokens of each line of an excerpt.
 * @param path The file the lines are from, whose name says their language.
 * @param lines The lines.
 * @returns One list of tokens for each line, or null when the lines keep their plain text.
 */
async function codeTokens(
	path: string,
	lines: readonly string[],
): Promise<readonly (readonly CodeToken[])[] | null> {
	const language = languageOf(path);
	if (language === null) return null;
	try {
		const shiki = await core();
		if (!shiki.getLoadedLanguages().includes(language))
			await shiki.loadLanguage(GRAMMARS[language]());
		const rows = shiki.codeToTokensBase(lines.join("\n"), { lang: language, theme: THEME_NAME });
		return rows.map((row) => row.map(({ content, color }) => ({ content, color })));
	} catch {
		return null;
	}
}

/**
 * The tokens of one excerpt, worked out once for its text.
 * @param path The file the lines are from.
 * @param lines The lines.
 * @returns The query options, whose data is the tokens of each line, or null for plain text.
 */
function codeTokensQuery(path: string, lines: readonly string[]) {
	return queryOptions({
		queryKey: ["code-tokens", path, lines] as const,
		/**
		 * Highlight the lines.
		 * @returns Their tokens, or null.
		 */
		queryFn: () => codeTokens(path, lines),
		staleTime: Number.POSITIVE_INFINITY,
		retry: false,
	});
}

export { codeTokensQuery, languageOf, type CodeToken };
