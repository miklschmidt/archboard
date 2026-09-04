import { act, createElement, type ComponentType } from "react";
import { createRoot, type Root } from "react-dom/client";

import type { WorkbenchQueueCrossLinks, WorkbenchQueueProps } from "../contract.ts";
import {
	installMinimalDom,
	TestDataTransfer,
	TestEvent,
	type TestElement,
	type TestEventInit,
} from "./mounted-dom.ts";
import type { FakeQueueTransport } from "./support.ts";

export const CROSS_LINKS: WorkbenchQueueCrossLinks = {
	workhorseTimelineId: "workbench-timeline",
	coordinatorDisclosureId: "workbench-coordinator",
	approvalsId: "workbench-approvals",
};

const loaded: unknown = await import(new URL("../index.tsx", import.meta.url).href);
if (typeof loaded !== "object" || loaded === null)
	throw new TypeError("The workbench queue module did not load as an object.");
const WorkbenchQueue = (loaded as Readonly<Record<string, unknown>>)
	.WorkbenchQueue as ComponentType<WorkbenchQueueProps>;
if (typeof WorkbenchQueue !== "function")
	throw new TypeError("WorkbenchQueue is not exported as a component.");

export interface MountedQueue {
	readonly container: TestElement;
	readonly root: Root;
	readonly close: () => Promise<void>;
}

export async function mountQueue(transport: FakeQueueTransport): Promise<MountedQueue> {
	const dom = installMinimalDom();
	const root = createRoot(dom.container as unknown as Element);
	await act(async () => {
		root.render(
			createElement(WorkbenchQueue, {
				transport: transport.asTransport(),
				crossLinks: CROSS_LINKS,
			}),
		);
	});
	return {
		container: dom.container,
		root,
		close: async () => {
			await act(async () => root.unmount());
			dom.restore();
		},
	};
}

/** Publish a new authoritative state the way the transport would. */
export async function publish(
	transport: FakeQueueTransport,
	...args: Parameters<FakeQueueTransport["publish"]>
): Promise<void> {
	await act(async () => {
		transport.publish(...args);
	});
}

export function elements(root: TestElement, attribute: string, value?: string): TestElement[] {
	return root
		.descendants()
		.filter((candidate) =>
			value === undefined
				? candidate.hasAttribute(attribute)
				: candidate.getAttribute(attribute) === value,
		);
}

export function element(root: TestElement, attribute: string, value?: string): TestElement {
	const found = elements(root, attribute, value)[0];
	if (found === undefined)
		throw new Error(`No element carries ${attribute}${value === undefined ? "" : `=${value}`}`);
	return found;
}

/** The submission ids the region is presenting, in the order it drew them. */
export function renderedOrder(root: TestElement): string[] {
	return elements(root, "data-queue-entry").map(
		(row) => row.getAttribute("data-queue-entry") ?? "",
	);
}

/** Every interactive element the region renders, whatever it is for. */
export function interactives(root: TestElement): TestElement[] {
	return root
		.descendants()
		.filter((candidate) =>
			["BUTTON", "A", "TEXTAREA", "INPUT", "SELECT"].includes(candidate.tagName),
		);
}

/** Whichever settlement region is carrying text right now. */
export function settlementText(root: TestElement): string {
	const polite = element(root, "data-queue-settlement").textContent;
	const alert = element(root, "data-queue-settlement-alert").textContent;
	return polite === "" ? alert : polite;
}

export function control(row: TestElement, name: string, direction?: string): TestElement {
	const found = elements(row, "data-queue-control", name).find(
		(candidate) =>
			direction === undefined || candidate.getAttribute("data-queue-direction") === direction,
	);
	if (found === undefined) throw new Error(`Row has no ${name} control`);
	return found;
}

export function rowFor(root: TestElement, submissionId: string): TestElement {
	return element(root, "data-queue-entry", submissionId);
}

export async function dispatch(
	target: TestElement,
	type: string,
	init: TestEventInit = {},
): Promise<void> {
	await act(async () => {
		target.dispatchEvent(new TestEvent(type, init));
	});
}

export async function click(target: TestElement): Promise<void> {
	await dispatch(target, "click", { detail: 1 });
}

export async function press(target: TestElement, key: string): Promise<void> {
	await dispatch(target, "keydown", { key });
}

/** One HTML5 reorder gesture: pick a row up and drop it on another. */
export async function dragTo(from: TestElement, to: TestElement): Promise<void> {
	const dataTransfer = new TestDataTransfer();
	await dispatch(from, "dragstart", { dataTransfer });
	await dispatch(to, "dragover", { dataTransfer });
	await dispatch(to, "drop", { dataTransfer });
	await dispatch(from, "dragend", { dataTransfer });
}

export async function settle(): Promise<void> {
	await act(async () => {
		await Promise.resolve();
	});
}
