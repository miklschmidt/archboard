// The opener settings flow: what the settings dialog runs against. The
// dialog itself lives in `src/ui/opener-settings`; this module owns reading,
// testing, saving and resetting, as a store the dialog's host subscribes to.

import { useEffect, useState, useSyncExternalStore } from "react";

import type { CodeTargetNotice } from "@/shared/code-target";
import {
	createOpenerSettingsFlow,
	type OpenerSettingsFlow,
	type OpenerSettingsFlowListener,
	type OpenerSettingsFlowState,
} from "@/ui/opener-settings-flow/lib/flow";

/** The flow and what it renders, for a mounted dialog host. */
interface MountedOpenerSettingsFlow {
	readonly flow: OpenerSettingsFlow;
	readonly state: OpenerSettingsFlowState;
}

/** A listener that forwards to whichever listener the host rendered last. */
class LiveListener implements OpenerSettingsFlowListener {
	#target: OpenerSettingsFlowListener;

	/**
	 * Start with the listener the host mounted with.
	 * @param target The listener.
	 */
	constructor(target: OpenerSettingsFlowListener) {
		this.#target = target;
	}

	/**
	 * The host rendered a new listener.
	 * @param target The listener.
	 */
	replace(target: OpenerSettingsFlowListener): void {
		this.#target = target;
	}

	/**
	 * Forward a success.
	 * @param message What succeeded.
	 */
	onSuccess(message: string): void {
		this.#target.onSuccess(message);
	}

	/**
	 * Forward a failure.
	 * @param notice What failed.
	 */
	onFailure(notice: CodeTargetNotice): void {
		this.#target.onFailure(notice);
	}

	/** Forward the save. */
	onSaved(): void {
		this.#target.onSaved();
	}
}

/**
 * Run the opener settings flow for a mounted dialog: the settings are read
 * once on mount, and every action re-renders the host.
 * @param listener Who hears the outcomes; read live, so it need not be stable.
 * @returns The flow and its current state.
 */
function useOpenerSettingsFlow(listener: OpenerSettingsFlowListener): MountedOpenerSettingsFlow {
	const [live] = useState(() => new LiveListener(listener));
	const [flow] = useState(() => createOpenerSettingsFlow({ listener: live }));
	useEffect(() => {
		live.replace(listener);
	}, [live, listener]);
	useEffect(() => {
		void flow.load();
	}, [flow]);
	const state = useSyncExternalStore(flow.subscribe, flow.getSnapshot, flow.getSnapshot);
	return { flow, state };
}

export { useOpenerSettingsFlow, type MountedOpenerSettingsFlow };
export {
	createOpenerSettingsFlow,
	type OpenerSettingsApi,
	type OpenerSettingsBusy,
	type OpenerSettingsFlow,
	type OpenerSettingsFlowListener,
	type OpenerSettingsFlowOptions,
	type OpenerSettingsFlowState,
} from "@/ui/opener-settings-flow/lib/flow";
