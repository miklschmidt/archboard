// A stage that paints nothing and remembers what it was told, for the tests
// that hold a pane to what it asks of the canvas. The Rust tests of
// `archboard-paint` hold what the canvas then draws.

import { mock } from "bun:test";

import * as picture from "#ui/clients/semantic-board-canvas/picture/picture-stage.ts";

/** One thing a stage was told. */
interface StageCall {
	readonly call: string;
	readonly args: readonly unknown[];
}

/** Everything the stage was told, in order. */
const told: StageCall[] = [];

/**
 * Stand in for one of the stage's calls: it goes on the list, and answers nothing.
 * @param _stage The stage.
 * @param call The call's name.
 * @returns What takes the call.
 */
function recordCall(_stage: object, call: string | symbol): (...args: unknown[]) => null {
	/**
	 * Take the call.
	 * @param args What it was given.
	 * @returns Nothing to say.
	 */
	return function taken(...args: unknown[]): null {
		told.push({ call: String(call), args });
		return null;
	};
}

/** A stage that takes every call. */
const recording = new Proxy({}, { get: recordCall });

/**
 * The one stage every surface has.
 * @returns The stage.
 */
function recordingStage(): object {
	return recording;
}

void mock.module("#ui/clients/semantic-board-canvas/picture/picture-stage.ts", () => ({
	...picture,
	stageOf: recordingStage,
}));

/**
 * What one call was given, each time it was made.
 * @param call The call's name.
 * @returns Its arguments, oldest first.
 */
function calls(call: string): readonly (readonly unknown[])[] {
	return told.filter((one) => one.call === call).map((one) => one.args);
}

/** Forget what was told. */
function forgetCalls(): void {
	told.length = 0;
}

export { calls, forgetCalls, told, type StageCall };
