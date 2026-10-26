// Each container's interface held against what its module exposes
// (ADR 0044, ADR 0046, TASK-368.10).
//
// The board's side is the interface ADR 0044 derives from the variant: the
// children of a container that relationships from outside it reach are its
// entry points, and the rest are hidden parts. The code's side is what the
// module the container binds exposes: a bound directory, or the file that
// stands for one, such as `index.ts`. Code facts say what a module exposes,
// by the rule of its language. A container bound to another file or to a
// symbol names no module, and is not judged.
//
// Each exposed name belongs to the part with the narrowest binding that holds
// its definition, as all evidence does (evidence.ts). A child owns what it or
// a part inside it owns.
//
// - `ENTRY_POINT_UNEXPOSED`: an entry point owns nothing the module exposes,
//   and the code of a caller the board draws reaches it from a file outside
//   the module, so the board and the code both reach past the interface. The
//   evidence is that use. A caller whose code shows no use, as a request over
//   a network or a call through a value shows none, or whose code lies inside
//   the module, gives no finding: the check cannot be sure, and the module's
//   exports are not how it reaches the part. A warning when a use is resolved,
//   information when all are candidates.
// - `CALLER_UNDRAWN`: a hidden part owns an exposed definition that a file
//   outside the module uses at run time, and the board draws no caller of it.
//   Where a part on the board owns that use, `RELATIONSHIP_UNDRAWN` already
//   says it, or a relationship joins the two, so this adds nothing. A warning
//   when a use is resolved, information when all are candidates. Judged only
//   where the board draws a caller of the container at all: a board that
//   draws none says nothing about the interface (ADR 0044).
// - `EXPOSED_UNUSED`, information: names the module exposes that no file
//   outside it uses, as code or as a type. The same rule, in exposed-names.ts,
//   gives each judged container its exposure reading (TASK-539.01).
//
// What a module exposes and how the files outside it use it is read once a
// pass (module-reading.ts). A Terraform module is reached only through its
// outputs, so no entry point of it is judged unexposed, and its container
// also gets the findings about the module's shape (terraform-modules.ts).

import type { BoardToCheck } from "#runtime/operations/code-check/boards.ts";
import type { Piece } from "#runtime/operations/code-check/evidence/evidence.ts";
import {
	ownersAtLine,
	ownersOf,
	ownersOfSite,
	type Owners,
} from "#runtime/operations/code-check/evidence/ownership.ts";
import {
	exposureOf,
	reaches,
	tallyNames,
	topLevel,
} from "#runtime/operations/code-check/interfaces/exposed-names.ts";
import {
	moduleReading,
	type ModuleReading,
	type ModuleReadings,
} from "#runtime/operations/code-check/interfaces/module-reading.ts";
import type { PartCode, ReadPart, RepoCheckout } from "#runtime/operations/code-check/part-code.ts";
import { siteOf } from "#runtime/operations/code-check/evidence/relationships.ts";
import { terraformFindings } from "#runtime/operations/code-check/interfaces/terraform-modules.ts";
import {
	moduleOf,
	within,
	type ExposedName,
} from "#runtime/operations/code-facts/modules/module-exposure.ts";
import { type FactsPass } from "#runtime/services/code-facts/reader.ts";
import { nodeSubject } from "@archboard/board/vault-policy";
import type {
	CodeCheckSkip,
	CodeEvidence,
	CodeFinding,
	ContainerExposure,
} from "#shared/protocol/code-check.ts";
import { inspectContainer } from "@archboard/board/container-interface";
import type { SemanticNode } from "@archboard/board/content";
import { describeSubject } from "@archboard/board/policy";
import type { interfaceMeasures } from "@archboard/board/container-interface";

type ContainerInterface = Parameters<typeof interfaceMeasures>[0];

/** What judging the containers of one board needs. */
interface InterfaceReading {
	readonly read: BoardToCheck;
	readonly codes: ReadonlyMap<string, PartCode>;
	/** Each part and the parts that hold it, the part first. */
	readonly lineages: ReadonlyMap<string, ReadonlySet<string>>;
	/** The evidence between the board's bound parts. */
	readonly pieces: readonly Piece[];
	readonly facts: FactsPass;
	readonly modules: ModuleReadings;
}

/** What the containers of one board give. */
interface InterfaceOutcome {
	readonly findings: CodeFinding[];
	readonly skipped: CodeCheckSkip[];
	/** What each judged container exposes, for the server to remember (TASK-539.01). */
	readonly exposures: ContainerExposure[];
}

/** One container bound to a module, and what judging it reads. */
interface Judged {
	readonly reading: InterfaceReading;
	readonly inspection: ContainerInterface;
	readonly module: ModuleReading;
	readonly checkout: RepoCheckout;
	readonly owners: Owners;
}

/**
 * Each part and every part inside it.
 * @param reading The board.
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
	const { exposure } = judged.module;
	const tally = tallyNames(judged.module);
	const names = tally.filter(({ uses }) => uses.length === 0).map(({ name }) => name);
	if (names.length === 0) return undefined;
	const all = tally.length;
	const { container } = judged.inspection;
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
 * The uses by which the code of a caller the board draws reaches an entry
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
			`${describeSubject(subject)} is an entry point of ${JSON.stringify(judged.inspection.container.name)}, ` +
			`and the module ${JSON.stringify(directory || ".")} exposes none of its code: no name that ` +
			`${rootFiles.map((file) => JSON.stringify(file)).join(", ")} export reaches it. The code ` +
			"of its callers reaches it from outside the module all the same, past the interface. Make " +
			"the callers use what the module exposes, or expose what they use from a root file.",
		evidence: [...pieces],
	};
}

/**
 * The first run-time use of each exposed name a hidden part owns, by a file
 * that no part on the board owns there.
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
 * uses, with no caller on the board.
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
	const container = JSON.stringify(judged.inspection.container.name);
	const files = new Set(pieces.map((piece) => piece.path)).size;
	const resolved = pieces.some((piece) => piece.resolution === "resolved");
	return {
		...siteOf(judged.reading.read, `nodes.${hidden.id}`, subject),
		severity: resolved ? "warning" : "information",
		code: "CALLER_UNDRAWN",
		message:
			`${describeSubject(subject)} is a hidden part of ${container}, and code outside the module ` +
			`${JSON.stringify(judged.module.exposure.directory || ".")} uses what it exposes, in ${files} ` +
			`${files === 1 ? "file" : "files"} that no part on this board binds. Draw the caller this ` +
			`board's question needs to it from outside ${container}, or stop exposing what no caller ` +
			"should use.",
		evidence: [...pieces],
	};
}

/**
 * Judge each child of one container against what its module exposes.
 * @param judged The container.
 * @param findings The board's findings, which this adds to.
 */
async function judgeChildren(judged: Judged, findings: CodeFinding[]): Promise<void> {
	const { inspection } = judged;
	const { nodes } = judged.reading.read.variant.content;
	for (const child of nodes.filter((node) => node.parent === inspection.container.id)) {
		// oxlint-disable-next-line no-await-in-loop -- one child at a time keeps the findings in board order
		if (await judgedChild(judged, child)) findings.push(...childFindings(judged, child));
	}
}

/**
 * What one judged child of a container gives: an entry point that owns
 * nothing the module exposes, or a hidden part whose exposed code outside
 * files use with no caller on the board.
 * @param judged The container.
 * @param child The child.
 * @returns Its findings.
 */
function childFindings(judged: Judged, child: SemanticNode): CodeFinding[] {
	const { inspection } = judged;
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
 * Judge one container, or say why the pass does not.
 * @param reading The board and the pass.
 * @param container The container.
 * @param outcome What the board gives, which this adds to.
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
	outcome.exposures.push(exposureReading(judged));
	outcome.findings.push(...terraformFindings(reading.read, container, judged.module.terraform));
	await judgeChildren(judged, outcome.findings);
}

/**
 * What a judged container exposes, name by name, at its board and variant.
 * @param judged The container.
 * @returns The exposure reading.
 */
function exposureReading(judged: Judged): ContainerExposure {
	const { container } = judged.inspection;
	const { board, variant } = judged.reading.read;
	return exposureOf(judged.module, judged.owners, {
		board: board.name,
		variant: variant.id,
		container: container.id,
	});
}

/**
 * Warnings for external tests that import a private file of this module.
 * @param judged The container and its module.
 * @returns One warning per test and imported file.
 */
function testImportFindings(judged: Judged): CodeFinding[] {
	const { container } = judged.inspection;
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
 * The skip of a container, at its board and variant.
 * @param reading The board.
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
	const { board, variant } = siteOf(reading.read, "", subject);
	return { board, variant, subject, ...skip };
}

/**
 * A node the pass judges as a container bound to a module, or nothing, with
 * the skip of a container whose code the pass does not read.
 * @param reading The board and the pass.
 * @param container The node.
 * @param skipped What the board does not judge, which this adds to.
 * @returns What judging it reads, or undefined.
 */
async function containerToJudge(
	reading: InterfaceReading,
	container: SemanticNode,
	skipped: CodeCheckSkip[],
): Promise<Judged | undefined> {
	const inspection = inspectContainer(reading.read.variant.content, container);
	const code = reading.codes.get(container.id);
	if (!inspection.holdsParts || code === undefined) return undefined;
	if (code.status === "skipped") skipped.push(containerSkip(reading, container, code.skip));
	return code.status === "read" ? judgedContainer(reading, inspection, code, skipped) : undefined;
}

/**
 * What judging a container reads: what its module exposes and who owns each
 * exposed definition.
 * @param reading The board and the pass.
 * @param inspection The container's interface.
 * @param code The container's code.
 * @param skipped What the board does not judge, which gains the container
 * when no language the check reads has its module's root files.
 * @returns It, or undefined when its binding names no module or the module is unknown.
 */
async function judgedContainer(
	reading: InterfaceReading,
	inspection: ContainerInterface,
	code: ReadPart,
	skipped: CodeCheckSkip[],
): Promise<Judged | undefined> {
	const directory = moduleDirectory(code);
	if (directory === undefined) return undefined;
	const module = await moduleReading(reading, code.checkout, directory);
	if (module === undefined) {
		const detail =
			`${directory || "."}: no language the check reads has a root file there, or its ` +
			"package.json exports names no file of the checkout";
		const skip = { reason: "exposure-unknown", repo: code.checkout.repo, detail } as const;
		skipped.push(containerSkip(reading, inspection.container, skip));
		return undefined;
	}
	const parts = [...reading.codes.values()].filter(
		(each): each is ReadPart => each.status === "read" && each.checkout.root === code.checkout.root,
	);
	return { reading, inspection, module, checkout: code.checkout, owners: ownersOf(parts) };
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
 * Hold the interface of each container on one board against what its module exposes.
 * @param reading The board, its parts' code, and the pass.
 * @returns The findings and what was not judged.
 */
async function judgeInterfaces(reading: InterfaceReading): Promise<InterfaceOutcome> {
	const outcome: InterfaceOutcome = { findings: [], skipped: [], exposures: [] };
	for (const node of reading.read.variant.content.nodes) {
		// oxlint-disable-next-line no-await-in-loop -- one container at a time keeps the findings in board order
		await judgeContainer(reading, node, outcome);
	}
	return outcome;
}

export { type ModuleReadings, judgeInterfaces };
