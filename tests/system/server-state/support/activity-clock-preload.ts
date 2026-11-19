// Control model observation, activity idle time, and the claim clock at the process boundary.
import { readFileSync } from "node:fs";
import { TEST_PANE_MESSAGE_POLL_MS } from "../../support/timing.ts";

const clock = process.env["ARCHBOARD_TEST_ACTIVITY_CLOCK"];
if (clock === undefined) throw new Error("Activity test requires its clock file.");
const now = Date.now;
Date.now = () => now() + Number(readFileSync(clock, "utf8"));
const schedule = globalThis.setTimeout;
globalThis.setTimeout = ((
	handler: (...args: unknown[]) => void,
	delay?: number,
	...args: unknown[]
) =>
	schedule(
		handler,
		delay === 8000 ? TEST_PANE_MESSAGE_POLL_MS : delay,
		...args,
	)) as typeof globalThis.setTimeout;

const repeat = globalThis.setInterval;
globalThis.setInterval = ((
	handler: (...args: unknown[]) => void,
	delay?: number,
	...args: unknown[]
) =>
	repeat(
		handler,
		delay === 1000 ? TEST_PANE_MESSAGE_POLL_MS : delay,
		...args,
	)) as typeof globalThis.setInterval;
