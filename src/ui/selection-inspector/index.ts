import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

import { CodeBindingSchema, type CodeBinding } from "../../shared/code-target/index.js";

export type SelectionElement = Pick<ExcalidrawElement, "id" | "type" | "customData">;

type InspectedMetadata = Partial<Record<"node" | "kind" | "name" | "variant" | "level", string>>;

export interface InspectedElement {
	readonly id: ExcalidrawElement["id"];
	readonly type: ExcalidrawElement["type"];
	readonly metadata: Readonly<InspectedMetadata>;
}

export type SelectionProjection =
	| { readonly state: "empty" }
	| { readonly state: "multiple"; readonly count: number }
	| { readonly state: "missing"; readonly id: string }
	| { readonly state: "unbound"; readonly element: InspectedElement }
	| { readonly state: "malformed"; readonly element: InspectedElement }
	| {
			readonly state: "bound";
			readonly element: InspectedElement;
			readonly binding: CodeBinding;
	  };

export interface PaneSelectionSnapshot {
	readonly boardKey: string | null;
	readonly projection: SelectionProjection;
}

function sameElement(left: InspectedElement, right: InspectedElement): boolean {
	if (left.id !== right.id || left.type !== right.type) return false;
	for (const key of ["node", "kind", "name", "variant", "level"] as const) {
		if (left.metadata[key] !== right.metadata[key]) return false;
	}
	return true;
}

export function sameSelectionProjection(
	left: SelectionProjection,
	right: SelectionProjection,
): boolean {
	if (left.state !== right.state) return false;
	if (left.state === "empty" && right.state === "empty") return true;
	if (left.state === "multiple" && right.state === "multiple") return left.count === right.count;
	if (left.state === "missing" && right.state === "missing") return left.id === right.id;
	if (left.state === "unbound" && right.state === "unbound") {
		return sameElement(left.element, right.element);
	}
	if (left.state === "malformed" && right.state === "malformed") {
		return sameElement(left.element, right.element);
	}
	if (left.state !== "bound" || right.state !== "bound") return false;
	return (
		sameElement(left.element, right.element) &&
		left.binding.repo === right.binding.repo &&
		left.binding.path === right.binding.path &&
		left.binding.branch === right.binding.branch &&
		left.binding.commit === right.binding.commit &&
		left.binding.confirmedAt === right.binding.confirmedAt
	);
}

function record(value: unknown): Readonly<Record<string, unknown>> | null {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Readonly<Record<string, unknown>>)
		: null;
}

function inspectElement(element: SelectionElement): InspectedElement {
	const customData = record(element.customData);
	const archboard = record(customData?.archboard);
	const metadata: InspectedMetadata = {};
	for (const key of ["node", "kind", "name", "variant", "level"] as const) {
		const value = archboard?.[key];
		if (typeof value === "string") metadata[key] = value;
	}
	return { id: element.id, type: element.type, metadata };
}

function isPortableBindingPath(path: string): boolean {
	if (
		path.includes("\0") ||
		path.startsWith("/") ||
		path.startsWith("\\") ||
		/^[a-zA-Z]:/.test(path) ||
		path.startsWith("file://")
	)
		return false;
	let depth = 0;
	for (const segment of path.replaceAll("\\", "/").split("/")) {
		if (!segment || segment === ".") continue;
		if (segment === "..") depth -= 1;
		else depth += 1;
		if (depth < 0) return false;
	}
	return true;
}

export function projectSelection(
	scene: readonly SelectionElement[],
	selectedIds: readonly string[],
): SelectionProjection {
	if (selectedIds.length === 0) return { state: "empty" };
	if (selectedIds.length > 1) return { state: "multiple", count: selectedIds.length };
	const id = selectedIds[0]!;
	const selected = scene.find((element) => element.id === id);
	if (!selected) return { state: "missing", id };
	const element = inspectElement(selected);
	const customData = record(selected.customData);
	const archboard = record(customData?.archboard);
	if (!("binding" in (archboard ?? {}))) return { state: "unbound", element };
	const binding = CodeBindingSchema.safeParse(archboard?.binding);
	if (!binding.success || !isPortableBindingPath(binding.data.path)) {
		return { state: "malformed", element };
	}
	return { state: "bound", element, binding: binding.data };
}
