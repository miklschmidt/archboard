// The provider: the assistant-ui runtime provider around the renderer, with
// the view, actions and status the renderer needs. The runtime itself is the
// module's hook; this file only places it in the tree.

import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { createElement } from "react";
import type { ReactNode } from "react";

import { useWorkbenchRuntime } from "@/ui/workbench-runtime/hooks/use-workbench-runtime";
import type { WorkbenchRuntimeProviderProps } from "@/ui/workbench-runtime/types/runtime";

/**
 * The provider: the assistant-ui runtime provider around the renderer, with
 * the view, actions and status the renderer needs.
 * @param props The transport, options and renderer.
 * @returns The provider tree.
 */
function WorkbenchRuntimeProvider(props: WorkbenchRuntimeProviderProps): ReactNode {
	const { transport, render, ...options } = props;
	const handle = useWorkbenchRuntime(transport, options);
	return createElement(
		AssistantRuntimeProvider,
		{ runtime: handle.runtime },
		createElement(render, {
			view: handle.view,
			actions: handle.actions,
			runtimeView: handle.runtimeView,
			status: handle.status,
			assistantRuntime: handle.runtime,
		}),
	);
}

export { WorkbenchRuntimeProvider };
