import { z } from "zod";

const boardRequiredRefusal = {
	code: "BOARD_REQUIRED",
	exit: 2,
	stream: "stderr" as const,
	description: "A board-sensitive request did not name a board.",
};
const serverRefusal = {
	code: "CANVAS_UNREACHABLE",
	exit: 3,
	stream: "stderr" as const,
	description: "The canvas server could not be reached or started.",
};
const browserRefusal = {
	code: "BROWSER_REQUIRED",
	exit: 4,
	stream: "stderr" as const,
	description: "The operation needs an open browser pane.",
};
const doingRefusal = {
	code: "DOING_REQUIRED",
	exit: 1,
	stream: "stderr" as const,
	description: "A board write did not declare what it was doing.",
};
const boardHeldRefusal = {
	code: "BOARD_HELD",
	exit: 5,
	stream: "stderr" as const,
	description: "Another writer currently holds the board lease.",
};
const boardVersionRefusal = {
	code: "BOARD_VERSION_CONFLICT",
	exit: 5,
	stream: "stderr" as const,
	description: "The board advanced past expect-version.",
};
const claimRevokedRefusal = {
	code: "CLAIM_REVOKED",
	exit: 5,
	stream: "stderr" as const,
	description: "The user took back the claim.",
};

const commonRefusals = [boardRequiredRefusal, serverRefusal] as const;
const boardWriteRefusals = [
	boardRequiredRefusal,
	serverRefusal,
	doingRefusal,
	boardHeldRefusal,
	boardVersionRefusal,
	claimRevokedRefusal,
] as const;
const claimRefusals = [
	boardRequiredRefusal,
	serverRefusal,
	boardHeldRefusal,
	claimRevokedRefusal,
] as const;
const serverBrowserRefusals = [serverRefusal, browserRefusal] as const;
const tail = z.array(z.string()).default([]);

export {
	boardRequiredRefusal,
	serverRefusal,
	browserRefusal,
	doingRefusal,
	boardHeldRefusal,
	boardVersionRefusal,
	claimRevokedRefusal,
	commonRefusals,
	boardWriteRefusals,
	claimRefusals,
	serverBrowserRefusals,
	tail,
};
