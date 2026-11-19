// What the application offers a reader whose code check found a checkout without the server of a
// language (TASK-646.09): a missing language server is set up by the agent of the checkout that
// misses it, with the brief that `archboard init` gives too.

import { useMemo, type ContextType } from "react";
import { languageServerSetup } from "@archboard/workspace/language-server-setup";

import { checkoutOf } from "#ui/application/clients/shell-actions.ts";
import type { NoticeStack } from "#ui/application/hooks/use-notices.ts";
import { unreachableCheckoutNotice } from "#ui/application/rules/notices.ts";
import type { LiveBinding } from "#ui/application/state/live-binding.ts";
import type { LanguageServerFixContext } from "#ui/architecture-drawing/model-reader/state/language-server-fix.ts";
import type { ModelCatalog } from "#ui/panes/model-catalog/hooks/use-model-catalog.ts";

/**
 * The setup of missing language servers, as the application offers it.
 * @param catalog The repository listing as it stands now, which names each repository's checkout.
 * @param askIn Ask the agent of a checkout, which answers whether the tab could show it.
 * @param raise Raise a notice.
 * @returns The value of the fix's context.
 */
function useLanguageServerFix(
	catalog: LiveBinding<ModelCatalog>,
	askIn: (text: string, checkout: string) => Promise<boolean>,
	raise: NoticeStack["raise"],
): ContextType<typeof LanguageServerFixContext> {
	return useMemo(
		() => ({
			/**
			 * The server a language needs, as the brief names it.
			 * @param language The language.
			 * @returns The server, if the brief knows the language.
			 */
			server: (language) => languageServerSetup([language]).needs[0]?.server,
			/**
			 * Ask the agent of the repository's checkout to set up these servers, or say why not.
			 * @param repo The repository.
			 * @param languages Its languages without a server.
			 */
			fix: (repo, languages): void => {
				const checkout = checkoutOf(catalog.read(), repo);
				const { brief } = languageServerSetup(languages);
				void (checkout === null ? Promise.resolve(false) : askIn(brief, checkout)).then((asked) => {
					if (!asked) raise(unreachableCheckoutNotice(repo));
					return undefined;
				});
			},
		}),
		[catalog, askIn, raise],
	);
}

export { useLanguageServerFix };
