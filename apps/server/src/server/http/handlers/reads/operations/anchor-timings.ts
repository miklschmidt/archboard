// How the anchored call of a former `call` runs, which seeds `sync` or `async`
// in the upgrade inventory (TASK-663.08). Each anchor's repository resolves to
// its checkout on this machine once, and code facts read the call there.

import { readCallTimings } from "@archboard/code-intel/code-facts";
import {
	resolveRegisteredCheckout,
	snapshotCheckoutAccess,
} from "@archboard/code-binding/resolution";
import type { readUpgradeInventory } from "@archboard/model/store-read";

type ReadCallTiming = NonNullable<Parameters<typeof readUpgradeInventory>[1]>;
type CheckoutTimings = Awaited<ReturnType<typeof readCallTimings>>;

/**
 * Reads the timing of each listed relationship's anchored call in the checkout of its repository.
 * A relationship without an anchor, or whose repository has no checkout here, reads as unknown
 * to the code, so its kind starts empty.
 * @param vault The vault the inventory belongs to: its own checkout holds its own repository.
 * @param signal Ends the reading.
 * @returns The reader the inventory asks.
 */
async function anchorTimings(vault: string, signal: AbortSignal): Promise<ReadCallTiming> {
	const access = await snapshotCheckoutAccess({ vault, signal });
	const checkouts = new Map<string, Promise<CheckoutTimings | undefined>>();
	/**
	 * The reader of one repository's checkout, made once.
	 * @param repo The repository identity.
	 * @returns Its reader, or undefined where this machine has no checkout of it.
	 */
	const timingsOf = (repo: string) => {
		const known = checkouts.get(repo);
		if (known !== undefined) return known;
		const checkout = resolveRegisteredCheckout(repo, access);
		const timings = checkout.ok
			? readCallTimings(checkout.root, signal)
			: Promise.resolve(undefined);
		checkouts.set(repo, timings);
		return timings;
	};
	return async ({ anchor }) => {
		if (anchor === undefined) return undefined;
		const read = await timingsOf(anchor.repo);
		return read?.({ path: anchor.path, symbol: anchor.symbol });
	};
}

export { anchorTimings };
