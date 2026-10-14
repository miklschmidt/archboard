import { z } from "zod";

const boardRequiredRefusal = {
	code: "BOARD_REQUIRED",
	exit: 2,
	stream: "stderr" as const,
	description: "A board-sensitive request did not name a board.",
};
const vaultRequiredRefusal = {
	code: "VAULT_REQUIRED",
	exit: 2,
	stream: "stderr" as const,
	description: "A server call named no vault. Set ARCHBOARD_VAULT.",
};
const vaultUnreadableRefusal = {
	code: "VAULT_UNREADABLE",
	exit: 2,
	stream: "stderr" as const,
	description: "The vault the command names is not a directory the server can read.",
};
const vaultRefusals = [vaultRequiredRefusal, vaultUnreadableRefusal] as const;
const serverRefusal = {
	code: "SERVER_UNREACHABLE",
	exit: 3,
	stream: "stderr" as const,
	description: "The Archboard server could not be reached or started.",
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
	vaultRefusals,
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
