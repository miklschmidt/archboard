// The router itself: one code-based route at `/` whose search parameters are
// the workspace. There is no generated route tree and no router plugin; the
// tree is three lines of code because there is one page.
//
// The application is the route's component, so the panes mount once and a
// change of search parameters re-renders them where they are. Nothing is
// loaded here: restoring a workspace asks the server to point a pane at a
// board, which is a browser operation over the existing command, so the router
// owns no cache and shares none.

import type { JSX } from "react";
import {
	RouterProvider,
	createRootRoute,
	createRoute,
	createRouter,
	createBrowserHistory,
} from "@tanstack/react-router";

import { validateWorkspaceSearch } from "@/ui/board-routing/search";

const rootRoute = createRootRoute({ validateSearch: validateWorkspaceSearch });

/**
 * The router over one page.
 * @param component The application, mounted at `/`.
 * @returns The router.
 */
function createBoardRouter(component: () => JSX.Element) {
	const indexRoute = createRoute({
		/**
		 * The route this one hangs off, which is what types its search.
		 * @returns The root route.
		 */
		getParentRoute: () => rootRoute,
		path: "/",
		component,
	});
	return createRouter({
		routeTree: rootRoute.addChildren([indexRoute]),
		history: createBrowserHistory(),
	});
}

/** The router this application registers, so navigation and blocking are typed. */
type BoardRouter = ReturnType<typeof createBoardRouter>;

declare module "@tanstack/react-router" {
	interface Register {
		router: BoardRouter;
	}
}

/**
 * The browser entry's root: the application inside its router.
 * @param component The application.
 * @returns The component to render, which owns the router for the tab's life.
 */
function createBoardRoutingHost(component: () => JSX.Element): () => JSX.Element {
	const router = createBoardRouter(component);
	/**
	 * The mounted router.
	 * @returns The provider.
	 */
	return function BoardRoutingHost(): JSX.Element {
		return <RouterProvider router={router} />;
	};
}

export { createBoardRoutingHost, type BoardRouter };
