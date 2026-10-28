import { createContext } from "react";
import type { WorkspaceAddressing } from "#ui/hooks/board-routing/use-workspace-address.ts";

/** The navigation owner distinguishes restore acknowledgements, user opens, and external arrivals. */
const ModelArrivalContext = createContext<WorkspaceAddressing["modelArriving"] | null>(null);

export { ModelArrivalContext };
