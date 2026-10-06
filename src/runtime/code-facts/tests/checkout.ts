// A checkout this owner writes for itself: a temporary directory and the
// files in it, which stand for the files Git lists.

import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { CheckoutFiles } from "@/runtime/code-facts/index";

/** A written checkout, and how to change and remove it. */
interface FixtureCheckout extends CheckoutFiles {
	/**
	 * Write a file, as an edit on disk.
	 * @param relative The file.
	 * @param text Its text.
	 */
	write(relative: string, text: string): void;
	/** Remove the checkout. */
	remove(): void;
}

/**
 * Write a checkout. Every file written is listed.
 * @param files Each path and its text.
 * @returns The checkout.
 */
function fixtureCheckout(files: Readonly<Record<string, string>>): FixtureCheckout {
	const root = realpathSync(mkdtempSync(join(tmpdir(), "archboard-code-facts-")));
	const listed = new Set<string>();
	/**
	 * Write one file and list it.
	 * @param relative The file.
	 * @param text Its text.
	 */
	const write = (relative: string, text: string): void => {
		mkdirSync(dirname(join(root, relative)), { recursive: true });
		writeFileSync(join(root, relative), text);
		listed.add(relative);
	};
	for (const [relative, text] of Object.entries(files)) write(relative, text);
	return {
		root,
		files: listed,
		write,
		/** Remove the checkout. */
		remove: () => {
			rmSync(root, { recursive: true, force: true });
		},
	};
}

export { type FixtureCheckout, fixtureCheckout };
