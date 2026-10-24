// The environment of a Git command that the CLI starts. Git finds its
// repository from the directory it runs in, unless a variable points it at
// one. A check that a Git hook runs inherits those variables for the hook's
// repository, so every Git command of the CLI runs without them.
//
// The list is the one Git clears itself before it works in another
// repository (`local_repo_env`), without the configuration variables, which
// carry the person's own rules, and with the quarantine of a receive hook,
// which forbids every ref update, the clone of a fetch included.
// GIT_CEILING_DIRECTORIES stays: it names no repository, and only stops the
// search for one where the person wants it to stop.

/** The variables that point Git at a repository, its index, its objects or its refs. */
const REPOSITORY_VARIABLES = [
	"GIT_DIR",
	"GIT_WORK_TREE",
	"GIT_IMPLICIT_WORK_TREE",
	"GIT_INDEX_FILE",
	"GIT_OBJECT_DIRECTORY",
	"GIT_ALTERNATE_OBJECT_DIRECTORIES",
	"GIT_COMMON_DIR",
	"GIT_GRAFT_FILE",
	"GIT_SHALLOW_FILE",
	"GIT_NO_REPLACE_OBJECTS",
	"GIT_REPLACE_REF_BASE",
	"GIT_NAMESPACE",
	"GIT_PREFIX",
	"GIT_QUARANTINE_PATH",
];

/**
 * The environment of one Git command: this process's, with the variables that
 * point Git at a repository removed.
 * @param set The variables the command sets on top.
 * @returns The environment.
 */
function gitEnvironment(set: Readonly<Record<string, string>>): Record<string, string | undefined> {
	const env: Record<string, string | undefined> = { ...process.env, ...set };
	for (const name of REPOSITORY_VARIABLES) delete env[name];
	return env;
}

export { gitEnvironment };
