// What each of the workbench's places in the shell is rendered over.

import type { ReactNode } from "react";

import type { WorkbenchOwners } from "@/ui/application/lib/workbench-owners";

/** Inputs shared by the workbench's places in the shell. */
interface WorkbenchFrameProps {
	owners: WorkbenchOwners;
	reducedMotion: boolean;
}

/** Inputs for the dock body, which also carries the pane's recent activity. */
interface WorkbenchDockBodyProps extends WorkbenchFrameProps {
	/** The recent `doing` lines, rendered by the shell, or null. */
	activity: ReactNode;
}

export type { WorkbenchDockBodyProps, WorkbenchFrameProps };
