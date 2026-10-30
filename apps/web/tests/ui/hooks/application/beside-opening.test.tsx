// A view belongs to one board in one repository. A board of the same name in
// another repository must not receive that view when it opens beside.

import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, expect, test } from "bun:test";

import { emptyPaneStatus } from "#ui/rules/application/pane-records.ts";
import type { BoardBeside } from "#ui/rules/shell/contracts.ts";

GlobalRegistrator.register();
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, writable: true });

const { act, cleanup, renderHook } = await import("@testing-library/react");
const { useBesideOpening } = await import("#ui/hooks/application/use-beside-opening.ts");
const { usePaneReadings } = await import("#ui/hooks/application/use-pane-reading.ts");
const { usePanes } = await import("#ui/hooks/application/use-panes.ts");

afterEach(cleanup);
afterAll(async () => GlobalRegistrator.unregister());

/** The repository and view of the source pane's shop board. */
const SOURCE = { repository: "github.com/acme/shop", view: "orders" };

/**
 * The opening and reading owners, with a shell that adds a pane on the requested board.
 * @returns The panes, their readings and the action that opens beside.
 */
function useOpening() {
	const panes = usePanes();
	const readings = usePaneReadings(panes.links);
	const openBeside = useBesideOpening(
		panes,
		{
			/**
			 * Add a pane without mounting its socket.
			 * @param beside The board it is added for.
			 * @returns Whether it was added.
			 */
			addPane: (beside?: BoardBeside): boolean =>
				panes.add({
					board: beside?.key ?? "shop",
					vault: "/work/target/.archboard/vault",
				}),
			selectPane: panes.select,
			/**
			 * A pane added on its board needs no show command.
			 * @returns Never.
			 */
			selectBoard: async (): Promise<never> => {
				throw new Error("The new pane must start on its board.");
			},
		},
		readings,
	);
	return { panes, readings, openBeside };
}

test.each([
	{ repository: undefined, view: SOURCE.view },
	{ repository: SOURCE.repository, view: SOURCE.view },
	{ repository: "github.com/acme/billing", view: null },
])("opening beside in $repository carries only that repository's view", ({ repository, view }) => {
	const { result } = renderHook(useOpening);
	act(() =>
		result.current.panes.patch("A", {
			status: {
				...emptyPaneStatus("A"),
				boardKey: "shop",
				opened: "shop",
				vault: "/work/shop/.archboard/vault",
				...SOURCE,
			},
		}),
	);
	act(() => result.current.openBeside("shop@proposal", repository));
	act(() => result.current.readings.boardChanged("B", "shop@proposal", null));
	expect(result.current.readings.viewOf("B")).toBe(view);
});
