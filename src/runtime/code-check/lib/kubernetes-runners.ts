// The runners that Kubernetes manifests declare (ADR 0046, TASK-367.23): each
// workload a part binds, with the environment values its pod sets, for the
// join across a network hop (environment-join.ts).
//
// A workload's image is built elsewhere, so a manifest never says which code
// it runs: a workload runs the code of the parts drawn inside the part bound
// to it. So the check reads the workloads that parts bind by their address,
// such as `Deployment/web`.
//
// A value names a Service by its host (`cart:7070`). It reaches the parts
// bound to that Service, as its symbol or its file; else the workloads the
// Service picks by its selector, as Kubernetes evidence reaches them
// (kubernetes-evidence.ts). Of those, it reaches the parts drawn inside, whose
// code the workload runs, else the parts bound to it. A name that `envFrom`
// passes on from a ConfigMap is set where the ConfigMap sets its key, and
// reaches the Service that the key's value names. A name that comes from a
// Secret is set, and its value is never read.

import {
	partsByRepo,
	runningParts,
	type Runner,
	type Setting,
} from "@/runtime/code-check/lib/environment-join";
import { ownersOf, ownersOfSite, type Owners } from "@/runtime/code-check/lib/ownership";
import type { PartCode, ReadPart } from "@/runtime/code-check/lib/part-code";
import {
	kubernetesLinks,
	type FactsPass,
	type SyntaxFacts,
	type Target,
} from "@/runtime/code-facts/index";

/** What reading one repository's workloads needs. */
interface Reading {
	readonly codes: ReadonlyMap<string, PartCode>;
	readonly parts: readonly [ReadPart, ...ReadPart[]];
	readonly owners: Owners;
	readonly facts: FactsPass;
}

/** One environment value a workload sets, with the Services its value names. */
type Assigned = Omit<Setting, "reaches"> & { readonly names: readonly Target[] };

/**
 * The Services the value at one line of a manifest names.
 * @param facts The manifest's facts.
 * @param line The line.
 * @returns Where each Service is declared.
 */
function servicesAt(facts: SyntaxFacts, line: number): Target[] {
	return facts.references.flatMap((reference) =>
		reference.line === line &&
		reference.kind === "configured-path" &&
		reference.target?.symbol.startsWith("Service/") === true
			? [reference.target]
			: [],
	);
}

/**
 * The values a manifest sets in a span of lines: each environment value, with
 * the Services its value names.
 * @param facts The manifest's facts.
 * @param span The lines of the object.
 * @param only The names to keep, by the name the object gives each, if not all.
 * @returns The values.
 */
function valuesIn(
	facts: SyntaxFacts,
	span: Span,
	only?: ReadonlyMap<string, string>,
): Omit<Assigned, "repo">[] {
	return facts.references.flatMap((reference) => {
		const { symbol, line, via } = reference;
		const name = only === undefined ? symbol : only.get(symbol);
		if (via !== "environment" || name === undefined || !holds(span, line)) return [];
		return [{ name, path: facts.path, line, names: servicesAt(facts, line) }];
	});
}

/** The lines of an object. */
interface Span {
	readonly start: number;
	readonly end: number;
}

/**
 * Whether a span holds a line.
 * @param span The span.
 * @param line The line.
 * @returns True when it does.
 */
function holds(span: Span, line: number): boolean {
	return span.start <= line && line <= span.end;
}

/**
 * The values one `envFrom` entry passes on: each key of the ConfigMap or
 * Secret it reads, under the name the workload sees.
 * @param reading The repository's reading.
 * @param found The entry, an import that passes names on.
 * @returns The values, set where the ConfigMap or Secret sets each key.
 */
async function passedBy(
	reading: Reading,
	found: SyntaxFacts["imports"][number],
): Promise<Omit<Assigned, "repo">[]> {
	if (found.resolved === undefined) return [];
	const source = await reading.facts.read(reading.parts[0].checkout, found.resolved);
	if (source?.adapter !== "kubernetes") return [];
	const declared = source.definitions.find((each) => each.symbol === found.specifier);
	const names = new Map(found.names.map(({ imported, local }) => [imported, local]));
	return declared === undefined ? [] : valuesIn(source, declared, names);
}

/**
 * The values `envFrom` passes on to a workload.
 * @param reading The repository's reading.
 * @param facts The workload's manifest.
 * @param span The workload's lines.
 * @returns The values.
 */
async function passedOn(
	reading: Reading,
	facts: SyntaxFacts,
	span: Span,
): Promise<Omit<Assigned, "repo">[]> {
	const values: Omit<Assigned, "repo">[] = [];
	for (const found of facts.imports.filter((each) => each.reexport && holds(span, each.line))) {
		// oxlint-disable-next-line no-await-in-loop -- one manifest at a time; it is cached by now
		values.push(...(await passedBy(reading, found)));
	}
	return values;
}

/**
 * The parts a value that names a Service reaches.
 * @param reading The repository's reading.
 * @param service Where the Service is declared.
 * @returns The parts bound to the Service, else those of the workloads it picks.
 */
async function reachedThrough(reading: Reading, service: Target): Promise<ReadPart[]> {
	const { checkout } = reading.parts[0];
	const facts = await reading.facts.read(checkout, service.path);
	const definition =
		facts?.adapter === "kubernetes"
			? facts.definitions.find((each) => each.symbol === service.symbol)
			: undefined;
	const site = definition === undefined ? undefined : { path: service.path, definition, via: [] };
	const bound = (site === undefined ? [] : ownersOfSite(reading.owners, site)).filter(
		({ grain }) => grain.kind !== "directory",
	);
	if (bound.length > 0) return runningParts(reading.codes, bound);
	const picked = kubernetesLinks(reading.facts, checkout, [service.path]).filter(
		(link) =>
			link.kind === "configured-path" &&
			link.from.path === service.path &&
			link.from.definition.symbol === service.symbol,
	);
	return picked.flatMap((link) =>
		runningParts(reading.codes, ownersOfSite(reading.owners, { ...link.to, via: [] })),
	);
}

/**
 * The setting one value of a workload gives: the parts the Services it names reach.
 * @param reading The repository's reading.
 * @param value The value.
 * @returns The setting.
 */
async function settingOf(reading: Reading, value: Omit<Assigned, "repo">): Promise<Setting> {
	const { names, ...set } = value;
	const reaches: ReadPart[] = [];
	for (const service of names) {
		// oxlint-disable-next-line no-await-in-loop -- one Service at a time; its manifest is cached by now
		reaches.push(...(await reachedThrough(reading, service)));
	}
	return { ...set, repo: reading.parts[0].checkout.repo, reaches: [...new Set(reaches)] };
}

/**
 * The runner of one part bound to a workload, if it sets environment values.
 * @param reading The repository's reading.
 * @param part The part.
 * @returns The runner, or undefined for a part bound to anything else.
 */
async function runnerOf(reading: Reading, part: ReadPart): Promise<Runner | undefined> {
	const { grain, checkout } = part;
	if (grain.kind !== "symbol") return undefined;
	const facts = await reading.facts.read(checkout, grain.file);
	if (facts?.adapter !== "kubernetes") return undefined;
	const values = [
		...valuesIn(facts, grain.definition),
		...(await passedOn(reading, facts, grain.definition)),
	];
	const settings: Setting[] = [];
	for (const value of values) {
		// oxlint-disable-next-line no-await-in-loop -- one value at a time, in the manifest's order
		settings.push(await settingOf(reading, value));
	}
	return settings.length === 0
		? undefined
		: { repo: checkout.repo, directories: [], parts: [part], settings };
}

/**
 * The runners of the workloads that the parts of a board bind.
 * @param codes Each part's bound code, by its id.
 * @param facts The pass.
 * @returns One runner per part bound to a workload that sets environment values.
 */
async function kubernetesRunners(
	codes: ReadonlyMap<string, PartCode>,
	facts: FactsPass,
): Promise<Runner[]> {
	const runners: Runner[] = [];
	for (const parts of partsByRepo(codes)) {
		const reading = { codes, parts, owners: ownersOf(parts), facts };
		for (const part of parts) {
			// oxlint-disable-next-line no-await-in-loop -- one part at a time, in board order
			const runner = await runnerOf(reading, part);
			if (runner !== undefined) runners.push(runner);
		}
	}
	return runners;
}

export { kubernetesRunners };
