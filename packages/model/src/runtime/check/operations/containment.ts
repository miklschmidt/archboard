// Whether each container owns one place in the code that holds its parts. A module
// with parts and no binding leaves the code of its folder that no part binds to no
// module, so the code check cannot see a call into it. A part bound outside its
// container's binding says that the model or the code layout splits one job. A
// container bound to a runner, the address of a workload in infrastructure,
// holds the code that the workload runs wherever that code lives (ADR 0046), so
// the rule leaves it out. The rule reads only the bindings that the model states,
// never the files.

import { posix } from "node:path";
import type { ArchitectureModel } from "#shared/canonical-contracts/schemas/model.ts";
import type { VaultDiagnostic } from "#shared/schemas/semantic-policy.ts";
import { nodeSubject } from "#runtime/check/operations/subject.ts";

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
 * Whether a binding names a runner: the address of a declaration that runs code
 * built elsewhere, in the forms of ADR 0046. A Kubernetes object (`Deployment/web`)
 * or a compose service (`services.web`) in a YAML file, or a Terraform or OpenTofu
 * resource (`module.api.aws_lambda_function.api`) in a `.tf` or `.tofu` file or in
 * its root module's directory.
 * @param binding The binding.
 * @returns True when it does.
 */
function namesRunner(binding: Binding): boolean {
	const { symbol } = binding;
	if (symbol === undefined) return false;
	const path = pathOf(binding);
	if (/\.ya?ml$/u.test(path)) {
		const compose = /^(docker-)?compose(\.override)?\.ya?ml$/u.test(posix.basename(path));
		return (
			/^[A-Z][A-Za-z]*\/[^/]+$/u.test(symbol) || (compose && /^services\.[\w.-]+$/u.test(symbol))
		);
	}
	const terraform = /\.(tf|tofu)$/u.test(path) || !/\.[^/]+$/u.test(path);
	return (
		terraform && /^(module\.[\w-]+\.)*(data\.)?[a-z][a-z0-9]*_[a-z0-9_]+\.[\w-]+$/u.test(symbol)
	);
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
 * The deepest directory that holds every binding, in one repository. A binding
 * below the shared path proves it is a directory; otherwise use its parent.
 * @param bindings The bindings, at least one.
 * @returns The path, empty for the repository root, or undefined for different repositories.
 */
function sharedPath(bindings: readonly Binding[]): string | undefined {
	if (new Set(bindings.map(({ repo }) => repo)).size !== 1) return undefined;
	const paths = bindings.map(pathOf);
	const shared = sharedSegments(paths);
	const directory = paths.some((path) => path !== shared.join("/"));
	return (directory ? shared : shared.slice(0, -1)).join("/");
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
 * The bound parts that a container's binding does not hold: all of them when it has
 * no binding, and none when it binds a runner.
 * @param binding The container's binding.
 * @param parts Its bound parts.
 * @returns The parts outside it.
 */
function partsAway(binding: Binding | undefined, parts: readonly Module[]): readonly Module[] {
	if (binding === undefined) return parts;
	if (namesRunner(binding)) return [];
	return parts.filter((part) => part.binding !== undefined && !holds(binding, part.binding));
}

/**
 * Warn about a container that does not own one place that holds its parts:
 * `CONTAINER_UNBOUND` when it has bound parts and no binding, and
 * `CONTAINER_PARTS_OUTSIDE` when a bound part is outside its binding. Each names
 * the directory to bind, or says that the parts are spread and what to judge. A
 * model that binds no code says nothing by its bindings, so the rule reads only a
 * model that binds some, and a container bound to a runner holds its parts wherever
 * their code lives.
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
		const away = partsAway(binding, parts);
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

export { containmentDiagnostics, pathOf };
