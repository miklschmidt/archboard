// The Terraform and OpenTofu plan JSON files an agent names with `--plan`
// (ADR 0046, TASK-367.17).
//
// The server takes a path from any request on this machine, so it reads a plan
// only inside a checkout the pass reads: the checkout that holds the vault, or
// the chosen checkout of another repository (ADR 0049). The path must stay
// inside the checkout before and after its symbolic links resolve, as the code
// opener's rules hold a bound path. A plan is usually a file Git ignores, written by
// `terraform show -json` or `tofu show -json`, so Git need not list it. It is
// never Terraform state, a variable file or a file under `.terraform`, which
// the check never reads. A plan describes the root module of the directory
// that holds it. Of its text, the check keeps only addresses and references
// (terraform-plan.ts). A path that breaks any of this refuses the whole check
// with the reason, because an agent asked for that plan to be read.

import fs from "node:fs";
import path from "node:path";
import { neverRead } from "#runtime/operations/code-facts/never-read.ts";
import {
	readTerraformPlan,
	type TerraformPlan,
} from "#runtime/operations/code-facts/terraform/terraform-plan.ts";
import {
	isPathWithin,
	resolveRegisteredCheckout,
	snapshotCheckoutAccess,
	type CheckoutSnapshot,
} from "@archboard/code-binding/resolution";
import { errorMessage } from "@archboard/diagnostics/errno";

/** A named plan the check refuses to read, and why. */
interface PlanRefused {
	readonly refused: "plan";
	readonly plan: string;
	readonly reason: string;
}

/** The plans an agent named, read, or the first one the check refuses. */
type ReadPlans =
	| { readonly ok: true; readonly plans: readonly TerraformPlan[] }
	| ({ readonly ok: false } & PlanRefused);

/**
 * The registered checkout that holds a file, before and after its links resolve.
 * @param lexical The file as named, absolute.
 * @param real The file its links lead to.
 * @param snapshot The registered checkouts.
 * @returns The checkout's root, or undefined when none holds it.
 */
function checkoutHolding(
	lexical: string,
	real: string,
	snapshot: CheckoutSnapshot,
): string | undefined {
	for (const entry of snapshot.entries) {
		const checkout = resolveRegisteredCheckout(entry.repo, snapshot);
		if (!checkout.ok || !isPathWithin(checkout.root, real)) continue;
		if ([checkout.root, entry.root].some((root) => isPathWithin(root, lexical)))
			return checkout.root;
	}
	return undefined;
}

/**
 * Where a named plan is, inside a registered checkout, or why the check refuses it.
 * @param named The plan's path, absolute.
 * @param snapshot The registered checkouts.
 * @returns The file its links lead to and its checkout, or the reason.
 */
function locatePlan(
	named: string,
	snapshot: CheckoutSnapshot,
): { readonly real: string; readonly root: string } | string {
	if (!path.isAbsolute(named)) return "it is not an absolute path";
	let real: string;
	try {
		real = fs.realpathSync.native(named);
	} catch {
		return "there is no such file";
	}
	const root = checkoutHolding(path.resolve(named), real, snapshot);
	if (root === undefined) {
		return "it is not inside the checkout that holds the vault or the chosen checkout of any other repository on this machine, which are the checkouts the check reads";
	}
	const relative = path.relative(root, real).split(path.sep).join("/");
	return neverRead(relative)
		? "it is Terraform state, a variable file or under .terraform"
		: { real, root };
}

/**
 * Read one named plan, or say why the check refuses it.
 * @param named The plan's path, absolute.
 * @param snapshot The registered checkouts.
 * @returns The plan, or the reason.
 */
async function readPlan(
	named: string,
	snapshot: CheckoutSnapshot,
): Promise<TerraformPlan | string> {
	const located = locatePlan(named, snapshot);
	if (typeof located === "string") return located;
	const relative = path.relative(located.root, located.real).split(path.sep).join("/");
	const module = path.posix.dirname(relative);
	try {
		const configuration = readTerraformPlan(await Bun.file(located.real).text());
		return {
			checkoutRoot: located.root,
			path: relative,
			module: module === "." ? "" : module,
			configuration,
		};
	} catch (error) {
		return `it is not a plan JSON from terraform show -json or tofu show -json: ${errorMessage(error)}`;
	}
}

/**
 * Read every plan an agent named.
 * @param vault The vault directory the check reads.
 * @param named Each plan's path, absolute, as the agent named it.
 * @param signal Cancels the reading.
 * @returns The plans, or the first the check refuses.
 */
async function readPlans(
	vault: string,
	named: readonly string[],
	signal: AbortSignal,
): Promise<ReadPlans> {
	if (named.length === 0) return { ok: true, plans: [] };
	const snapshot = await snapshotCheckoutAccess({ vault, signal, timeoutMs: null });
	const plans: TerraformPlan[] = [];
	for (const plan of named) {
		// oxlint-disable-next-line no-await-in-loop -- the first plan refused refuses the check, so later plans are never read
		const read = await readPlan(plan, snapshot);
		if (typeof read === "string") return { ok: false, refused: "plan", plan, reason: read };
		plans.push(read);
	}
	return { ok: true, plans };
}

export { type PlanRefused, readPlans };
