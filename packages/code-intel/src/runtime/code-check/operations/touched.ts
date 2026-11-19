// The modules that the branch touched (TASK-646.04): what the shallow-module
// gate judges, so that old debt never blocks a change.
//
// The History lens reads each reading's footprint from the merge base with the
// base up to each checkout's working tree, uncommitted changes included, so a
// gate run before a commit sees them (TASK-646.02). A judged module is touched
// when its own part changed, or a changed part's binding lies inside its
// module's directory: a module bound through its `index.ts` holds the parts of
// its directory. A part whose range the lens could not read is unread, never
// untouched.
//
// Without a named base, the default-base lookup of the vault's own checkout
// decides. A caller that names a base or asks for the touched modules is
// refused when that base does not resolve, so a gate never passes because it
// read nothing. A model's policy alone never refuses the pass, which a pane
// also starts: its reading lists every part as unread, and the CLI refuses.

import { checkoutsReadFrom, vaultIdentity } from "@archboard/code-binding/resolution";
import type { DepthRecord } from "#runtime/code-check/interfaces/operations/interfaces.ts";
import type { StateToCheck } from "#runtime/code-check/operations/states.ts";
import { within } from "#runtime/code-facts/modules/operations/module-exposure.ts";
import { readFootprintEvidence } from "#runtime/history-lens/operations/footprint.ts";
import { defaultBaseOf } from "#runtime/history-lens/operations/source-refs.ts";
import type { CodeCheckAnswer } from "#shared/protocol/code-check.ts";

/** The touched modules of one reading. */
type Touched = NonNullable<CodeCheckAnswer["touched"]>[number];

/** The reasons a part's range was not read. */
const UNREAD = new Set(["base-unresolved", "head-unresolved", "no-merge-base"]);

/** What reading the touched modules needs. */
interface TouchedRequest {
	readonly vault: string;
	/** The base the caller named, if any. */
	readonly base: string | undefined;
	/** Whether the caller asked, by a base or by name, rather than a model's policy. */
	readonly asked: boolean;
	readonly signal: AbortSignal;
}

/** The refusal of a base that does not resolve. */
interface BaseUnresolved {
	readonly code: "BASE_UNRESOLVED";
	readonly error: string;
}

/** The parts of one reading the range changed, and those it could not read, before modules are known. */
interface Footprint {
	readonly read: StateToCheck;
	readonly changed: readonly {
		readonly id: string;
		readonly repo: string;
		readonly path: string;
	}[];
	readonly unread: readonly string[];
}

/**
 * The base the gate reads from: the named one, else the default base of the vault's own checkout.
 * @param request What to read.
 * @returns The base, or undefined when there is none.
 */
async function baseOf(request: TouchedRequest): Promise<string | undefined> {
	if (request.base !== undefined) return request.base;
	const own = vaultIdentity(request.vault);
	const root = checkoutsReadFrom(request.vault).find((checkout) => checkout.repo === own)?.root;
	if (root === undefined) return undefined;
	return (await defaultBaseOf(root, { signal: request.signal })) ?? undefined;
}

/**
 * The refusal of a base.
 * @param base The base, or undefined when none was found.
 * @returns The refusal.
 */
function refusal(base: string | undefined): BaseUnresolved {
	const what =
		base === undefined
			? "No base was named, and the vault's checkout has no default base: no origin/HEAD and no main."
			: `The base ${JSON.stringify(base)} resolves in no checkout of the model's bound code.`;
	return {
		code: "BASE_UNRESOLVED",
		error: `${what} The check cannot tell which modules the branch touched. Name a branch, tag or commit with --base.`,
	};
}

/**
 * The footprint of one reading from the base up to the working tree.
 * @param request What to read.
 * @param read The reading.
 * @param base The base.
 * @returns What changed, or the refusal when the base resolves in no checkout the caller asked for.
 */
async function footprintOf(
	request: TouchedRequest,
	read: StateToCheck,
	base: string,
): Promise<Footprint | BaseUnresolved> {
	const evidence = await readFootprintEvidence({
		vault: request.vault,
		document: read.document,
		against: read.variant,
		base,
		head: { workingTree: true },
		signal: request.signal,
	});
	const unresolved =
		evidence.repositories.length > 0 &&
		evidence.repositories.every(
			(each) => each.status === "unread" && each.reason === "base-unresolved",
		);
	if (request.asked && unresolved) return refusal(base);
	const changed = "changed" in evidence ? evidence.changed : [];
	return {
		read,
		changed: changed.map((part) => ({ id: part.subject.id, repo: part.repo, path: part.path })),
		unread: evidence.skipped
			.filter((skip) => UNREAD.has(skip.reason))
			.map((skip) => skip.subject.id),
	};
}

/** The footprints of the readings, once a base is known, or the refusal. */
type Footprints =
	| { readonly base: string; readonly footprints: readonly Footprint[] }
	| { readonly base: null }
	| BaseUnresolved;

/**
 * Read the footprint of each reading the gate judges.
 * @param request What to read.
 * @param states The readings.
 * @returns Their footprints, no base, or the refusal.
 */
async function readFootprints(
	request: TouchedRequest,
	states: readonly StateToCheck[],
): Promise<Footprints> {
	const base = await baseOf(request);
	if (base === undefined) return request.asked ? refusal(undefined) : { base: null };
	const footprints = await Promise.all(states.map((read) => footprintOf(request, read, base)));
	const read: Footprint[] = [];
	for (const each of footprints) {
		if ("code" in each) return each;
		read.push(each);
	}
	return { base, footprints: read };
}

/**
 * The model and state a reading names in the answer.
 * @param read The reading.
 * @returns Its canonical identities, or its document's name.
 */
function identityOf(read: StateToCheck): Pick<Touched, "model" | "state"> {
	const { model } = read;
	return model === undefined
		? { model: read.document.name, state: null }
		: { model: model.manifest.id, state: model.selectedState?.id ?? null };
}

/**
 * The modules one reading's footprint touched: each changed part, and each
 * judged module whose directory holds a changed part.
 * @param footprint The footprint.
 * @param depth The judged modules of every reading.
 * @returns The ids of the touched modules.
 */
function touchedModules(footprint: Footprint, depth: readonly DepthRecord[]): string[] {
	const { read, changed } = footprint;
	const holders = depth.filter(
		(module) =>
			module.model === read.document.name &&
			module.variant === read.variant.id &&
			changed.some((part) => part.repo === module.repo && within(module.directory, part.path)),
	);
	return [
		...new Set([...changed.map((part) => part.id), ...holders.map((each) => each.subject.id)]),
	];
}

/**
 * The touched modules of each reading, from footprints read beforehand.
 * @param footprints The footprints, or no base.
 * @param states The readings.
 * @param depth The judged modules of every reading.
 * @returns One entry for each reading.
 */
function touchedOf(
	footprints: Exclude<Footprints, BaseUnresolved>,
	states: readonly StateToCheck[],
	depth: readonly DepthRecord[],
): Touched[] {
	if (footprints.base === null) {
		return states.map((read) => ({
			...identityOf(read),
			base: null,
			modules: [],
			unread: read.variant.content.nodes.flatMap((node) =>
				node.binding === undefined ? [] : [node.id],
			),
		}));
	}
	return footprints.footprints.map((footprint) => ({
		...identityOf(footprint.read),
		base: footprints.base,
		modules: touchedModules(footprint, depth),
		unread: [...footprint.unread],
	}));
}

/**
 * Whether the touched modules of a run are read: the caller named a base or
 * asked for them, or a reading's policy turns the shallow-module gate on.
 * @param asked Whether the caller asked.
 * @param states The readings.
 * @returns True when they are read.
 */
function readsTouched(asked: boolean, states: readonly StateToCheck[]): boolean {
	return asked || states.some((read) => failsShallowModules(read.model));
}

/**
 * Whether a model's policy fails plain `archboard check` on a shallow module.
 * @param model The model a reading read, if any.
 * @returns True when it does.
 */
function failsShallowModules(model: StateToCheck["model"]): boolean {
	return model?.policy.codeCheck?.failShallowModules === true;
}

export {
	type BaseUnresolved,
	type Footprints,
	failsShallowModules,
	readFootprints,
	readsTouched,
	touchedOf,
};
