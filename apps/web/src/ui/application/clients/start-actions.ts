// What a person can do before any pane exists. A choice writes the address, which is what starts
// the pane. It replaces the plain address, so Back leaves the page and never returns to a chooser
// that no longer stands. Everything that acts on a pane has no pane to act on.

import type { QueryClient } from "@tanstack/react-query";
import type { useRouter } from "@tanstack/react-router";

import { chooseCheckout } from "#ui/panes/model-catalog/clients/repositories.ts";
import type { NoticeStack } from "#ui/application/hooks/use-notices.ts";
import { failureNotice } from "#ui/application/rules/notices.ts";
import { PANE_IDS } from "#ui/application/rules/pane-list.ts";
import { searchOfRepository } from "#ui/panes/reading-routing/rules/search.ts";
import type { SettingsSurface, ShellActions, ThemeChoice } from "#ui/shell/rules/contracts.ts";

/** What the actions act on. */
interface StartActionDeps {
	readonly router: ReturnType<typeof useRouter>;
	readonly client: QueryClient;
	readonly notices: NoticeStack;
	readonly setTheme: (theme: ThemeChoice) => void;
	readonly openSettings: (surface: SettingsSurface) => void;
}

/** Nothing to act on before a pane exists, and no notice of this page offers an action. */
function noPane(): void {}

/**
 * No model opens before a pane exists.
 * @returns That none did.
 */
function noModel(): Promise<boolean> {
	return Promise.resolve(false);
}

/**
 * The shell's actions before any pane exists.
 * @param deps The router, the query cache, the notices and the settings.
 * @returns The actions.
 */
function createStartActions(deps: StartActionDeps): ShellActions {
	const { router, client, notices } = deps;
	/**
	 * Write the address of a repository, which starts its pane.
	 * @param model Its model, when it holds one.
	 * @param repository The repository.
	 * @returns That it was written.
	 */
	const open = async (model: string | null, repository: string): Promise<boolean> => {
		const search = searchOfRepository({}, PANE_IDS[0], repository);
		const address = model === null ? search : { ...search, [`model${PANE_IDS[0]}`]: model };
		await router.navigate({ to: "/", replace: true, search: address });
		return true;
	};
	/**
	 * Choose a checkout of a repository, and open it once this tab lists the choice.
	 * @param repository The repository.
	 * @param root The checkout.
	 */
	const choose = async (repository: string, root: string): Promise<void> => {
		try {
			await chooseCheckout(client, { repository, root });
			await open(null, repository);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			notices.raise(failureNotice("checkout-choice", "Choose checkout", message));
		}
	};
	return {
		openModel: open,
		/**
		 * With no pane beside it, a repository opens in the first pane.
		 * @param model Its model, when it holds one.
		 * @param repository The repository.
		 */
		openBeside: (model, repository): void => {
			void open(model, repository);
		},
		/**
		 * Choose a checkout, and open its repository.
		 * @param repository The repository.
		 * @param root The checkout.
		 */
		chooseCheckout: (repository, root): void => {
			void choose(repository, root);
		},
		setTheme: deps.setTheme,
		openSettings: deps.openSettings,
		selectModel: noModel,
		selectPane: noPane,
		addPane: noPane,
		closePane: noPane,
		present: noPane,
		selectNoticeAction: noPane,
		dismissNotice: notices.dismiss,
	};
}

export { createStartActions };
