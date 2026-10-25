// The repositories of this machine, and the one choice a person makes about
// them from the page: which checkout of a repository this machine reads (ADR
// 0050). The choice is `repo use` for the whole machine, so every tab hears it.

import type { z } from "zod";
import { RepositoryListingSchema, type CheckoutChoiceSchema } from "@archboard/workspace/repositories";
import { cancellable, json, mutation } from "@archboard/server-requests";

/**
 * Every repository the navigator lists, with the vault each one reads.
 * @param signal Cancels the read.
 * @returns The repositories and the vault the server was started with.
 * @throws {Error} When the server's answer is not a repository listing.
 */
async function fetchRepositories(signal?: AbortSignal): Promise<z.infer<typeof RepositoryListingSchema>> {
	const parsed = RepositoryListingSchema.safeParse(
		await json<unknown>("/api/repositories", cancellable(signal)),
	);
	if (!parsed.success) {
		throw new Error("The Archboard server did not list the repositories of this machine.");
	}
	return parsed.data;
}

/**
 * Choose the checkout of a repository that this machine reads.
 * @param choice The repository and one of its known checkouts.
 * @returns When the server has chosen it.
 */
async function chooseCheckout(choice: z.infer<typeof CheckoutChoiceSchema>): Promise<void> {
	await json("/api/repositories/chosen", mutation("PUT", choice));
}

export { chooseCheckout, fetchRepositories };
