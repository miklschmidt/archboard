// Resolve the same bound declaration in each immutable revision. Terraform
// bindings keep their root module and full address, including module instances.
import {
	findSymbol,
	isTerraformFile,
	terraformConfiguration,
	terraformRootOf,
	type Definition,
	type SyntaxFacts,
} from "@/runtime/code-facts/index";
import type { SourceRevision } from "@/runtime/history-lens/lib/source-history";
import { filesOfBinding } from "@/shared/code-target/index";

/** A declaration's source, with its identity separate from shifting line numbers. */
interface DeclarationSource {
	readonly path: string;
	readonly symbol: string;
	readonly start: number;
	readonly end: number;
	readonly text: string;
}

type SymbolReading =
	| { readonly kind: "found"; readonly site: DeclarationSource }
	| { readonly kind: "absent" | "unsupported" };

/**
 * Slice exactly the lines that the existing language adapter owns.
 * @param revision The source revision.
 * @param path The file holding the declaration.
 * @param definition The adapter's declaration.
 * @returns The declaration's identity and source text.
 */
function declarationSource(
	revision: SourceRevision,
	path: string,
	definition: Definition,
): DeclarationSource {
	const text = revision.sources.get(path) ?? "";
	return {
		path,
		symbol: definition.symbol,
		start: definition.start,
		end: definition.end,
		text:
			definition.source === undefined
				? text
						.split("\n")
						.slice(definition.start - 1, definition.end)
						.join("\n")
				: text.slice(definition.source.start, definition.source.end),
	};
}

/**
 * Adapters cannot isolate declarations sharing one source span or boundary line.
 * @param definition The declaration whose text would be counted.
 * @param facts All declarations in that file.
 * @returns Whether its range can include a neighboring declaration's text.
 */
function sharedBoundary(definition: Definition, facts: SyntaxFacts): boolean {
	return facts.definitions.some((other) => {
		if (other === definition) return false;
		if (other.symbol !== definition.symbol && relatedSymbols(other.symbol, definition.symbol))
			return false;
		return sameBoundary(definition, other);
	});
}

/**
 * Whether declaration names express identical or nested ownership.
 * @param one A declaration name.
 * @param other Another declaration name.
 * @returns True for one declaration or a containing declaration.
 */
function relatedSymbols(one: string, other: string): boolean {
	return one === other || one.startsWith(`${other}.`) || other.startsWith(`${one}.`);
}

/**
 * Whether two declarations share a range that the adapter cannot separate.
 * @param one The declaration being read.
 * @param other A neighboring declaration.
 * @returns Whether they share source offsets or a line boundary.
 */
function sameBoundary(one: Definition, other: Definition): boolean {
	if (one.source !== undefined)
		return other.source?.start === one.source.start && other.source.end === one.source.end;
	const lines = new Set([one.start, one.end]);
	return lines.has(other.start) || lines.has(other.end);
}

/**
 * Read a declaration only when its source span excludes unrelated owners.
 * @param revision The immutable source revision.
 * @param path Its source file.
 * @param definition The resolved declaration.
 * @returns Its source or explicit unsupported attribution.
 */
async function readDeclaration(
	revision: SourceRevision,
	path: string,
	definition: Definition,
): Promise<SymbolReading> {
	const facts = await revision.pass.read(revision.checkout, path);
	if (facts === undefined || facts.adapter === "text" || sharedBoundary(definition, facts))
		return { kind: "unsupported" };
	return { kind: "found", site: declarationSource(revision, path, definition) };
}

/**
 * Resolve a full root-relative Terraform address to its own declaration.
 * @param revision The source revision.
 * @param root The root module's path.
 * @param symbol The full address.
 * @returns The declaration reading, without falling back to a module call.
 */
async function terraformReading(
	revision: SourceRevision,
	root: string,
	symbol: string,
): Promise<SymbolReading> {
	const configuration = await terraformConfiguration(revision.pass, revision.checkout, root);
	const found = configuration.declared(symbol);
	if (
		found.status === "found" &&
		found.declaration.path !== undefined &&
		found.declaration.definition !== undefined
	) {
		return await readDeclaration(revision, found.declaration.path, found.declaration.definition);
	}
	return { kind: found.status === "absent" ? "absent" : "unsupported" };
}

/**
 * Keep exact declaration spellings first, else qualified tails.
 * @param facts The language adapter's facts.
 * @param symbol The bound symbol.
 * @returns Every matching declaration, so ambiguity stays visible.
 */
function definitionsOf(facts: SyntaxFacts, symbol: string): readonly Definition[] {
	const exact = facts.definitions.filter((definition) => definition.symbol === symbol);
	return exact.length > 0
		? exact
		: facts.definitions.filter((definition) => definition.symbol.endsWith(`.${symbol}`));
}

/**
 * Resolve one file without guessing among declarations of the same name.
 * @param revision The source revision.
 * @param file The file to read.
 * @param symbol The bound symbol.
 * @returns Every declaration reading, or why no declaration was found.
 */
async function fileReadings(
	revision: SourceRevision,
	file: string,
	symbol: string,
): Promise<SymbolReading[]> {
	const facts = await revision.pass.read(revision.checkout, file);
	if (facts === undefined || facts.adapter === "text") return [{ kind: "unsupported" }];
	const definitions = definitionsOf(facts, symbol);
	if (definitions.length > 0) {
		if (definitions.some((definition) => sharedBoundary(definition, facts)))
			return [{ kind: "unsupported" }];
		return definitions.map((definition) => ({
			kind: "found",
			site: declarationSource(revision, file, definition),
		}));
	}
	const found = findSymbol(facts, symbol, "definition");
	return [{ kind: found.status === "absent" ? "absent" : "unsupported" }];
}

/**
 * Resolve one path and symbol using its Terraform root or bound source files.
 * @param revision The source revision.
 * @param path The current or historical bound path.
 * @param symbol The bound symbol.
 * @returns Every reading under that path.
 */
async function atPath(
	revision: SourceRevision,
	path: string,
	symbol: string,
): Promise<SymbolReading[]> {
	const { checkout } = revision;
	const root = terraformRootOf(
		path,
		checkout.files.has(path) ? "file" : "directory",
		checkout.files,
	);
	const files = filesOfBinding(path, [...checkout.files]);
	const readings = await Promise.all(
		files
			.filter((file) => root === undefined || !isTerraformFile(file))
			.map((file) => fileReadings(revision, file, symbol)),
	);
	return [
		...(root === undefined ? [] : [await terraformReading(revision, root, symbol)]),
		...readings.flat(),
	];
}

/**
 * Resolve historical names, rejecting ambiguous declarations instead of guessing.
 * @param revision The source revision.
 * @param paths The current and historical bound paths.
 * @param symbol The bound symbol.
 * @returns Its unique declaration, absence, or unsupported ambiguity.
 */
async function readSymbol(
	revision: SourceRevision,
	paths: readonly string[],
	symbol: string,
): Promise<SymbolReading> {
	const readings = (await Promise.all(paths.map((path) => atPath(revision, path, symbol)))).flat();
	const sites = new Map(
		readings.flatMap((reading) =>
			reading.kind === "found"
				? [
						[
							`${reading.site.path}\0${reading.site.symbol}\0${reading.site.start}\0${reading.site.end}`,
							reading.site,
						] as const,
					]
				: [],
		),
	);
	if (sites.size === 1) {
		const site = [...sites.values()][0];
		if (site !== undefined) return { kind: "found", site };
	}
	return {
		kind:
			sites.size > 1 || readings.some((reading) => reading.kind === "unsupported")
				? "unsupported"
				: "absent",
	};
}

export { readSymbol, relatedSymbols, type DeclarationSource, type SymbolReading };
