// The text that follows a move: `#` aliases of the same workspace, also the static folder of one
// in a template literal, the relative paths of `new URL(…, import.meta.url)` and
// `join(import.meta.dir, …)`, relative imports outside a workspace, the `exports` of a
// workspace, and repository paths in code and in the config and doc files that name them.
import { posix } from "node:path";

// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no # imports; sibling imports stay relative
import { joined, startsAt, type MoveMap } from "./layout.ts";

/** What rewriting one file did. */
interface Rewritten {
	text: string;
	changes: number;
}

/** One file of the checkout, before and after the moves. */
interface FileMove {
	from: string;
	to: string;
}

const ALIAS = /(["'`])(#[\w\-./@]+)(\?[^"'`]*)?\1/gu;
/** The static folder of a `#` specifier in a template literal: `` `#a/b/${name}.ts` `` names `#a/b`. */
const TEMPLATE_ALIAS = /(`)(#[\w\-./@]*)\/(?=[\w\-.@]*\$\{)/gu;
/** A relative import or export specifier, which is code only outside a workspace. */
const IMPORT_FORM = /(\b(?:from|import)\s*\(?\s*)(["'])(\.\.?\/[^"'`$]+)\2/gu;
const URL_FORM = /(new URL\(\s*)(["'])([^"'`$:]+)\2(?=\s*,\s*import\.meta\.url\s*\))/gu;
const JOIN_FORM =
	/(\b(?:path\.)?(?:join|resolve)\(\s*import\.meta\.dir)((?:\s*,\s*(["'])[^"'`$:]*\3)+)/gu;
const LITERAL = /(["'])([^"']*)\1/gu;
const REPOSITORY_PATH = /(?<![\w./@-])((?:packages|apps)\/[\w.@\-/]*[\w@-])/gu;
const WORKSPACE = /^((?:packages|apps)\/[^/]+)\//u;

/**
 * The workspace a repository path lies in.
 * @param file A repository path.
 * @returns `packages/<name>` or `apps/<name>`, or undefined outside both.
 */
function workspaceOf(file: string): string | undefined {
	return WORKSPACE.exec(file)?.[1];
}

/**
 * The file a `#` specifier names, from the `imports` that every workspace declares.
 * @param workspace The workspace of the importing file.
 * @param specifier The specifier, `#tests/…` or `#…`.
 * @returns The repository path.
 */
function aliasTarget(workspace: string, specifier: string): string {
	return specifier.startsWith("#tests/")
		? `${workspace}/tests/${specifier.slice("#tests/".length)}`
		: `${workspace}/src/${specifier.slice(1)}`;
}

/**
 * The `#` specifier of a file of a workspace.
 * @param workspace The workspace.
 * @param file A repository path in it.
 * @returns The specifier, or undefined for a file outside its `src/` and `tests/`.
 */
function aliasOf(workspace: string, file: string): string | undefined {
	if (file.startsWith(`${workspace}/src/`)) return `#${file.slice(workspace.length + 5)}`;
	return file.startsWith(`${workspace}/tests/`)
		? `#tests/${file.slice(workspace.length + 7)}`
		: undefined;
}

/**
 * Rewrite every string literal that is a `#` specifier of a moved file of the same workspace.
 * @param text The file's text.
 * @param file The file, before and after the moves.
 * @param map The moves.
 * @param problems Where a specifier that cannot follow its file is reported.
 * @returns The new text.
 */
function rewriteAliases(text: string, file: FileMove, map: MoveMap, problems: string[]): Rewritten {
	const workspace = workspaceOf(file.from);
	let changes = 0;
	const rewritten =
		workspace === undefined
			? text
			: text.replace(ALIAS, (whole, quote: string, specifier: string, query = "") => {
					const target = aliasTarget(workspace, specifier);
					const next = map.moves.get(target);
					if (next === undefined) return whole;
					const alias = aliasOf(workspace, next);
					if (alias === undefined) {
						problems.push(`${file.from}: ${specifier} moves out of ${workspace}`);
						return whole;
					}
					changes += 1;
					return `${quote}${alias}${String(query)}${quote}`;
				});
	if (workspace === undefined) return { text: rewritten, changes };
	const templated = rewritten.replace(TEMPLATE_ALIAS, (whole, tick: string, folder: string) => {
		const target = aliasTarget(workspace, folder);
		const next = map.path(target);
		if (next === undefined) {
			problems.push(`${file.from}: \`${folder}/\${…}\` names ${target}, whose files part`);
			return whole;
		}
		const alias = next === target ? undefined : aliasOf(workspace, `${next}/x`);
		if (alias === undefined) return whole;
		changes += 1;
		return `${tick}${alias.slice(0, -1)}`;
	});
	return { text: templated, changes };
}

/**
 * The files a file names through `#` specifiers of its workspace.
 * @param text The file's text.
 * @param file Its repository path.
 * @returns The repository paths of the targets.
 */
function aliasImports(text: string, file: string): string[] {
	const workspace = workspaceOf(file);
	if (workspace === undefined) return [];
	return [...text.matchAll(ALIAS)].map((match) => aliasTarget(workspace, match[2] ?? ""));
}

/**
 * The relative path from a file's new place to where an old relative path now points.
 * @param relative The path as written.
 * @param file The file, before and after the moves.
 * @param map The moves.
 * @param problems Where a path into a directory whose files part is reported.
 * @returns The new relative path, or undefined when it stays as written.
 */
function moveRelative(
	relative: string,
	file: FileMove,
	map: MoveMap,
	problems: string[],
): string | undefined {
	const next = movedTarget(relative, file, map, problems);
	if (next === undefined) return undefined;
	const written = styled(relative, posix.relative(posix.dirname(file.to), next) || ".");
	return written === relative ? undefined : written;
}

/**
 * Where an old relative path of a file points after the moves.
 * @param relative The path as written.
 * @param file The file, before and after the moves.
 * @param map The moves.
 * @param problems Where a path into a directory whose files part is reported.
 * @returns The new repository path of the target, or undefined when neither the file nor its
 * target moves.
 */
function movedTarget(
	relative: string,
	file: FileMove,
	map: MoveMap,
	problems: string[],
): string | undefined {
	const target = joined(posix.dirname(file.from), relative);
	if (target === undefined) return undefined;
	const next = map.path(target);
	if (next === undefined) {
		problems.push(`${file.from}: "${relative}" points into ${target}, whose files part`);
	}
	return next === target && file.to === file.from ? undefined : next;
}

/**
 * Write a new relative path in the style of the old one: its `./` and its trailing slash.
 * @param old The path as written.
 * @param next The new relative path.
 * @returns The path to write.
 */
function styled(old: string, next: string): string {
	const prefixed = old.startsWith("./") && !next.startsWith(".") ? `./${next}` : next;
	return old.endsWith("/") && !prefixed.endsWith("/") ? `${prefixed}/` : prefixed;
}

/**
 * Rewrite relative paths: `new URL(…, import.meta.url)` and the literal parts of
 * `join(import.meta.dir, …)`, for a file that moved or a path whose target moved, and relative
 * imports in a file outside a workspace, such as the site's scripts. Lint refuses relative
 * imports in a workspace, so a relative specifier in a workspace file is fixture text, which
 * this leaves alone.
 * @param text The file's text.
 * @param file The file, before and after the moves.
 * @param map The moves.
 * @param problems Where a path that cannot follow is reported.
 * @returns The new text.
 */
function rewriteRelatives(
	text: string,
	file: FileMove,
	map: MoveMap,
	problems: string[],
): Rewritten {
	let changes = 0;
	/**
	 * Rewrite one quoted relative path.
	 * @param whole The match.
	 * @param head What precedes the literal.
	 * @param quote The quote.
	 * @param relative The path.
	 * @returns The replacement.
	 */
	const single = (whole: string, head: string, quote: string, relative: string): string => {
		const next = moveRelative(relative, file, map, problems);
		if (next === undefined) return whole;
		changes += 1;
		return `${head}${quote}${next}${quote}`;
	};
	/**
	 * Rewrite the literal arguments of one `join(import.meta.dir, …)`.
	 * @param whole The match.
	 * @param head The call up to `import.meta.dir`.
	 * @param args The literal arguments that follow it.
	 * @param quote The quote of the first one.
	 * @returns The replacement.
	 */
	const joinedArgs = (whole: string, head: string, args: string, quote: string): string => {
		const parts = [...args.matchAll(LITERAL)].map((match) => match[2] ?? "");
		const next = moveRelative(parts.join("/"), file, map, problems);
		if (next === undefined) return whole;
		changes += 1;
		const segments = parts.length === 1 ? [next] : next.split("/").filter(Boolean);
		return `${head}${segments.map((segment) => `, ${quote}${segment}${quote}`).join("")}`;
	};
	const rewritten = text.replace(URL_FORM, single).replace(JOIN_FORM, joinedArgs);
	const code =
		workspaceOf(file.from) === undefined ? rewritten.replace(IMPORT_FORM, single) : rewritten;
	return { text: code, changes };
}

/**
 * Rewrite every repository path that names a moved file or a renamed directory.
 * @param text The file's text.
 * @param file The file's path, for the report.
 * @param map The moves.
 * @param problems Where a path to a directory whose files part is reported.
 * @returns The new text.
 */
function rewriteRepositoryPaths(
	text: string,
	file: string,
	map: MoveMap,
	problems: string[],
): Rewritten {
	let changes = 0;
	const rewritten = text.replace(REPOSITORY_PATH, (whole: string) => {
		const next = map.path(whole);
		if (next === undefined) {
			problems.push(`${file}: ${whole} names a directory whose files part`);
			return whole;
		}
		if (next !== whole) changes += 1;
		return next;
	});
	return { text: rewritten, changes };
}

/**
 * Rewrite the `exports` targets, `./src/…`, of a workspace manifest.
 * @param text The manifest's text.
 * @param workspace The workspace it describes.
 * @param map The moves.
 * @returns The new text.
 */
function rewriteExports(text: string, workspace: string, map: MoveMap): Rewritten {
	let changes = 0;
	const rewritten = text.replace(/"\.\/((?:src|tests)\/[^"]+)"/gu, (whole, relative: string) => {
		const next = map.moves.get(`${workspace}/${relative}`);
		if (next === undefined || !startsAt(workspace, next)) return whole;
		changes += 1;
		return `"./${next.slice(workspace.length + 1)}"`;
	});
	return { text: rewritten, changes };
}

/**
 * The repository paths in a text that name a moved file or a moving directory.
 * @param text A file's text.
 * @param map The moves.
 * @returns The paths, once each.
 */
function movedReferences(text: string, map: MoveMap): string[] {
	const found = [...text.matchAll(REPOSITORY_PATH)].map((match) => match[1] ?? "");
	return [...new Set(found.filter((path) => map.path(path) !== path))];
}

export {
	aliasImports,
	movedReferences,
	rewriteAliases,
	rewriteExports,
	rewriteRelatives,
	rewriteRepositoryPaths,
	workspaceOf,
	type FileMove,
	type Rewritten,
};
