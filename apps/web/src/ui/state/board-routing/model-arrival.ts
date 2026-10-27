import { createContext } from "react";
import type { WorkspaceAddressing } from "#ui/hooks/board-routing/use-workspace-address.ts";

/** The existing navigation owner distinguishes a user open from an external arrival. */
const ModelArrivalContext = createContext<WorkspaceAddressing["modelArriving"] | null>(null);

export { ModelArrivalContext };
