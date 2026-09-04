import { createElement, type ComponentType } from "react";

import {
	loadRenderedUiTools,
	registerHappyDom,
	unregisterHappyDom,
} from "../../dom-testing/index.js";
import type { WorkbenchQueueCrossLinks, WorkbenchQueueProps } from "../contract.ts";
import type { FakeQueueTransport } from "./support.ts";

registerHappyDom();
/** Testing Library, bound to the registered window. Never import it directly. */
export const ui = await loadRenderedUiTools();
export { unregisterHappyDom };

const loaded: unknown = await import("../index.tsx");
if (typeof loaded !== "object" || loaded === null)
	throw new TypeError("The workbench queue module did not load as an object.");
const WorkbenchQueue = (loaded as Readonly<Record<string, unknown>>)
	.WorkbenchQueue as ComponentType<WorkbenchQueueProps>;
if (typeof WorkbenchQueue !== "function")
	throw new TypeError("WorkbenchQueue is not exported as a component.");

export const CROSS_LINKS: WorkbenchQueueCrossLinks = {
	workhorseTimelineId: "workbench-timeline",
	coordinatorDisclosureId: "workbench-coordinator",
	approvalsId: "workbench-approvals",
};

export interface MountedQueue {
	readonly container: HTMLElement;
	readonly user: ReturnType<(typeof ui)["userEvent"]["setup"]>;
}

export function mountQueue(transport: FakeQueueTransport): MountedQueue {
	const user = ui.userEvent.setup();
	const { container } = ui.render(
		createElement(WorkbenchQueue, { transport: transport.asTransport(), crossLinks: CROSS_LINKS }),
	);
	return { container, user };
}

/** Publish a new authoritative state the way the transport would. */
export async function publish(
	transport: FakeQueueTransport,
	...args: Parameters<FakeQueueTransport["publish"]>
): Promise<void> {
	await ui.act(async () => {
		transport.publish(...args);
	});
}

function selector(attribute: string, value?: string): string {
	return value === undefined ? `[${attribute}]` : `[${attribute}="${value}"]`;
}

export function elements(root: HTMLElement, attribute: string, value?: string): HTMLElement[] {
	return [...root.querySelectorAll<HTMLElement>(selector(attribute, value))];
}

export function element(root: HTMLElement, attribute: string, value?: string): HTMLElement {
	const found = root.querySelector<HTMLElement>(selector(attribute, value));
	if (found === null)
		throw new Error(`No element carries ${attribute}${value === undefined ? "" : `=${value}`}`);
	return found;
}

/** Every interactive element the region renders, whatever it is for. */
export function interactives(root: HTMLElement): HTMLElement[] {
	return [...root.querySelectorAll<HTMLElement>("button, a, textarea, input, select")];
}

/** Whichever settlement region is carrying text right now. */
export function settlementText(root: HTMLElement): string {
	const polite = element(root, "data-queue-settlement").textContent ?? "";
	const alert = element(root, "data-queue-settlement-alert").textContent ?? "";
	return polite === "" ? alert : polite;
}

/** The submission ids the region is presenting, in the order it drew them. */
export function renderedOrder(root: HTMLElement): string[] {
	return elements(root, "data-queue-entry").map(
		(row) => row.getAttribute("data-queue-entry") ?? "",
	);
}

export function rowFor(root: HTMLElement, submissionId: string): HTMLElement {
	return element(root, "data-queue-entry", submissionId);
}

/**
 * A control by its accessible name, inside one row or the whole region. Reading
 * the rendered name is the point: a control nobody can name is not reachable.
 */
export function named(root: HTMLElement, name: string): HTMLElement {
	return ui.within(root).getByRole("button", { name });
}

export function promptField(root: HTMLElement, label: string): HTMLTextAreaElement {
	return ui.within(root).getByRole("textbox", { name: label }) as HTMLTextAreaElement;
}

async function fire(target: HTMLElement, type: string): Promise<void> {
	await ui.act(async () => {
		target.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));
	});
}

/**
 * One HTML5 reorder gesture. `user-event` models pointers and keyboards, not
 * drag and drop, so the drag events are dispatched directly; everything else in
 * these owners goes through a real user gesture.
 */
export async function dragTo(from: HTMLElement, to: HTMLElement): Promise<void> {
	await fire(from, "dragstart");
	await fire(to, "dragover");
	await fire(to, "drop");
	await fire(from, "dragend");
}
