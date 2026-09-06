// The owners reach the runtime's renderer through context, because the
// runtime creates the renderer element itself and the renderer type must stay
// one identity across renders. The recent activity travels the same way: the
// shell renders it, the application hands it in, the workbench places it.

import { createContext } from "react";

import type { WorkbenchOwners } from "@/ui/application/lib/workbench-owners";

/** The owners of the workbench being rendered. */
const WorkbenchOwnersContext = createContext<WorkbenchOwners | null>(null);

/** The recent `doing` lines of the pane the workbench rides, already rendered. */
const WorkbenchActivityContext = createContext<React.ReactNode>(null);

export { WorkbenchActivityContext, WorkbenchOwnersContext };
