const vaultNotFoundRefusal = {
	code: "VAULT_NOT_FOUND",
	exit: 2,
	stream: "stderr" as const,
	description:
		"No vault was found from the working directory or the directory -C names. " +
		"Inside a checkout only <root>/.archboard/vault counts; outside one, the nearest enclosing <dir>/.archboard/vault. " +
		"In a checkout with no vault, the refusal names each known vault whose models bind the checkout's repository, as the -C to give. Nothing was done.",
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
	description: "A model write did not declare what it was doing.",
};

const serverBrowserRefusals = [serverRefusal, browserRefusal] as const;

export { serverRefusal, vaultRefusals, doingRefusal, serverBrowserRefusals };
