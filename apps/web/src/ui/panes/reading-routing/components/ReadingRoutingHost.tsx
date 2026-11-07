// The router itself: one code-based route at `/` whose search parameters are
// the workspace. There is no generated route tree and no router plugin; the
// tree is three lines of code because there is one page.
//
// The application is the route's component, so the panes mount once and a
// change of search parameters re-renders them where they are. Nothing is
// loaded here: restoring a workspace asks the server to point a pane at a
// model, which is a browser operation over the existing command, so the router
// owns no cache and shares none.

import type { JSX } from "react";
import {
	RouterProvider,
	createRootRoute,
	createRoute,
	createRouter,
	createBrowserHistory,
} from "@tanstack/react-router";

import {
	parseWorkspaceSearchString,
	stringifyWorkspaceSearch,
	validateWorkspaceSearch,
} from "#ui/panes/reading-routing/rules/search.ts";

const rootRoute = createRootRoute({ validateSearch: validateWorkspaceSearch });

/**
 * The router over one page.
 * @param component The application, mounted at `/`.
 * @returns The router.
 */
function createReadingRouter(component: () => JSX.Element | null) {
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
		// A model key is a string, whatever it is spelled like.
		parseSearch: parseWorkspaceSearchString,
		stringifySearch: stringifyWorkspaceSearch,
	});
}

/** The router this application registers, so navigation and blocking are typed. */
type ReadingRouter = ReturnType<typeof createReadingRouter>;

declare module "@tanstack/react-router" {
	interface Register {
		router: ReadingRouter;
	}
}

/**
 * The browser entry's root: the application inside its router.
 * @param component The application.
 * @returns The component to render, which owns the router for the tab's life.
 */
function createReadingRoutingHost(component: () => JSX.Element | null): () => JSX.Element {
	const router = createReadingRouter(component);
	/**
	 * The mounted router.
	 * @returns The provider.
	 */
	return function ReadingRoutingHost(): JSX.Element {
		return <RouterProvider router={router} />;
	};
}

export { createReadingRoutingHost };
