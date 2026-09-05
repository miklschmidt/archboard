// A read-only thread provider for histories the transport does not own: the
// coordinator's transcript, a prior epoch, an inspect-only thread. The
// messages are the same Archboard turn projections adapted at the same seam.

import { ReadonlyThreadProvider } from "@assistant-ui/react";
import { createElement, useMemo } from "react";
import type { ReactNode } from "react";

import { toThreadMessage } from "@/ui/workbench-runtime/lib/messages";
import type { WorkbenchRuntimeView } from "@/ui/workbench-runtime/lib/view";

/** The provider's inputs. */
interface ReadonlyWorkbenchThreadProviderProps {
	readonly view: Extract<WorkbenchRuntimeView, { readonly mode: "readonly" }>;
	readonly children?: ReactNode;
}

/**
 * The read-only provider.
 * @param props The view and the children that read it.
 * @returns The provider tree.
 */
function ReadonlyWorkbenchThreadProvider(props: ReadonlyWorkbenchThreadProviderProps): ReactNode {
	const { view, children } = props;
	const messages = useMemo(() => view.turns.map(toThreadMessage), [view.turns]);
	return createElement(ReadonlyThreadProvider, { messages }, children);
}

export { ReadonlyWorkbenchThreadProvider, type ReadonlyWorkbenchThreadProviderProps };
