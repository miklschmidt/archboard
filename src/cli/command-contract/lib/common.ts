import { z } from "zod";

const boardRequiredRefusal = {
	code: "BOARD_REQUIRED",
	exit: 2,
	stream: "stderr" as const,
	description: "A board-sensitive request did not name a board.",
};
const vaultNotFoundRefusal = {
	code: "VAULT_NOT_FOUND",
	exit: 2,
	stream: "stderr" as const,
	description:
		"No vault was found from the working directory or the directory -C names, or a set ARCHBOARD_VAULT names no directory. " +
		"Inside a checkout only <root>/.archboard/vault counts; outside one, the nearest enclosing <dir>/.archboard/vault. Nothing was done.",
};
const vaultRequiredRefusal = {
	code: "VAULT_REQUIRED",
	exit: 2,
	stream: "stderr" as const,
	description:
		"A server call named no vault. A command names the vault it finds from the working directory or -C <dir>.",
};
const vaultUnreadableRefusal = {
	code: "VAULT_UNREADABLE",
	exit: 2,
	stream: "stderr" as const,
	description:
		"The vault the command found is not a directory the server can read. Nothing was created.",
};
const vaultRefusals = [vaultNotFoundRefusal, vaultRequiredRefusal, vaultUnreadableRefusal] as const;
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
