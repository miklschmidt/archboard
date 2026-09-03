import type { BrowserWorkbenchState } from "../workbench-transport/index.js";

export type WorkbenchCoordinatorState =
	| "loading"
	| "confirmed"
	| "stale"
	| "unavailable"
	| "priority_fallback";

export type WorkbenchCoordinatorFieldState = "confirmed" | "fallback" | "unavailable";

export interface WorkbenchCoordinatorField {
	readonly label: string;
	readonly value: string;
	readonly state: WorkbenchCoordinatorFieldState;
	readonly recovery: string | null;
}

export interface WorkbenchCoordinatorSection {
	readonly label: string;
	readonly fields: readonly WorkbenchCoordinatorField[];
}

export interface WorkbenchCoordinatorStatus {
	readonly state: WorkbenchCoordinatorState;
	readonly label: string;
	readonly detail: string;
	readonly recovery: string | null;
}

export interface WorkbenchCoordinatorSnapshot {
	readonly status: WorkbenchCoordinatorStatus;
	readonly coordinatorIdentity: WorkbenchCoordinatorSection;
	readonly coordinatorSettings: WorkbenchCoordinatorSection;
	readonly workhorse: WorkbenchCoordinatorSection;
}

export interface WorkbenchCoordinatorDisclosureProps {
	/** The browser transport's current authoritative host projection. */
	readonly state: BrowserWorkbenchState;
	readonly className?: string;
}
