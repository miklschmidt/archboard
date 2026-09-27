// Graphviz asked once for each graph one layout of a board gives it. Laying
// a board out lays many of its blocks the same way more than once: to line a
// wrap up before it is routed, and again with the ports it settled held.
// Graphviz answers a graph the same way every time, so a graph it has
// answered is answered again from what it said, copied so no caller shares
// another's answer.
import type { Viz } from "@viz-js/viz";

/** What the block engine asks of Graphviz: a graph laid out, read as JSON. */
type Graphviz = Pick<Viz, "renderJSON">;

/**
 * Graphviz answering each graph it has answered before from what it said
 * then. It lives for one layout of a board, so it keeps no more answers than
 * Graphviz gave that layout.
 * @param viz The initialized Graphviz instance.
 * @returns Graphviz, answering each graph once.
 */
function answeringOnce(viz: Graphviz): Graphviz {
	const answers = new Map<string, object>();
	return {
		/**
		 * A graph laid out, as Graphviz answered it the first time it was asked.
		 * @param input The graph.
		 * @param options How it is laid out.
		 * @returns Graphviz's answer, read as JSON.
		 */
		renderJSON: (input, options) => {
			const asked = JSON.stringify([input, options]);
			let answer = answers.get(asked);
			if (answer === undefined) {
				answer = viz.renderJSON(input, options);
				answers.set(asked, answer);
			}
			return structuredClone(answer);
		},
	};
}

export { answeringOnce, type Graphviz };
