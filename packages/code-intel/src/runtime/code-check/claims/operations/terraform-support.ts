// Whether a Terraform or OpenTofu declaration held by neither claimed end
// supports an anchor (ADR 0046).
//
// Each instance of the declaration at its site is judged in the root modules
// the ends bind, keeping instance-qualified addresses separate across multiple
// calls of the same module:
// - A listed joining declaration checks its `from` and `to` roles against both
//   claimed ends (and their descendants) in either orientation. It supports
//   when any instance matches, warns `ANCHOR_MISMATCH` when every instance
//   rules out the claimed pair, and withholds the warning when an opaque or
//   unresolved end leaves room for a match.
// - An unlisted declaration (such as an NSG filter attachment or a declaration
//   from a provider without rules) supports the anchor when one instance
//   reaches code held by both claimed ends, without emitting undrawn evidence.

import type { AnchorClaim } from "#runtime/code-check/claims/operations/claims.ts";
import { holdsAddress } from "#runtime/code-check/evidence/operations/terraform-evidence.ts";
import type { ReadCheckout } from "#runtime/code-check/operations/checkouts.ts";
import type { Definition } from "#runtime/code-facts/operations/facts.ts";
import {
	declarationAddress,
	isTerraformFile,
} from "#runtime/code-facts/terraform/operations/terraform-address.ts";
import {
	terraformConfiguration,
	terraformRootOf,
	type TerraformConfiguration,
} from "#runtime/code-facts/terraform/operations/terraform-configuration.ts";
import {
	joinRuleOf,
	type JoinRule,
} from "#runtime/code-facts/terraform/operations/terraform-providers.ts";
import type { FactsPass } from "#runtime/code-facts/services/reader.ts";
import type { CodeEvidence, CodeFinding } from "#shared/protocol/code-check.ts";
import type { SemanticNode } from "@archboard/model/content";
import { describeSubject } from "@archboard/model/policy";

/** The files a binding names, and the Terraform root module its path names, if any. */
interface BoundCode {
	readonly files: readonly string[];
	readonly root: string | undefined;
}

/** Where a Terraform declaration is defined. */
interface TerraformSite {
	readonly path: string;
	readonly definition: Pick<Definition, "start" | "end" | "declaration"> & {
		readonly symbol?: string;
	};
}

/** A holder part paired with the files its binding names in the anchor's checkout. */
interface HolderBinding {
	readonly part: SemanticNode;
	readonly bound: BoundCode | "elsewhere" | "unknown";
}

/** One listed join instance that ruled out the claimed pair, with the addresses it joins. */
interface JoinedPair {
	readonly from: readonly string[];
	readonly to: readonly string[];
}

/** Which claimed ends matched each side of a listed join instance. */
interface SideMatches {
	readonly from0: boolean;
	readonly from1: boolean;
	readonly to0: boolean;
	readonly to1: boolean;
}

/** What judging a Terraform declaration needs from `support.ts`. */
interface TerraformSupportDeps {
	readonly facts: FactsPass;
	readonly checkout: { readonly repo: string } & ReadCheckout;
	readonly boundFiles: (part: SemanticNode) => BoundCode | "elsewhere" | "unknown";
	readonly holdingAt: (
		bound: BoundCode,
		symbol: string,
		site: {
			readonly path: string;
			readonly definition: Pick<Definition, "start" | "end">;
			readonly via: readonly string[];
		},
	) => Promise<"holds" | "elsewhere" | "unknown">;
}

/** A single-argument join side whose block or value can still hold more than one target. */
const MULTI_TARGET_JOIN_ARGUMENTS = new Set([
	"default_action",
	"action",
	"destination_config",
	"policy",
]);

/**
 * Whether a provider join side is the declaration itself or a single scalar
 * argument, so a resolved side leaves no room for an additional target.
 * @param args The side's argument paths.
 * @returns True when the side accepts only one target.
 */
function isClosedJoinSide(args: readonly string[]): boolean {
	const [only] = args;
	return (
		only === undefined ||
		(args.length === 1 && !only.endsWith("s") && !MULTI_TARGET_JOIN_ARGUMENTS.has(only))
	);
}

/**
 * Whether a symbol-bound holder owns a reached Terraform address in a root module.
 * @param bound The holder's bound files and Terraform root.
 * @param symbol The holder's binding symbol.
 * @param targetAddress The reached declaration's root-relative address.
 * @param targetSite Where the checkout defines the target, if known.
 * @param configuration The root module's address space.
 * @param deps The support helpers.
 * @returns True when the holder owns that address.
 */
async function symbolHoldsAddress(
	bound: BoundCode,
	symbol: string,
	targetAddress: string,
	targetSite: ReturnType<TerraformConfiguration["siteOf"]>,
	configuration: TerraformConfiguration,
	deps: TerraformSupportDeps,
): Promise<boolean> {
	if (bound.root !== undefined) {
		return (
			bound.root === configuration.root && holdsAddress(declarationAddress(symbol), targetAddress)
		);
	}
	if (targetSite === undefined) return false;
	return (await deps.holdingAt(bound, symbol, { ...targetSite, via: [] })) === "holds";
}

/**
 * Whether one holder owns a reached Terraform address in a root module.
 * @param holder The holder part and its binding.
 * @param targetAddress The reached declaration's root-relative address.
 * @param targetSite Where the checkout defines the target, if known.
 * @param configuration The root module's address space.
 * @param deps The support helpers.
 * @returns True when the holder owns that address.
 */
async function holderOwnsAddress(
	holder: HolderBinding,
	targetAddress: string,
	targetSite: ReturnType<TerraformConfiguration["siteOf"]>,
	configuration: TerraformConfiguration,
	deps: TerraformSupportDeps,
): Promise<boolean> {
	if (typeof holder.bound === "string") return false;
	const symbol = holder.part.binding?.symbol;
	if (symbol !== undefined) {
		return symbolHoldsAddress(holder.bound, symbol, targetAddress, targetSite, configuration, deps);
	}
	return targetSite !== undefined && holder.bound.files.includes(targetSite.path);
}

/**
 * Whether any holder of one claimed end owns a reached Terraform address.
 * @param holders The end and its descendants with their resolved bindings.
 * @param targetAddress The reached declaration's root-relative address.
 * @param configuration The root module's address space.
 * @param deps The support helpers.
 * @returns True when a holder owns that address.
 */
async function endHoldsAddress(
	holders: readonly HolderBinding[],
	targetAddress: string,
	configuration: TerraformConfiguration,
	deps: TerraformSupportDeps,
): Promise<boolean> {
	const targetSite = configuration.siteOf(targetAddress);
	const checks = await Promise.all(
		holders.map((holder) =>
			holderOwnsAddress(holder, targetAddress, targetSite, configuration, deps),
		),
	);
	return checks.some(Boolean);
}

/**
 * Whether any holder of one claimed end owns at least one of the given addresses.
 * @param holders The end and its descendants.
 * @param addresses The reached addresses.
 * @param configuration The root module's address space.
 * @param deps The support helpers.
 * @returns True when one matches.
 */
async function endHoldsAny(
	holders: readonly HolderBinding[],
	addresses: readonly string[],
	configuration: TerraformConfiguration,
	deps: TerraformSupportDeps,
): Promise<boolean> {
	if (addresses.length === 0) return false;
	const checks = await Promise.all(
		addresses.map((address) => endHoldsAddress(holders, address, configuration, deps)),
	);
	return checks.some(Boolean);
}

/**
 * The addresses at one side of a listed joining declaration instance.
 * @param instanceAddress The instance's root-relative address.
 * @param reached What the instance reaches.
 * @param side Which side of the join.
 * @param rule The provider's join rule.
 * @returns The addresses on that side.
 */
function joinSideAddresses(
	instanceAddress: string,
	reached: ReturnType<TerraformConfiguration["reached"]>,
	side: "from" | "to",
	rule: JoinRule,
): string[] {
	const named = reached.filter(({ link }) => link.joins === side).map(({ to }) => to.address);
	if (named.length > 0) return named;
	return side === "to" && rule.selfTo ? [instanceAddress] : [];
}

/**
 * Whether an end has at least one holder bound into Terraform code for a root.
 * @param holders The end's holders.
 * @param root The root module's directory.
 * @returns True when the end binds Terraform code in that root.
 */
function endBoundInRoot(holders: readonly HolderBinding[], root: string): boolean {
	return holders.some(
		({ part, bound }) =>
			typeof bound !== "string" &&
			(part.binding?.symbol !== undefined && bound.root !== undefined
				? bound.root === root
				: bound.files.some((file) => isTerraformFile(file))),
	);
}

/**
 * Whether a listed join's side matches support the claimed pair in either orientation.
 * @param match Which claimed ends matched each side.
 * @returns True when one end matches `from` and the other matches `to`.
 */
function matchesPair(match: SideMatches): boolean {
	return (match.from0 && match.to1) || (match.from1 && match.to0);
}

/**
 * Whether a non-matching listed join instance surely rules out the claimed pair.
 * @param match Which claimed ends matched each side.
 * @param rule The provider's join rule.
 * @returns True when no opaque target on an open side could still match.
 */
function rulesOutPair(match: SideMatches, rule: JoinRule): boolean {
	const fromOpen = !isClosedJoinSide(rule.from);
	const toOpen = !isClosedJoinSide(rule.to);
	return !matchesPair({
		from0: match.from0 || fromOpen,
		from1: match.from1 || fromOpen,
		to0: match.to0 || toOpen,
		to1: match.to1 || toOpen,
	});
}

/**
 * Judge one instance of a listed Terraform joining declaration against the
 * two claimed ends.
 * @param instanceAddress The instance's root-relative address.
 * @param configuration The root module's address space.
 * @param rule The provider's join rule.
 * @param ends The two claimed ends' holders.
 * @param bothInRoot Whether both ends bind Terraform code in this root.
 * @param deps The support helpers.
 * @returns Whether this instance supports, leaves open, or rules out the claim.
 */
async function judgeListedInstance(
	instanceAddress: string,
	configuration: TerraformConfiguration,
	rule: JoinRule,
	ends: readonly [readonly HolderBinding[], readonly HolderBinding[]],
	bothInRoot: boolean,
	deps: TerraformSupportDeps,
): Promise<
	"supports" | "inconclusive" | { readonly status: "contradicted"; readonly pair: JoinedPair }
> {
	const reached = configuration.reached(instanceAddress);
	const from = joinSideAddresses(instanceAddress, reached, "from", rule);
	const to = joinSideAddresses(instanceAddress, reached, "to", rule);
	const [from0, from1, to0, to1] = await Promise.all([
		endHoldsAny(ends[0], from, configuration, deps),
		endHoldsAny(ends[1], from, configuration, deps),
		endHoldsAny(ends[0], to, configuration, deps),
		endHoldsAny(ends[1], to, configuration, deps),
	]);
	const match: SideMatches = { from0, from1, to0, to1 };
	if (matchesPair(match)) return "supports";
	if (!bothInRoot || from.length === 0 || to.length === 0) return "inconclusive";
	return rulesOutPair(match, rule)
		? { status: "contradicted", pair: { from, to } }
		: "inconclusive";
}

/**
 * The warning for a listed joining declaration whose instances all join other
 * declarations than the claimed ends.
 * @param claim The anchor.
 * @param site Where the joining declaration is defined.
 * @param pairs The actual pairs the instances join.
 * @param use The anchored use, if any.
 * @returns The finding.
 */
function joinPairMismatch(
	claim: AnchorClaim,
	site: TerraformSite,
	pairs: readonly JoinedPair[],
	use: CodeEvidence | undefined,
): CodeFinding {
	const ends = claim.ends.map((end) => JSON.stringify(end.name)).join(" and ");
	const actual = [
		...new Set(pairs.map(({ from, to }) => `${from.join(", ")} -> ${to.join(", ")}`)),
	].join("; ");
	return {
		...claim.site,
		severity: "warning",
		code: "ANCHOR_MISMATCH",
		message:
			`The anchor of ${describeSubject(claim.site.subject)} names ${JSON.stringify(claim.anchor.symbol)}, ` +
			`which ${site.path}:${site.definition.start} defines as a joining declaration between ${actual}, ` +
			`not between ${ends}. Cite the declaration that joins those parts, bind the parts it joins, ` +
			"or change the relationship to what the code does.",
		...(use === undefined ? {} : { evidence: [use] }),
	};
}

/**
 * The unique Terraform root modules named by either end's holders.
 * @param ends The two claimed ends' holders.
 * @returns The sorted root directories.
 */
function holderRootsOf(
	ends: readonly [readonly HolderBinding[], readonly HolderBinding[]],
): string[] {
	return [
		...new Set(
			ends.flatMap((holders) =>
				holders.flatMap(({ bound }) =>
					typeof bound === "string" || bound.root === undefined ? [] : [bound.root],
				),
			),
		),
	].toSorted();
}

/**
 * Whether any instance of an unlisted Terraform declaration reaches code held
 * by both claimed ends.
 * @param configurations The root configurations to search.
 * @param site Where the declaration is defined.
 * @param ends The two claimed ends' holders.
 * @param deps The support helpers.
 * @returns True when one instance reaches both ends.
 */
async function unlistedReachesBoth(
	configurations: readonly TerraformConfiguration[],
	site: TerraformSite,
	ends: readonly [readonly HolderBinding[], readonly HolderBinding[]],
	deps: TerraformSupportDeps,
): Promise<boolean> {
	const perRoot = await Promise.all(
		configurations.map(async (configuration) => {
			const instances = configuration.addressesAt(site.path, site.definition.start);
			const verdicts = await Promise.all(
				instances.map(async (instanceAddress) => {
					const targets = configuration.reached(instanceAddress).map(({ to }) => to.address);
					const [holds0, holds1] = await Promise.all([
						endHoldsAny(ends[0], targets, configuration, deps),
						endHoldsAny(ends[1], targets, configuration, deps),
					]);
					return holds0 && holds1;
				}),
			);
			return verdicts.some(Boolean);
		}),
	);
	return perRoot.some(Boolean);
}

/**
 * Judge every instance of a listed Terraform joining declaration across the
 * configurations that hold it.
 * @param claim The anchor.
 * @param site Where the declaration is defined.
 * @param configurations The root configurations to search.
 * @param rule The provider's join rule.
 * @param ends The two claimed ends' holders.
 * @param use The anchored use, if any.
 * @param deps The support helpers.
 * @returns Whether the join supports, withholds judgment, or contradicts the claim.
 */
async function judgeListedConfigurations(
	claim: AnchorClaim,
	site: TerraformSite,
	configurations: readonly TerraformConfiguration[],
	rule: JoinRule,
	ends: readonly [readonly HolderBinding[], readonly HolderBinding[]],
	use: CodeEvidence | undefined,
	deps: TerraformSupportDeps,
): Promise<"supports" | "withhold" | CodeFinding> {
	const verdicts = (
		await Promise.all(
			configurations.map((configuration) => {
				const instances = configuration.addressesAt(site.path, site.definition.start);
				const bothInRoot =
					endBoundInRoot(ends[0], configuration.root) &&
					endBoundInRoot(ends[1], configuration.root);
				return Promise.all(
					instances.map((instanceAddress) =>
						judgeListedInstance(instanceAddress, configuration, rule, ends, bothInRoot, deps),
					),
				);
			}),
		)
	).flat();
	if (verdicts.includes("supports")) return "supports";
	if (verdicts.includes("inconclusive")) return "withhold";
	const contradicted = verdicts.flatMap((verdict) =>
		typeof verdict === "string" ? [] : [verdict.pair],
	);
	return contradicted.length > 0 ? joinPairMismatch(claim, site, contradicted, use) : "withhold";
}

/**
 * The root modules to inspect for a Terraform declaration, or empty when none applies.
 * @param holderRoots The roots named by the ends' bindings.
 * @param rule The provider join rule, if listed.
 * @param site Where the declaration is defined.
 * @param checkout The anchor's checkout.
 * @returns The root directories to read.
 */
function rootsToInspect(
	holderRoots: readonly string[],
	rule: JoinRule | undefined,
	site: TerraformSite,
	checkout: ReadCheckout,
): readonly string[] {
	if (holderRoots.length > 0) return holderRoots;
	if (rule !== undefined) return [];
	const siteRoot = terraformRootOf(site.path, "file", checkout.files);
	return siteRoot === undefined ? [] : [siteRoot];
}

/**
 * The join rule of an anchored Terraform site, if its provider lists one.
 * @param site Where the declaration is defined.
 * @returns The join rule, or undefined.
 */
function ruleOfSite(site: TerraformSite): JoinRule | undefined {
	return site.definition.symbol === undefined ? undefined : joinRuleOf(site.definition.symbol);
}

/**
 * The verdict when a Terraform declaration has no inspectable distinct pair of ends.
 * @param rule The provider join rule, if listed.
 * @returns `withhold` for a listed join, `outside` otherwise.
 */
function unresolvedOutcome(rule: JoinRule | undefined): "withhold" | "outside" {
	return rule === undefined ? "outside" : "withhold";
}

/**
 * The resolved holder bindings for the two distinct ends of a claim, if it has two.
 * @param claim The anchor.
 * @param deps The support helpers.
 * @returns Both ends' holder bindings, or undefined.
 */
function boundEndPair(
	claim: AnchorClaim,
	deps: TerraformSupportDeps,
): readonly [readonly HolderBinding[], readonly HolderBinding[]] | undefined {
	const [end0, end1] = claim.endHolders;
	if (end0 === undefined || end1 === undefined) return undefined;
	if (claim.ends[0]?.id === claim.ends[1]?.id) return undefined;
	return [
		end0.map((part) => ({ part, bound: deps.boundFiles(part) })),
		end1.map((part) => ({ part, bound: deps.boundFiles(part) })),
	];
}

/**
 * Judge a Terraform declaration that neither end holds directly, per
 * declaration instance across the root modules the ends bind.
 * @param claim The anchor.
 * @param site Where the declaration is defined.
 * @param use The anchored use, if any.
 * @param deps The support helpers.
 * @returns Whether the declaration supports or withholds judgment, stays
 * outside, or directly contradicts the claimed pair.
 */
async function judgeTerraformDeclaration(
	claim: AnchorClaim,
	site: TerraformSite,
	use: CodeEvidence | undefined,
	deps: TerraformSupportDeps,
): Promise<"supports" | "withhold" | "outside" | CodeFinding> {
	const rule = ruleOfSite(site);
	const ends = boundEndPair(claim, deps);
	if (ends === undefined) return unresolvedOutcome(rule);
	const roots = rootsToInspect(holderRootsOf(ends), rule, site, deps.checkout);
	if (roots.length === 0) return unresolvedOutcome(rule);
	const configurations = await Promise.all(
		roots.map((root) => terraformConfiguration(deps.facts, deps.checkout, root)),
	);
	if (rule === undefined) {
		return (await unlistedReachesBoth(configurations, site, ends, deps)) ? "supports" : "outside";
	}
	return judgeListedConfigurations(claim, site, configurations, rule, ends, use, deps);
}

export { judgeTerraformDeclaration };
