// Whether each container owns one place in the code that holds its parts. A module
// with parts and no binding leaves the code of its folder that no part binds to no
// module, so the code check cannot see a call into it. A part bound outside its
// container's binding says that the model or the code layout splits one job. The
// rule reads only the bindings that the model states, never the files.

import { posix } from "node:path";
import type { ArchitectureModel } from "#shared/schemas/model.ts";
import type { VaultDiagnostic } from "#shared/schemas/semantic-policy.ts";
import { nodeSubject } from "#runtime/operations/check/subject.ts";

type Module = ArchitectureModel["modules"][number];
type Binding = NonNullable<Module["binding"]>;

/** How many parts a warning names before it counts the rest. */
const NAMED_PARTS = 4;

/** What an agent decides when no one directory holds a container's parts. */
const SPREAD_JUDGEMENT =
	"Read the code before you change the model. If a part does the job of another module, move it to that module in the model. If the parts do one job and the code splits it over several folders, the layout breaks containment and the code check cannot hold this module: tell the user, recommend that the code for this job moves into one folder, and bind the container to that folder after the move.";

/**
 * A binding's path without a trailing slash.
 * @param binding The binding.
 * @returns The path.
 */
function pathOf(binding: Binding): string {
	const path = posix.normalize(binding.path).replace(/\/+$/u, "");
	return path === "." ? "" : path;
}

/**
 * Whether one binding holds another: the same repository, and the same path or a path inside it.
 * @param outer The holding binding.
 * @param inner The held binding.
 * @returns True when it does.
 */
function holds(outer: Binding, inner: Binding): boolean {
	const path = pathOf(outer);
	const held = pathOf(inner);
	return outer.repo === inner.repo && (path === "" || held === path || held.startsWith(`${path}/`));
}

/**
 * The leading segments that every path shares.
 * @param paths The paths, at least one.
 * @returns The shared segments.
 */
function sharedSegments(paths: readonly string[]): string[] {
	const split = paths.map((path) => path.split("/"));
	const [head = []] = split;
	const differs = head.findIndex((segment, index) =>
		split.some((segments) => segments[index] !== segment),
	);
	return differs === -1 ? head : head.slice(0, differs);
}

/**
 * The deepest path that holds every binding, in one repository. Where that path is
 * a part's own whole binding, the part already owns it, so its folder holds the others.
 * @param bindings The bindings, at least one.
 * @returns The path, empty for the repository root, or undefined for different repositories.
 */
function sharedPath(bindings: readonly Binding[]): string | undefined {
	if (new Set(bindings.map(({ repo }) => repo)).size !== 1) return undefined;
	const shared = sharedSegments(bindings.map(pathOf));
	const owned = bindings.some(
		(binding) => binding.symbol === undefined && pathOf(binding) === shared.join("/"),
	);
	return (owned ? shared.slice(0, -1) : shared).join("/");
}

/**
 * Each module's descendants.
 * @param modules The modules of one state.
 * @param parents Each contained module's parent.
 * @returns The modules inside each module, at any depth.
 */
function descendantsOf(
	modules: readonly Module[],
	parents: ReadonlyMap<string, string>,
): Map<string, Module[]> {
	const inside = new Map<string, Module[]>();
	for (const module of modules) {
		for (let id = parents.get(module.id); id !== undefined; id = parents.get(id)) {
			inside.set(id, [...(inside.get(id) ?? []), module]);
		}
	}
	return inside;
}

/**
 * The modules around one: its parent, that module's parent, and so on.
 * @param id The module.
 * @param parents Each contained module's parent.
 * @returns Their ids.
 */
function ancestorsOf(id: string, parents: ReadonlyMap<string, string>): Set<string> {
	const around = new Set<string>();
	for (let at = parents.get(id); at !== undefined; at = parents.get(at)) around.add(at);
	return around;
}

/**
 * The parts a warning names, each with its path.
 * @param parts The parts.
 * @returns Their names and paths, the first few, then how many more.
 */
function namedParts(parts: readonly Module[]): string {
	const named = parts
		.slice(0, NAMED_PARTS)
		.map((part) => `${part.name} (${part.binding?.path ?? ""})`);
	const more = parts.length - named.length;
	return more > 0 ? `${named.join(", ")} and ${more} more` : named.join(", ");
}

/**
 * The folders that a container's parts sit in, with how many parts each holds,
 * fewest first, so the part that strays from the rest leads.
 * @param parts The parts.
 * @returns The folders and their counts, the first few, then how many more.
 */
function foldersOf(parts: readonly Module[]): string {
	const counts = new Map<string, number>();
	for (const binding of parts.flatMap((part) =>
		part.binding === undefined ? [] : [part.binding],
	)) {
		const folder = pathOf(binding).split("/").slice(0, -1).join("/") || ".";
		counts.set(folder, (counts.get(folder) ?? 0) + 1);
	}
	const sorted = [...counts].toSorted(([, a], [, b]) => a - b);
	const named = sorted.slice(0, NAMED_PARTS).map(([folder, count]) => `${folder} (${count})`);
	const more = sorted.length - named.length;
	return more > 0 ? `${named.join(", ")} and ${more} more folders` : named.join(", ");
}

/**
 * The directory a container can bind: the deepest one that holds its binding and
 * its parts, when no module outside the container is bound inside it.
 * @param container The container.
 * @param parts The bindings of its parts.
 * @param outside The modules that are neither in it nor around it.
 * @returns The directory's repository and path, or undefined when the parts are spread.
 */
function directoryFor(
	container: Module,
	parts: readonly Binding[],
	outside: readonly Module[],
): { readonly repo: string; readonly path: string } | undefined {
	const path = sharedPath(container.binding === undefined ? parts : [container.binding, ...parts]);
	const [first] = parts;
	if (path === undefined || first === undefined) return undefined;
	const directory = { repo: first.repo, path };
	const taken = outside.some(({ binding }) => binding !== undefined && holds(directory, binding));
	return taken ? undefined : directory;
}

/** One container that the rule reads, with what it found. */
interface Reading {
	readonly container: Module;
	/** Its bound parts, at any depth. */
	readonly parts: readonly Module[];
	/** The directory that holds them, when one does. */
	readonly directory: { readonly repo: string; readonly path: string } | undefined;
}

/**
 * The warning about a container with bound parts and no binding.
 * @param reading The container, its parts and their directory.
 * @returns The warning.
 */
function unboundWarning(reading: Reading): VaultDiagnostic {
	const { name } = reading.container;
	const { directory, parts } = reading;
	const path = directory?.path || ".";
	const message =
		directory === undefined
			? `${name} has no binding, and no one directory holds its parts without the code of another module. Its parts sit in ${foldersOf(parts)}. ${SPREAD_JUDGEMENT}`
			: `${name} has no binding, so the code in ${path} that no part binds belongs to no module, and the code check cannot see a call into it. ${path} holds every part: bind ${name} to it with an edit-module change that sets binding.`;
	return { ...siteOf(reading), code: "CONTAINER_UNBOUND", message };
}

/**
 * The warning about a bound container with parts outside its binding.
 * @param reading The container, its parts outside its binding and their directory.
 * @param bound The container's binding.
 * @returns The warning.
 */
function outsideWarning(reading: Reading, bound: Binding): VaultDiagnostic {
	const { name } = reading.container;
	const { directory, parts } = reading;
	const path = directory?.path || ".";
	const where = `${name} is bound to ${bound.path}, and these parts are bound outside it: ${namedParts(parts)}.`;
	const message =
		directory === undefined
			? `${where} No one directory holds them all without the code of another module. ${SPREAD_JUDGEMENT}`
			: `${where} ${path} holds every part and no other module: if ${name} owns that directory, bind it there with an edit-module change that sets binding. If a part does the job of another module, move it to that module instead.`;
	return { ...siteOf(reading), code: "CONTAINER_PARTS_OUTSIDE", message };
}

/**
 * Where a containment warning sits, and the binding it asks for.
 * @param reading The container and the directory that holds its parts.
 * @returns The fields every containment warning has.
 */
function siteOf(reading: Reading): Omit<VaultDiagnostic, "code" | "message"> {
	const { container, directory } = reading;
	return {
		severity: "warning",
		file: container.file,
		subject: nodeSubject(container),
		...(directory === undefined ? {} : { suggestedBinding: directory }),
	};
}

/**
 * Warn about a container that does not own one place that holds its parts:
 * `CONTAINER_UNBOUND` when it has bound parts and no binding, and
 * `CONTAINER_PARTS_OUTSIDE` when a bound part is outside its binding. Each names
 * the directory to bind, or says that the parts are spread and what to judge. A
 * model that binds no code says nothing by its bindings, so the rule reads only a
 * model that binds some.
 * @param model The modules of one state.
 * @param parents Each contained module's parent.
 * @returns One warning for each such container.
 */
function containmentDiagnostics(
	model: Pick<ArchitectureModel, "modules">,
	parents: ReadonlyMap<string, string>,
): VaultDiagnostic[] {
	const { modules } = model;
	if (!modules.some((module) => module.binding !== undefined)) return [];
	const descendants = descendantsOf(modules, parents);
	return modules.flatMap((container): VaultDiagnostic[] => {
		const inside = descendants.get(container.id) ?? [];
		const parts = inside.filter((part) => part.binding !== undefined);
		const { binding } = container;
		const away =
			binding === undefined
				? parts
				: parts.filter((part) => part.binding !== undefined && !holds(binding, part.binding));
		if (away.length === 0) return [];
		const around = ancestorsOf(container.id, parents);
		const mine = new Set([container.id, ...inside.map(({ id }) => id)]);
		const outside = modules.filter(({ id }) => !mine.has(id) && !around.has(id));
		const bindings = parts.flatMap((part) => (part.binding === undefined ? [] : [part.binding]));
		const directory = directoryFor(container, bindings, outside);
		return binding === undefined
			? [unboundWarning({ container, parts, directory })]
			: [outsideWarning({ container, parts: away, directory }, binding)];
	});
}

export { containmentDiagnostics };
