import type {
	CoordinatorToolPresentStepOutcome,
	CoordinatorToolPresentationPort,
} from "../index.js";

/** The step a fake pane arrives on unless a test says otherwise. */
const ARRIVED_STEP = Object.freeze({
	walkthroughId: "w1",
	walkthroughName: "For the board",
	step: 2,
	of: 4,
	heading: "One writer",
	body: "board-io owns every write.",
	subjects: ["board-io"],
	view: null,
});

type PresentStepRequest = Parameters<CoordinatorToolPresentationPort["presentStep"]>[0];

/** A presentation port that records what it was asked and answers what a test tells it to. */
interface FakePresentation extends CoordinatorToolPresentationPort {
	readonly calls: PresentStepRequest[];
	/** Answer every later call with this outcome. */
	setOutcome: (outcome: CoordinatorToolPresentStepOutcome) => void;
	/** Leave every later call waiting on the pane until its signal aborts. */
	waitForAbort: () => void;
}

/**
 * Build the fake presentation port.
 * @returns The port, arriving on `ARRIVED_STEP` by default.
 */
function fakePresentation(): FakePresentation {
	const calls: PresentStepRequest[] = [];
	let outcome: CoordinatorToolPresentStepOutcome = { tag: "ok", value: ARRIVED_STEP };
	let waiting = false;
	return {
		calls,
		presentStep: async (request) => {
			calls.push(request);
			if (waiting) {
				await new Promise<void>((resolve) => {
					request.signal.addEventListener("abort", () => resolve(), { once: true });
				});
				return { tag: "refused", reason: "expired", message: "The wait was cancelled." };
			}
			return outcome;
		},
		setOutcome: (next) => {
			outcome = next;
		},
		waitForAbort: () => {
			waiting = true;
		},
	};
}

export { ARRIVED_STEP, fakePresentation, type FakePresentation };
