import type { ReactNode } from "react";

import { WorkbenchBoardStatus } from "../../workbench-board-status/index.js";
import type { WorkbenchFramePane } from "../contract.js";

/**
 * The collapsed drawer keeps the durable board claim and the latest reported
 * action visible. Conversation, queue, voice detail, and configuration return
 * only when the person asks for them.
 */
export function WorkbenchFrameCompact({ pane }: { readonly pane: WorkbenchFramePane }): ReactNode {
	return (
		<section
			aria-label={`${pane.identity.label} compact agent status`}
			className="min-w-0 bg-surface-raised"
			data-workbench-content="compact"
			data-workbench-region="compact"
		>
			<WorkbenchBoardStatus {...pane.boardStatus} paneLabel={pane.identity.label} />
		</section>
	);
}
