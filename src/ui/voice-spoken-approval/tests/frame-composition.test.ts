import { expect, test } from "bun:test";

import type { BrowserSnapshot } from "../../../shared/codex-browser-model/index.js";
import type { WorkbenchOrdinaryApprovalCard } from "../../workbench-approvals/index.js";
import type { VoiceSpokenApprovalProps } from "../index.js";
import { ordinaryCard, spokenApproval } from "./fixtures.js";

interface WorkbenchFrameSpokenApprovalSlice {
	readonly card: WorkbenchOrdinaryApprovalCard;
	readonly spokenApproval: BrowserSnapshot["spokenApproval"];
}

function composeSpokenApprovalProps(
	frame: WorkbenchFrameSpokenApprovalSlice,
): VoiceSpokenApprovalProps {
	return {
		card: frame.card,
		spokenApproval: frame.spokenApproval,
	} satisfies VoiceSpokenApprovalProps;
}

test("composes a canonical browser DTO with its ordinary approval card", () => {
	const props = composeSpokenApprovalProps({
		card: ordinaryCard(),
		spokenApproval: spokenApproval("armed"),
	});

	expect(props.spokenApproval.kind).toBe("spoken_approval");
	expect(props.card.kind).toBe("ordinary");
});
