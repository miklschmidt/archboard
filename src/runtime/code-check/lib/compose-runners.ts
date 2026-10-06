// The runners that compose files declare (ADR 0046, TASK-367.23): each
// service, with the directory whose code it runs, the parts bound to it and
// the environment values it sets, for the join across a network hop
// (environment-join.ts).
//
// The check reads every compose file of a repository whose code the board
// binds, bound or not, because the compose file is what runs that code. A
// service is one runner across the files of its project: compose merges an
// override's block into it, and a later file's `build` replaces an earlier
// one. A service runs the code of the directory it builds (`runs` in its
// facts). A build of the whole repository names no part, because every part
// is in it.
//
// A value a service sets reaches the parts the address in it names: the
// parts whose code the named service runs, the outermost bound inside the
// directory it builds or those drawn inside a part bound to it, else the parts
// that own the service's declaration, as all compose evidence. A name an env file sets is set to a value the check
// never reads, so it reaches no part.

import path from "node:path";
import {
	partsByRepo,
	runningParts,
	type Runner,
	type Setting,
} from "@/runtime/code-check/lib/environment-join";
import { ownersOf, ownersOfSite } from "@/runtime/code-check/lib/evidence";
import type { PartCode, ReadPart } from "@/runtime/code-check/lib/part-code";
import {
	isComposeFile,
	mergedDefinitions,
	type Definition,
	type FactsPass,
	type SyntaxFacts,
	type Target,
} from "@/runtime/code-facts/index";

/** One block of a service, in one file of its project. */
interface Block {
	readonly path: string;
	readonly definition: Definition;
}

/** One value a block sets, with the services its value names. */
type Assigned = Omit<Setting, "reaches"> & { readonly names: readonly Target[] };

/** One service of a project, as its blocks are gathered. */
interface Service {
	readonly blocks: Block[];
	readonly sets: Assigned[];
}

/**
 * Whether a file is an override, which compose merges after the base.
 * @param file The file.
 * @returns True for an override.
 */
function isOverride(file: string): boolean {
	return path.posix.basename(file).includes(".override.");
}

/**
 * The directory a block builds, relative to the checkout.
 * @param block The block.
 * @returns The directory (`` for the whole checkout), or undefined when it builds none here.
 */
function builtDirectory(block: Block): string | undefined {
	const { runs } = block.definition;
	if (runs === undefined) return undefined;
	const directory = path.posix.normalize(path.posix.join(path.posix.dirname(block.path), runs));
	if (directory === "..") return undefined;
	if (directory.startsWith("../")) return undefined;
	return directory === "." ? "" : directory;
}

/**
 * The values one block of a service sets: each environment value, with the
 * services its value names, and each name an env file it reads sets.
 * @param facts The compose file's facts.
 * @param definition The block.
 * @param repo The repository.
 * @returns The values.
 */
function setsOf(facts: SyntaxFacts, definition: Definition, repo: string): Assigned[] {
	/**
	 * Whether the block holds a line.
	 * @param line The line.
	 * @returns True when it does.
	 */
	const inside = (line: number) => definition.start <= line && line <= definition.end;
	const values = facts.references.flatMap((reference): Assigned[] => {
		if (reference.via !== "environment" || !inside(reference.line)) return [];
		const names = facts.references.flatMap((other) =>
			other.line === reference.line &&
			other.kind === "configured-path" &&
			other.target?.symbol.startsWith("services.") === true
				? [other.target]
				: [],
		);
		return [{ name: reference.symbol, repo, path: facts.path, line: reference.line, names }];
	});
	const envFiles = facts.imports.flatMap((found): Assigned[] =>
		found.reexport && found.resolved !== undefined && inside(found.line)
			? found.names.map(({ local }) => ({
					name: local,
					repo,
					path: facts.path,
					line: found.line,
					names: [],
				}))
			: [],
	);
	return [...values, ...envFiles];
}

/**
 * Add the services one compose file declares, each to the service its
 * project's other files already began.
 * @param services The services so far, by each file and address of their blocks.
 * @param found The file's facts.
 * @param checkout The checkout and its repository.
 * @param facts The pass.
 */
async function addServices(
	services: Map<string, Service>,
	found: SyntaxFacts,
	checkout: ReadPart["checkout"],
	facts: FactsPass,
): Promise<void> {
	for (const definition of found.definitions.filter((each) =>
		each.symbol.startsWith("services."),
	)) {
		// oxlint-disable-next-line no-await-in-loop -- one service at a time; the project's other files are cached by now
		const merged = await mergedDefinitions(facts, checkout, found.path, definition.symbol);
		const service = merged
			.map((other) => services.get(`${other.path}\0${definition.symbol}`))
			.find((each) => each !== undefined) ?? { blocks: [], sets: [] };
		service.blocks.push({ path: found.path, definition });
		service.sets.push(...setsOf(found, definition, checkout.repo));
		services.set(`${found.path}\0${definition.symbol}`, service);
	}
}

/**
 * The services the compose files of one repository declare, across the files
 * of each project.
 * @param parts The read parts of the board in that repository.
 * @param facts The pass.
 * @returns Each service, by each file and address of its blocks.
 */
async function servicesIn(
	parts: readonly [ReadPart, ...ReadPart[]],
	facts: FactsPass,
): Promise<Map<string, Service>> {
	const { checkout } = parts[0];
	const services = new Map<string, Service>();
	for (const file of [...checkout.files].filter(isComposeFile).toSorted()) {
		// oxlint-disable-next-line no-await-in-loop -- one file at a time, so the pass yields between parses
		const found = await facts.read(checkout, file);
		// oxlint-disable-next-line no-await-in-loop -- one file at a time, in order
		if (found?.adapter === "compose") await addServices(services, found, checkout, facts);
	}
	return services;
}

/**
 * Where a part's bound code is: its directory, or its file.
 * @param part The part.
 * @returns The path.
 */
function locationOf(part: ReadPart): string {
	const { grain } = part;
	return grain.kind === "directory" ? grain.directory : grain.file;
}

/**
 * The outermost parts bound inside a directory: those whose bound code no
 * other such part's directory holds.
 * @param parts The repository's read parts.
 * @param directory The directory.
 * @returns The parts.
 */
function outermostIn(parts: readonly ReadPart[], directory: string): ReadPart[] {
	const inside = parts.filter((part) => {
		const at = locationOf(part);
		return at === directory || at.startsWith(`${directory}/`);
	});
	return inside.filter(
		(part) =>
			!inside.some(
				(other) =>
					other.grain.kind === "directory" &&
					other.key !== part.key &&
					locationOf(part).startsWith(`${other.grain.directory}/`),
			),
	);
}

/**
 * The directories a service runs: the build of its last block that builds.
 * @param service The service.
 * @returns The directory, or none.
 */
function directoriesOf(service: Service): string[] {
	const ordered = service.blocks.toSorted(
		(left, right) => Number(isOverride(left.path)) - Number(isOverride(right.path)),
	);
	const built = ordered.flatMap((block) => builtDirectory(block) ?? []).at(-1);
	return built === undefined ? [] : [built];
}

/**
 * The runners of one repository's compose files.
 * @param codes Each part's bound code, by its id.
 * @param parts The read parts of the board in that repository.
 * @param facts The pass.
 * @returns One runner per service.
 */
async function runnersIn(
	codes: ReadonlyMap<string, PartCode>,
	parts: readonly [ReadPart, ...ReadPart[]],
	facts: FactsPass,
): Promise<Runner[]> {
	const services = await servicesIn(parts, facts);
	const owners = ownersOf(parts);
	const bound = ownersOf(parts.filter((part) => part.grain.kind === "symbol"));
	const { repo } = parts[0].checkout;
	/**
	 * The parts a service stands for: those inside the directory it builds,
	 * else those drawn inside a part bound to it, else those that own its
	 * declaration.
	 * @param service The service.
	 * @returns The parts.
	 */
	const partsOf = (service: Service): ReadPart[] => {
		const inside = directoriesOf(service).flatMap((directory) =>
			directory === "" ? [] : outermostIn(parts, directory),
		);
		if (inside.length > 0) return inside;
		const declaring = service.blocks.flatMap((block) =>
			ownersOfSite(owners, { ...block, via: [] }),
		);
		return runningParts(codes, [...new Set(declaring)]);
	};
	return [...new Set(services.values())].map((service) => ({
		repo,
		directories: directoriesOf(service),
		parts: [
			...new Set(service.blocks.flatMap((block) => ownersOfSite(bound, { ...block, via: [] }))),
		],
		settings: service.sets.map(({ names, ...set }) => ({
			...set,
			reaches: [
				...new Set(
					names.flatMap((name) => {
						const named = services.get(`${name.path}\0${name.symbol}`);
						return named === undefined ? [] : partsOf(named);
					}),
				),
			],
		})),
	}));
}

/**
 * The runners the compose files of every repository whose code a board binds declare.
 * @param codes Each part's bound code, by its id.
 * @param facts The pass.
 * @returns The runners.
 */
async function composeRunners(
	codes: ReadonlyMap<string, PartCode>,
	facts: FactsPass,
): Promise<Runner[]> {
	const runners: Runner[] = [];
	for (const parts of partsByRepo(codes)) {
		// oxlint-disable-next-line no-await-in-loop -- one repository at a time, in board order
		runners.push(...(await runnersIn(codes, parts, facts)));
	}
	return runners;
}

export { composeRunners };
