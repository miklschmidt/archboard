// What a browser going away does to a running agent's news.
//
// Nothing. A browser is a window a person closes; the agent on the other side
// of it is still running, still writing boards, and still needs to hear when
// somebody changes one underneath it. This used to clear the thread-context
// binding, which is the recipient itself — so closing a tab silenced the
// session bound to it until somebody opened another window and relinked, and no
// amount of loosening the checks further down could have helped.
//
// This is the real production action object, built by the factory the canvas
// composes, with a controller that records what is asked of it.

import { expect, test } from "bun:test";

import { createCanvasThreadLinkActions } from "../codex-workbench-adapters.js";

/**
 * A controller that remembers what it was asked to do.
 * @returns The controller and the transitions it was given.
 */
function watchingController() {
	const transitions: unknown[] = [];
	const binding = { paneId: "pane-a", target: { threadId: "thread-a" }, link: { revision: 1 } };
	return {
		transitions,
		controller: {
			snapshot: () => ({ token: { revision: 3 }, binding }),
			compareAndSwap: (transition: unknown) => {
				transitions.push(transition);
				return { token: { revision: 4 }, binding: null };
			},
		},
	};
}

/**
 * The production action object, wired to one watching controller.
 * @param controller The controller to hand it.
 * @returns The actions.
 */
function actionsWith(controller: unknown) {
	return createCanvasThreadLinkActions({
		semanticDelivery: controller,
		workhorse: undefined,
		threadLink: undefined,
		epoch: undefined,
		identity: undefined,
		candidates: undefined,
		checkoutRoot: "/checkout",
	} as never);
}

test("a browser disconnect leaves the thread-context binding alone", () => {
	const watching = watchingController();
	const actions = actionsWith(watching.controller);

	actions.onBrowserDisconnect?.(
		{ paneId: "pane-a", connection: "connection-1", linkRevision: 1 } as never,
		"closed" as never,
	);

	// The recipient survives the window: nothing was asked of the controller at
	// all, so the binding that was there is the binding that is there.
	expect(watching.transitions).toEqual([]);
	expect(watching.controller.snapshot().binding).not.toBeNull();
});

test("disconnecting twice, or without ever having bound, changes nothing either", () => {
	const watching = watchingController();
	const actions = actionsWith(watching.controller);

	for (const connection of ["connection-1", "connection-1", "connection-never-bound"]) {
		actions.onBrowserDisconnect?.(
			{ paneId: "pane-a", connection, linkRevision: 1 } as never,
			"closed" as never,
		);
	}

	expect(watching.transitions).toEqual([]);
});
