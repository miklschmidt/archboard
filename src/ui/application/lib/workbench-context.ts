// The owners reach the runtime's renderer through context, because the
// runtime creates the renderer element itself and the renderer type must stay
// one identity across renders.

import { createContext } from "react";

import type { WorkbenchOwners } from "@/ui/application/lib/workbench-owners";

/** The owners of the workbench being rendered. */
const WorkbenchOwnersContext = createContext<WorkbenchOwners | null>(null);

export { WorkbenchOwnersContext };
