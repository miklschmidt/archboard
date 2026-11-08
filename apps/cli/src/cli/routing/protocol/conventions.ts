// What every command shares beyond its options: the exit codes and the environment that the CLI
// reads. The root help prints both, and the docs site reads them, so the two never disagree.

/** The exit codes of every command. A command's own help lists the refusals that take each. */
const EXIT_CODES = [
	{
		exit: 0,
		meaning:
			"The command did what it said. A check found nothing that you must fix. Information can still print.",
	},
	{
		exit: 1,
		meaning:
			"An error. `archboard check` exits 1 while a check still has a diagnostic or a warning.",
	},
	{
		exit: 2,
		meaning:
			"A usage error or a refused operation: a claim held, revoked or missing, a revision that moved, or no vault found. Read the model again and retry.",
	},
	{ exit: 3, meaning: "The Archboard server did not answer and could not start." },
	{
		exit: 4,
		meaning:
			"Something local that the command needs is missing: an open browser pane, or Chromium or `ffmpeg` to record a walkthrough.",
	},
] as const;

/** The environment variables that the CLI reads, and the one that it refuses. */
const ENVIRONMENT = [
	{ name: "ARCHBOARD_URL", meaning: "The server that commands talk to. `--url` overrides it." },
	{
		name: "ARCHBOARD_NO_AUTOSTART",
		meaning:
			"Set it to `1`, and a command no longer starts the server when nothing answers. It exits 3 instead.",
	},
	{
		name: "ARCHBOARD_REPOS",
		meaning:
			"The registry of checkouts, `repos.json`. The global `language-servers.json` is beside it.",
	},
	{
		name: "XDG_STATE_HOME",
		meaning: "On Linux, moves the state directory: the Codex sign-in, the registry and the logs.",
	},
	{
		name: "ARCHBOARD_VAULT",
		meaning: "Refused. A command finds its vault from the working directory or `-C`. Unset it.",
	},
	{ name: "EXPRESS_SERVER_URL", meaning: "Refused. It is now `ARCHBOARD_URL`. Rename it." },
] as const;

export { ENVIRONMENT, EXIT_CODES };
