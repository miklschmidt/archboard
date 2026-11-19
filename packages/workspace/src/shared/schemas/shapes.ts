// The shapes of what workspace hands across a process boundary (ADR 0058, owner decision 18: one
// keyed getter over a closed set): the navigator's listing of repositories, the body of a choice
// of checkout, a language server file, how a command came to its vault, and the languages a
// server can be configured for. Each key has a consumer outside the package that parses with it
// or builds a schema of its own from it. Browser safe: no Node import.

import { z } from "zod";
import {
	CONFIGURABLE_LANGUAGES,
	LanguageServersSchema,
} from "#shared/schemas/configurable-languages.ts";
import { CheckoutChoiceSchema, RepositoryListingSchema } from "#shared/schemas/repositories.ts";

/** How a command came to the vault it addresses: `-C` named it, or the working directory holds it. */
const VaultOriginSchema = z.enum(["-C", "working-directory"]);

/** How a command came to the vault it addresses. */
type VaultOrigin = z.infer<typeof VaultOriginSchema>;

const SHAPES = {
	/** The answer of `GET /api/repositories`, which the navigator parses. */
	repositoryListing: RepositoryListingSchema,
	/** The body of `PUT /api/repositories/chosen`, which the server parses. */
	checkoutChoice: CheckoutChoiceSchema,
	/** The servers that one language server file names, which `repo language-server` answers. */
	languageServers: LanguageServersSchema,
	/** How a command came to its vault, which every answer that names the vault carries. */
	vaultOrigin: VaultOriginSchema,
	/** A language whose server a checkout can configure; `.options` lists them in order. */
	configurableLanguage: z.enum(CONFIGURABLE_LANGUAGES),
} as const;

/**
 * The shape a caller parses with or builds on, by its key.
 * @param key The shape's key.
 * @returns The shape.
 */
function workspaceShape<K extends keyof typeof SHAPES>(key: K): (typeof SHAPES)[K] {
	return SHAPES[key];
}

export { workspaceShape, type VaultOrigin };
