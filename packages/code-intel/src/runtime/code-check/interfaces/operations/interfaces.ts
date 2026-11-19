// Each container's interface held against what its module exposes
// (ADR 0044, ADR 0046, TASK-368.10).
//
// The document's side is the interface ADR 0044 derives from the variant: the
// children of a container that relationships from outside it reach are its
// entry points, and the rest are hidden parts. The code's side is what the
// module the container binds exposes: a bound directory, or the file that
// stands for one, such as `index.ts`. Code facts say what a module exposes,
// by the rule of its language. A container bound to another file or to a
// symbol names no module, and is not judged. A part with no parts of its own
// that binds a module is judged too, for what its module exposes, and a part
// that binds the module of a part that holds it is judged with that part
// (TASK-646.01).
//
// Each exposed name belongs to the part with the narrowest binding that holds
// its definition, as all evidence does (evidence.ts). A child owns what it or
// a part inside it owns.
//
// - `ENTRY_POINT_UNEXPOSED`: an entry point owns nothing the module exposes,
//   and the code of a caller the document draws reaches it from a file outside
//   the module, so the document and the code both reach past the interface. The
//   evidence is that use. A caller whose code shows no use, as a request over
//   a network or a call through a value shows none, or whose code lies inside
//   the module, gives no finding: the check cannot be sure, and the module's
//   exports are not how it reaches the part. A warning when a use is resolved,
//   information when all are candidates.
// - `CALLER_UNDRAWN`: a hidden part owns an exposed definition that a file
//   outside the module uses at run time, and the document draws no caller of it.
//   Where a part on the document owns that use, `RELATIONSHIP_UNDRAWN` already
//   says it, or a relationship joins the two, so this adds nothing. A warning
//   when a use is resolved, information when all are candidates. Judged only
//   where the document draws a caller of the container at all: a document that
//   draws none says nothing about the interface (ADR 0044).
// - `EXPOSED_UNUSED`, information: names the module exposes that no file
//   outside it uses, as code or as a type.
//
// - Module depth (module-depth.ts, TASK-646.04): each judged module's exports
//   counted by kind, the logic behind them, `EXPOSED_VALUE` and
//   `MODULE_SHALLOW`, from what this check already read of the module.
//
// What a module exposes and how the files outside it use it is read once a
// pass (module-reading.ts). A Terraform module is reached only through its
// outputs, so no entry point of it is judged unexposed, and its container
// also gets the findings about the module's shape (terraform-modules.ts).

import type { StateToCheck } from "#runtime/code-check/operations/states.ts";
import type { Piece } from "#runtime/code-check/evidence/operations/evidence.ts";
import {
	ownersAtLine,
	ownersOf,
	ownersOfSite,
	type Owners,
} from "#runtime/code-check/evidence/operations/ownership.ts";
import {
	moduleReading,
	type ModuleReading,
	type ModuleReadings,
} from "#runtime/code-check/interfaces/operations/module-reading.ts";
import type { PartCode, ReadPart, RepoCheckout } from "#runtime/code-check/operations/part-code.ts";
import { siteOf } from "#runtime/code-check/evidence/operations/relationships.ts";
import { terraformFindings } from "#runtime/code-check/interfaces/operations/terraform-modules.ts";
import {
	moduleOf,
	within,
	type ExposedName,
} from "#runtime/code-facts/modules/operations/module-exposure.ts";
import { isTestPath } from "#runtime/code-check/operations/part-code.ts";
import { moduleDepth, reaches, topLevel } from "#runtime/module-depth/operations/module-depth.ts";
import { type FactsPass } from "#runtime/code-facts/services/reader.ts";
import { nodeSubject } from "@archboard/model/vault-policy";
import type {
	CodeCheckSkip,
	CodeEvidence,
	CodeFinding,
	ModuleDepth,
} from "#shared/protocol/code-check.ts";
import { inspectContainer } from "@archboard/model/container-interface";
import type { SemanticNode } from "@archboard/model/content";
import { describeSubject } from "@archboard/model/policy";
import type { interfaceMeasures } from "@archboard/model/container-interface";

type ContainerInterface = Parameters<typeof interfaceMeasures>[0];

/** What judging the containers of one document needs. */
interface InterfaceReading {
	readonly read: StateToCheck;
	readonly codes: ReadonlyMap<string, PartCode>;
	/** Each part and the parts that hold it, the part first. */
	readonly lineages: ReadonlyMap<string, ReadonlySet<string>>;
	/** The evidence between the document's bound parts. */
	readonly pieces: readonly Piece[];
	readonly facts: FactsPass;
	readonly modules: ModuleReadings;
}

/** One judged module measured from its code, at its document and variant. */
type DepthRecord = Omit<ModuleDepth, "state">;

/** What the containers of one document give. */
interface InterfaceOutcome {
	readonly findings: CodeFinding[];
	readonly skipped: CodeCheckSkip[];
	readonly depth: DepthRecord[];
}

/** One part bound to a module, and what judging it reads. */
interface Judged {
	readonly reading: InterfaceReading;
	readonly container: SemanticNode;
	readonly module: ModuleReading;
	readonly checkout: RepoCheckout;
	readonly owners: Owners;
}

/**
 * Each part and every part inside it.
 * @param reading The document.
 * @param id The part.
 * @returns The ids.
 */
function sideOf(reading: InterfaceReading, id: string): Set<string> {
	return new Set(
		[...reading.lineages].flatMap(([inside, chain]) => (chain.has(id) ? [inside] : [])),
	);
}

/**
 * The exposed names a child of the container owns: names whose definition
 * belongs to it or to a part inside it.
 * @param judged The container.
 * @param child The child.
 * @returns The names.
 */
function ownedBy(judged: Judged, child: SemanticNode): ExposedName[] {
	const side = sideOf(judged.reading, child.id);
	return judged.module.exposure.exposed.filter((name) =>
		ownersOfSite(judged.owners, name).some((owner) => side.has(owner.node.id)),
	);
}

/**
 * The module directory a part's bound code lies in.
 * @param code The part's code.
 * @returns Its file or directory, relative to the checkout.
 */
function boundPath(code: ReadPart): string {
	return code.grain.kind === "directory" ? code.grain.directory : code.grain.file;
}

/**
 * Whether the pass can judge a child: its bound code lies in the module, and
 * a grammar read some of it, so the definitions it holds are known.
 * @param judged The container.
 * @param child The child.
 * @returns True when it is judged.
 */
async function judgedChild(judged: Judged, child: SemanticNode): Promise<boolean> {
	const code = judged.reading.codes.get(child.id);
	const inside =
		code?.status === "read" &&
		code.checkout.root === judged.checkout.root &&
		within(judged.module.exposure.directory, boundPath(code));
	return inside && (await parsedAny(judged.reading.facts, code));
}

/**
 * Whether a grammar read some of a part's code.
 * @param facts The pass.
 * @param code The part's code.
 * @returns True for the first file a grammar read.
 */
async function parsedAny(facts: FactsPass, code: ReadPart): Promise<boolean> {
	for (const file of code.files) {
		// oxlint-disable-next-line no-await-in-loop -- the first file a grammar read is enough; the cache holds each one
		const read = await facts.read(code.checkout, file);
		if (read !== undefined && read.adapter !== "text") return true;
	}
	return false;
}

/**
 * The finding on a container whose exposed names nothing outside it uses.
 * @param judged The container.
 * @returns The finding, or undefined when every name has a use.
 */
function unusedFinding(judged: Judged): CodeFinding | undefined {
	const { exposure, uses } = judged.module;
	const declared = exposure.exposed.filter((name) => topLevel(name, exposure.exposed));
	// A name declared in several places, a C# partial type or an overload, is used where any is.
	const used = new Set(
		declared.filter((name) => uses.some((use) => reaches(name, use))).map((name) => name.name),
	);
	const names = [...new Set(declared.map((name) => name.name))].filter((name) => !used.has(name));
	if (names.length === 0) return undefined;
	const all = new Set(declared.map((name) => name.name)).size;
	const { container } = judged;
	const subject = nodeSubject(container);
	return {
		...siteOf(judged.reading.read, `nodes.${container.id}`, subject),
		severity: "information",
		code: "EXPOSED_UNUSED",
		message:
			`${describeSubject(subject)} binds the module ${JSON.stringify(exposure.directory || ".")}, which ` +
			`exposes ${names.length} of its ${all} names to no file outside it: ` +
			`${names.join(", ")}. A test is no caller. Each is interface that no caller needs: stop ` +
			"exposing it, unless a caller outside this checkout uses it.",
	};
}

/**
 * The uses by which the code of a caller the document draws reaches an entry
 * point from a file outside the module: one piece for each caller.
 * @param judged The container.
 * @param entry The entry point and the relationships that reach it.
 * @returns The pieces.
 */
function reachesPast(judged: Judged, entry: ContainerInterface["entryPoints"][number]): Piece[] {
	// Configuration outside a Terraform module reaches it only through its outputs.
	if (judged.module.terraform !== undefined) return [];
	const side = sideOf(judged.reading, entry.node.id);
	const callers = new Set(
		entry.reachedBy.flatMap((edge) => [...sideOf(judged.reading, edge.from)]),
	);
	const { directory } = judged.module.exposure;
	const pieces = judged.reading.pieces.filter(
		(piece) =>
			callers.has(piece.from) &&
			side.has(piece.to) &&
			piece.repo === judged.checkout.repo &&
			!within(directory, piece.path),
	);
	return [...new Map(pieces.map((piece) => [piece.from, piece])).values()];
}

/**
 * The finding on an entry point that owns nothing the module exposes and that
 * a caller's code reaches past the interface.
 * @param judged The container.
 * @param entry The entry point and the relationships that reach it.
 * @param pieces The uses that reach it.
 * @returns The finding.
 */
function unexposedFinding(
	judged: Judged,
	entry: ContainerInterface["entryPoints"][number],
	pieces: readonly Piece[],
): CodeFinding {
	const subject = nodeSubject(entry.node);
	const { directory, rootFiles } = judged.module.exposure;
	const resolved = pieces.some((piece) => piece.resolution === "resolved");
	return {
		...siteOf(judged.reading.read, `nodes.${entry.node.id}`, subject),
		severity: resolved ? "warning" : "information",
		code: "ENTRY_POINT_UNEXPOSED",
		message:
			`${describeSubject(subject)} is an entry point of ${JSON.stringify(judged.container.name)}, ` +
			`and the module ${JSON.stringify(directory || ".")} exposes none of its code: no name that ` +
			`${rootFiles.map((file) => JSON.stringify(file)).join(", ")} export reaches it. The code ` +
			"of its callers reaches it from outside the module all the same, past the interface. Make " +
			"the callers use what the module exposes, or expose what they use from a root file.",
		evidence: [...pieces],
	};
}

/**
 * The first run-time use of each exposed name a hidden part owns, by a file
 * that no part on the document owns there.
 * @param judged The container.
 * @param hidden The hidden part.
 * @returns One piece of evidence for each such name.
 */
function undrawnUses(judged: Judged, hidden: SemanticNode): CodeEvidence[] {
	return ownedBy(judged, hidden)
		.filter((name) => topLevel(name, judged.module.exposure.exposed))
		.flatMap((name): CodeEvidence[] => {
			const use = judged.module.uses.find(
				(each) =>
					each.runs &&
					reaches(name, each) &&
					ownersAtLine(judged.owners, each.file, each.line).length === 0,
			);
			if (use === undefined) return [];
			const { repo } = judged.checkout;
			const { file: path, line, symbol } = use;
			// A C or C++ declaration whose code is in no file the check can name matches by name only.
			const resolution = use.site.definition.declaration === true ? "candidate" : "resolved";
			return [{ kind: "call", resolution, to: hidden.id, repo, path, line, symbol }];
		});
}

/**
 * The finding on a hidden part whose exposed code a file outside the module
 * uses, with no caller on the document.
 * @param judged The container.
 * @param hidden The hidden part.
 * @param pieces One use of each name.
 * @returns The finding.
 */
function callerFinding(
	judged: Judged,
	hidden: SemanticNode,
	pieces: readonly CodeEvidence[],
): CodeFinding {
	const subject = nodeSubject(hidden);
	const container = JSON.stringify(judged.container.name);
	const files = new Set(pieces.map((piece) => piece.path)).size;
	const resolved = pieces.some((piece) => piece.resolution === "resolved");
	return {
		...siteOf(judged.reading.read, `nodes.${hidden.id}`, subject),
		severity: resolved ? "warning" : "information",
		code: "CALLER_UNDRAWN",
		message:
			`${JSON.stringify(hidden.name)} is hidden inside ${container}. Code outside module ` +
			`${JSON.stringify(judged.module.exposure.directory || ".")} uses its exports. ` +
			`${files} ${files === 1 ? "source file has" : "source files have"} no module binding in this model. ` +
			`Add the relevant callers and relationships outside ${container}. ` +
			"If this use is unintended, stop exporting the referenced code.",
		evidence: [...pieces],
	};
}

/**
 * Judge each child of one container against what its module exposes.
 * @param judged The container.
 * @param inspection The container's interface.
 * @param findings The document's findings, which this adds to.
 */
async function judgeChildren(
	judged: Judged,
	inspection: ContainerInterface,
	findings: CodeFinding[],
): Promise<void> {
	const { nodes } = judged.reading.read.variant.content;
	for (const child of nodes.filter((node) => node.parent === judged.container.id)) {
		// oxlint-disable-next-line no-await-in-loop -- one child at a time keeps the findings in document order
		if (await judgedChild(judged, child))
			findings.push(...childFindings(judged, inspection, child));
	}
}

/**
 * What one judged child of a container gives: an entry point that owns
 * nothing the module exposes, or a hidden part whose exposed code outside
 * files use with no caller on the document.
 * @param judged The container.
 * @param inspection The container's interface.
 * @param child The child.
 * @returns Its findings.
 */
function childFindings(
	judged: Judged,
	inspection: ContainerInterface,
	child: SemanticNode,
): CodeFinding[] {
	const entry = inspection.entryPoints.find((each) => each.node.id === child.id);
	if (entry !== undefined) {
		const pieces = ownedBy(judged, child).length === 0 ? reachesPast(judged, entry) : [];
		return pieces.length === 0 ? [] : [unexposedFinding(judged, entry, pieces)];
	}
	if (inspection.callers.length === 0) return [];
	const pieces = undrawnUses(judged, child);
	return pieces.length === 0 ? [] : [callerFinding(judged, child, pieces)];
}

/**
 * Judge the module one part binds, with or without parts of its own, and each
 * child of a part that holds some; or say why the pass does not.
 * @param reading The document and the pass.
 * @param container The part.
 * @param outcome What the document gives, which this adds to.
 */
async function judgeContainer(
	reading: InterfaceReading,
	container: SemanticNode,
	outcome: InterfaceOutcome,
): Promise<void> {
	const judged = await containerToJudge(reading, container, outcome.skipped);
	if (judged === undefined) return;
	outcome.findings.push(...testImportFindings(judged));
	const unused = unusedFinding(judged);
	if (unused !== undefined) outcome.findings.push(unused);
	await measureDepth(judged, outcome);
	outcome.findings.push(...terraformFindings(reading.read, container, judged.module.terraform));
	const inspection = inspectContainer(reading.read.variant.content, container);
	if (inspection.holdsParts) await judgeChildren(judged, inspection, outcome.findings);
}

/**
 * Measure a judged module from its code, and judge its exports, with what the
 * pass already read of it: its exposure, the uses outside it with the part that
 * owns each, and its own files.
 * @param judged The part and its module.
 * @param outcome What the document gives, which gains the module's depth and findings.
 */
async function measureDepth(judged: Judged, outcome: InterfaceOutcome): Promise<void> {
	const { container, module, checkout, owners, reading } = judged;
	const { directory } = module.exposure;
	const subject = nodeSubject(container);
	const site = siteOf(reading.read, `nodes.${container.id}`, subject);
	const uses = module.uses.map((use) => {
		const owner = ownersAtLine(owners, use.file, use.line)[0]?.node;
		return { ...use, reader: owner === undefined ? { name: use.file } : owner };
	});
	const files = [...checkout.files].filter((file) => within(directory, file) && !isTestPath(file));
	const depth = await moduleDepth({
		facts: reading.facts,
		checkout,
		exposure: module.exposure,
		uses,
		files,
		label: describeSubject(subject),
	});
	outcome.findings.push(...depth.findings.map((finding) => ({ ...site, ...finding })));
	const { exports, logic } = depth;
	outcome.depth.push({
		model: reading.read.document.name,
		variant: reading.read.variant.id,
		subject,
		repo: checkout.repo,
		directory,
		languages: [...depth.languages],
		unjudged: [...depth.unjudged],
		names: [...depth.names],
		exports,
		logic,
	});
}

/**
 * Warnings for external tests that import a private file of this module.
 * @param judged The container and its module.
 * @returns One warning per test and imported file.
 */
function testImportFindings(judged: Judged): CodeFinding[] {
	const { container } = judged;
	const subject = nodeSubject(container);
	return judged.module.testImports.map(({ file, found }) => ({
		...siteOf(judged.reading.read, `nodes.${container.id}`, subject),
		severity: "warning",
		code: "TEST_IMPORT_UNEXPOSED",
		message:
			`Test ${JSON.stringify(file)} imports ${JSON.stringify(found.resolved)}, a private file of ` +
			`the module ${JSON.stringify(judged.module.exposure.directory || ".")} bound to ` +
			`${describeSubject(subject)}. Use a public entry file of the module, or put the test inside it.`,
		evidence: [
			{
				kind: "import",
				resolution: "resolved",
				repo: judged.checkout.repo,
				path: file,
				line: found.line,
				symbol: found.names.map((name) => name.local).join(", ") || found.specifier,
			},
		],
	}));
}

/**
 * The skip of a container, at its document and variant.
 * @param reading The document.
 * @param container The container.
 * @param skip Why it is not judged.
 * @returns The skip.
 */
function containerSkip(
	reading: InterfaceReading,
	container: SemanticNode,
	skip: Pick<CodeCheckSkip, "reason" | "repo" | "ref" | "detail">,
): CodeCheckSkip {
	const subject = nodeSubject(container);
	const { model, variant } = siteOf(reading.read, "", subject);
	return { model, variant, subject, ...skip };
}

/**
 * A node the pass judges as a part bound to a module, with or without parts,
 * or nothing. A part whose code the pass does not read is skipped where its
 * binding is read.
 * @param reading The document and the pass.
 * @param container The node.
 * @param skipped What the document does not judge, which this adds to.
 * @returns What judging it reads, or undefined.
 */
function containerToJudge(
	reading: InterfaceReading,
	container: SemanticNode,
	skipped: CodeCheckSkip[],
): Promise<Judged | undefined> {
	const code = reading.codes.get(container.id);
	return code?.status === "read"
		? judgedContainer(reading, container, code, skipped)
		: Promise.resolve(undefined);
}

/**
 * Whether a part that holds this one binds the same module, so the pass
 * judges the module with that part.
 * @param reading The document.
 * @param node The part.
 * @param code The part's code.
 * @param directory The module the part binds.
 * @returns True when one does.
 */
function heldModule(
	reading: InterfaceReading,
	node: SemanticNode,
	code: ReadPart,
	directory: string,
): boolean {
	const holders = [...(reading.lineages.get(node.id) ?? [])].filter((id) => id !== node.id);
	return holders.some((id) => {
		const holder = reading.codes.get(id);
		return (
			holder?.status === "read" &&
			holder.checkout.root === code.checkout.root &&
			moduleDirectory(holder) === directory
		);
	});
}

/**
 * What judging a part reads: what its module exposes and who owns each
 * exposed definition. A part that binds the module of a part that holds it
 * is judged with that part.
 * @param reading The document and the pass.
 * @param container The part.
 * @param code The part's code.
 * @param skipped What the document does not judge, which gains the part
 * when no language the check reads has its module's root files.
 * @returns It, or undefined when its binding names no module, a part that
 * holds it binds the same module, or the module is unknown.
 */
async function judgedContainer(
	reading: InterfaceReading,
	container: SemanticNode,
	code: ReadPart,
	skipped: CodeCheckSkip[],
): Promise<Judged | undefined> {
	const directory = moduleDirectory(code);
	if (directory === undefined || heldModule(reading, container, code, directory)) return undefined;
	const module = await moduleReading(reading, code.checkout, directory);
	if (module === undefined) {
		const detail =
			`${directory || "."}: no language the check reads has a root file there, or its ` +
			"package.json exports names no file of the checkout";
		const skip = { reason: "exposure-unknown", repo: code.checkout.repo, detail } as const;
		skipped.push(containerSkip(reading, container, skip));
		return undefined;
	}
	const parts = [...reading.codes.values()].filter(
		(each): each is ReadPart => each.status === "read" && each.checkout.root === code.checkout.root,
	);
	return { reading, container, module, checkout: code.checkout, owners: ownersOf(parts) };
}

/**
 * The module a container's binding names: a bound directory, or the file
 * that stands for one. A symbol names none.
 * @param code The container's code.
 * @returns The module's directory, or undefined.
 */
function moduleDirectory(code: ReadPart): string | undefined {
	return code.grain.kind === "symbol" ? undefined : moduleOf(boundPath(code), code.grain.kind);
}

/**
 * Hold the interface of each container on one document against what its module exposes.
 * @param reading The document, its parts' code, and the pass.
 * @returns The findings and what was not judged.
 */
async function judgeInterfaces(reading: InterfaceReading): Promise<InterfaceOutcome> {
	const outcome: InterfaceOutcome = { findings: [], skipped: [], depth: [] };
	for (const node of reading.read.variant.content.nodes) {
		// oxlint-disable-next-line no-await-in-loop -- one container at a time keeps the findings in document order
		await judgeContainer(reading, node, outcome);
	}
	return outcome;
}

export { type DepthRecord, type ModuleReadings, judgeInterfaces };
