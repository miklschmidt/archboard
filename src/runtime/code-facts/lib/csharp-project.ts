// The code facts of a .NET project file, `.csproj` (ADR 0046), read from its
// XML as written. The check never evaluates MSBuild: it runs no target, reads
// no imported `.props` or `.targets` file and evaluates no `Condition`, so an
// item under a condition counts as if the condition held.
//
// A `ProjectReference` is build-dependency evidence on the project it names:
// an import of its path, which the resolver finds against the project file's
// directory (csharp-resolution.ts), and a use of the project's name. A
// `PackageReference` is build-dependency evidence on a package. A package is
// built outside the checkout, so its import resolves to no file and joins no
// two parts; an anchor can still cite it. An `InternalsVisibleTo` item, and
// an `AssemblyAttribute` item of `InternalsVisibleTo` with its `_Parameter1`,
// names a friend assembly, as the attribute in code does. A project file
// declares no definition.

import path from "node:path";
import type { Import, ParsedFacts } from "@/runtime/code-facts/lib/facts";

/** One start or empty tag: its element's name, its attributes, its line and where it ends. */
interface Tag {
	readonly name: string;
	readonly attributes: ReadonlyMap<string, string>;
	readonly line: number;
	/** The offset after the tag, where the element's content starts. */
	readonly end: number;
}

/** A start or empty tag. */
const TAG = /<([\p{L}_][\p{L}\p{N}_.:-]*)([^>]*)>/gu;

/** One attribute of a tag. */
const ATTRIBUTE = /([\p{L}_][\p{L}\p{N}_.:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/gu;

/** What XML does not read as elements: comments, CDATA, declarations and instructions. */
const NOT_ELEMENTS = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<![^>]*>/gu;

/** The first parameter of an `AssemblyAttribute`, up to the end of its element. */
const FIRST_PARAMETER =
	/^[\s\S]*?<_Parameter1>([^<]*)<\/_Parameter1>[\s\S]*?<\/AssemblyAttribute>/u;

/** The attribute that names a friend assembly. */
const FRIEND_ATTRIBUTE = /InternalsVisibleTo(?:Attribute)?$/u;

/** The entities XML predefines. */
const ENTITIES: Readonly<Record<string, string>> = {
	amp: "&",
	lt: "<",
	gt: ">",
	quot: '"',
	apos: "'",
};

/**
 * Text with its entities replaced.
 * @param text The text as written.
 * @returns The text.
 */
function decoded(text: string): string {
	return text.replace(/&(amp|lt|gt|quot|apos);/gu, (_, name: string) => ENTITIES[name] ?? "");
}

/**
 * The attributes of a tag.
 * @param written What the tag writes after its name.
 * @returns Each attribute's value, by its name.
 */
function attributesOf(written: string): Map<string, string> {
	return new Map(
		[...written.matchAll(ATTRIBUTE)].map((match) => [
			match[1] ?? "",
			decoded(match[2] ?? match[3] ?? ""),
		]),
	);
}

/**
 * Every start and empty tag of an XML text, in document order. Comments and
 * CDATA are blanked to spaces, keeping their line breaks, so every line keeps
 * its place and nothing inside them reads as a tag.
 * @param text The file's text.
 * @returns The tags, and the text they were read from.
 */
function tagsOf(text: string): { readonly tags: Tag[]; readonly blanked: string } {
	const blanked = text.replace(NOT_ELEMENTS, (part) => part.replace(/[^\n]/gu, " "));
	let line = 1;
	let counted = 0;
	const tags = [...blanked.matchAll(TAG)].map((match): Tag => {
		line += blanked.slice(counted, match.index).split("\n").length - 1;
		counted = match.index;
		const [whole, name = "", written = ""] = match;
		return { name, attributes: attributesOf(written), line, end: match.index + whole.length };
	});
	return { tags, blanked };
}

/**
 * The items a tag's `Include` names; MSBuild separates several with `;`.
 * @param tag The tag.
 * @returns The items.
 */
function included(tag: Tag): string[] {
	return (tag.attributes.get("Include") ?? "")
		.split(";")
		.map((item) => item.trim())
		.filter((item) => item !== "");
}

/**
 * A friend assembly's name, without its public key.
 * @param written The name as written.
 * @returns The name.
 */
function assemblyName(written: string): string {
	return (written.split(",")[0] ?? "").trim();
}

/**
 * The friends one tag names: an `InternalsVisibleTo` item, or the
 * `_Parameter1` of an `AssemblyAttribute` item of `InternalsVisibleTo`.
 * @param tag The tag.
 * @param blanked The text it was read from.
 * @returns Each friend's name.
 */
function friendsOf(tag: Tag, blanked: string): string[] {
	if (tag.name === "InternalsVisibleTo") return included(tag).map(assemblyName);
	if (
		tag.name !== "AssemblyAttribute" ||
		!included(tag).some((item) => FRIEND_ATTRIBUTE.test(item))
	) {
		return [];
	}
	const parameter = FIRST_PARAMETER.exec(blanked.slice(tag.end))?.[1];
	return parameter === undefined ? [] : [assemblyName(decoded(parameter))];
}

/**
 * What one tag builds with: each project a `ProjectReference` names by its
 * path, and each package a `PackageReference` names by its id.
 * @param tag The tag.
 * @returns Each one's import specifier and the name a use spells.
 */
function builtWith(tag: Tag): { readonly specifier: string; readonly local: string }[] {
	if (tag.name === "PackageReference") {
		return included(tag).map((item) => ({ specifier: item, local: item }));
	}
	if (tag.name !== "ProjectReference") return [];
	return included(tag).map((item) => {
		const specifier = item.replaceAll("\\", "/");
		return { specifier, local: path.posix.parse(specifier).name };
	});
}

/**
 * The code facts of one project file.
 * @param text The file's text.
 * @returns The facts.
 */
function projectFacts(text: string): ParsedFacts {
	const { tags, blanked } = tagsOf(text);
	const imports: Import[] = [];
	const references: ParsedFacts["references"][number][] = [];
	for (const tag of tags) {
		const { line } = tag;
		for (const { specifier, local } of builtWith(tag)) {
			const names = [{ imported: "*", local, typeOnly: false }];
			const through = { import: imports.length, local };
			imports.push({ specifier, line, names, typeOnly: false, reexport: false });
			references.push({
				symbol: local,
				line,
				via: "code",
				kind: "build-dependency",
				typeOnly: false,
				through,
			});
		}
		for (const friend of friendsOf(tag, blanked)) {
			references.push({ symbol: friend, line, via: "assembly", typeOnly: false });
		}
	}
	return { definitions: [], references, imports, unparsed: [] };
}

export { projectFacts };
