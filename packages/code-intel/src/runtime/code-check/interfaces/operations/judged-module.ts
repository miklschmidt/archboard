// What judging a module bound to a part reads, and the hand-off to Module
// depth (TASK-646.04, TASK-646.05): the module's exposure, its uses with the
// part that reads each and the module that defines what each reaches, the
// files outside it that the pass could not read whole, the callers the
// document draws whose code the pass does not read, and its own files. The
// pass reads each of them once; Module depth reads nothing twice.

import type { StateToCheck } from "#runtime/code-check/operations/states.ts";
import type { TokenType } from "#runtime/code-check/operations/resolution.ts";
import type { Piece } from "#runtime/code-check/evidence/operations/evidence.ts";
import {
	ownersAtLine,
	ownersOfSite,
	type Owners,
} from "#runtime/code-check/evidence/operations/ownership.ts";
import type {
	ModuleReading,
	ModuleReadings,
	OutsideUse,
} from "#runtime/code-check/interfaces/operations/module-reading.ts";
import {
	isTestPath,
	type PartCode,
	type RepoCheckout,
} from "#runtime/code-check/operations/part-code.ts";
import { siteOf } from "#runtime/code-check/evidence/operations/relationships.ts";
import {
	within,
	type ExposedName,
} from "#runtime/code-facts/modules/operations/module-exposure.ts";
import { moduleDepth } from "#runtime/module-depth/operations/module-depth.ts";
import type { FactsPass } from "#runtime/code-facts/services/reader.ts";
import { nodeSubject } from "@archboard/model/vault-policy";
import type { CodeCheckSkip, CodeFinding, ModuleDepth } from "#shared/protocol/code-check.ts";
import type { SemanticNode } from "@archboard/model/content";
import { describeSubject } from "@archboard/model/policy";

/** What judging the containers of one document needs. */
interface InterfaceReading {
	readonly read: StateToCheck;
	readonly codes: ReadonlyMap<string, PartCode>;
	/** Each part and the parts that hold it, the part first. */
	readonly lineages: ReadonlyMap<string, ReadonlySet<string>>;
	/** The evidence between the document's bound parts. */
	readonly pieces: readonly Piece[];
	readonly facts: FactsPass;
	/** The type the pass's language servers give a name a file declares. */
	readonly tokenType: TokenType;
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
	/** Whether the module is code the repository does not own, whose exports get no verdict. */
	readonly external: boolean;
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
 * The directory of the module whose part owns a definition, where a bound part owns it.
 * @param judged The part and its module.
 * @param site The definition.
 * @returns The directory, or undefined.
 */
function definerOf(judged: Judged, site: OutsideUse["site"]): string | undefined {
	const owner = ownersOfSite(judged.owners, site)[0];
	if (owner === undefined) return undefined;
	const { grain } = owner;
	return grain.kind === "directory" ? grain.directory : directoryOf(grain.file);
}

/**
 * The directory of a file, `""` for the checkout's root.
 * @param file The file.
 * @returns Its directory.
 */
function directoryOf(file: string): string {
	return file.slice(0, Math.max(file.lastIndexOf("/"), 0));
}

/**
 * Whether the pass read the code of a node or of a part inside it, in the module's checkout.
 * @param judged The part and its module.
 * @param id The node.
 * @returns True when it did.
 */
function readHere(judged: Judged, id: string): boolean {
	return [...sideOf(judged.reading, id)].some((inside) => {
		const code = judged.reading.codes.get(inside);
		return code?.status === "read" && code.checkout.root === judged.checkout.root;
	});
}

/**
 * The callers of an exported name that the document draws from outside the
 * part, and whose code the pass did not read: relationships into the part
 * that owns the name, or into a part that holds it up to the judged part. A
 * name the part passes on from another module is reached through the part.
 * @param judged The part and its module.
 * @param name The name.
 * @returns The callers' names.
 */
function unseenCallers(judged: Judged, name: ExposedName): string[] {
	const { reading, container } = judged;
	const side = sideOf(reading, container.id);
	const found = ownersOfSite(judged.owners, name)[0]?.node.id;
	const owner = found !== undefined && side.has(found) ? found : container.id;
	const chain = new Set([...(reading.lineages.get(owner) ?? [owner])].filter((id) => side.has(id)));
	const { nodes, edges } = reading.read.variant.content;
	const callers = edges.filter(
		(edge) => chain.has(edge.to) && !side.has(edge.from) && !readHere(judged, edge.from),
	);
	const named = new Set(callers.map((edge) => edge.from));
	return nodes.filter((node) => named.has(node.id)).map((node) => JSON.stringify(node.name));
}

/**
 * Measure a judged module from its code, and judge its exports, with what the
 * pass already read of it: its exposure, the uses outside it with the part that
 * reads each and the module that defines what each reaches, the files it could
 * not read whole, the callers drawn whose code it did not read, and its own files.
 * @param judged The part and its module.
 * @param outcome What the document gives, which gains the module's depth and findings.
 * @returns The names Module depth judged.
 */
async function measureDepth(judged: Judged, outcome: InterfaceOutcome): Promise<Set<string>> {
	const { container, module, checkout, owners, reading } = judged;
	const { directory } = module.exposure;
	const subject = nodeSubject(container);
	const site = siteOf(reading.read, `nodes.${container.id}`, subject);
	const uses = module.uses.map((use) => {
		const owner = ownersAtLine(owners, use.file, use.line)[0]?.node;
		const definer = definerOf(judged, use.site);
		return {
			...use,
			reader: owner === undefined ? { name: use.file } : owner,
			...(definer === undefined ? {} : { definer }),
		};
	});
	const files = [...checkout.files].filter((file) => within(directory, file) && !isTestPath(file));
	const depth = await moduleDepth({
		facts: reading.facts,
		checkout,
		exposure: module.exposure,
		uses,
		files,
		unread: module.unread,
		/**
		 * The drawn callers of a name whose code the pass did not read.
		 * @param name The name.
		 * @returns Their names.
		 */
		unseen: (name) => unseenCallers(judged, name),
		/**
		 * The type the language servers give an exported name where it is declared.
		 * @param name The name.
		 * @returns The type, or undefined.
		 */
		tokenType: (name) =>
			reading.tokenType(checkout, name.path, {
				line: name.definition.start,
				symbol: name.definition.symbol,
			}),
		label: describeSubject(subject),
		external: judged.external,
	});
	outcome.findings.push(...depth.findings.map((finding) => ({ ...site, ...finding })));
	if (depth.withheldBy.length > 0) {
		const { model, variant } = siteOf(reading.read, "", subject);
		const detail = depth.withheldBy.join(", ");
		outcome.skipped.push({
			reason: "logic-unparsed",
			model,
			variant,
			subject,
			repo: checkout.repo,
			detail,
		});
	}
	const { exports, logic } = depth;
	outcome.depth.push({
		model: reading.read.document.name,
		variant: reading.read.variant.id,
		subject,
		repo: checkout.repo,
		directory,
		languages: [...depth.languages],
		unjudged: [...depth.unjudged],
		names: [...depth.listed],
		exports,
		logic,
	});
	return new Set(depth.names);
}

export {
	type DepthRecord,
	type InterfaceOutcome,
	type InterfaceReading,
	type Judged,
	measureDepth,
	sideOf,
};
