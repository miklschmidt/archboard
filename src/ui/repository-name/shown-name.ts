// What a repository is called on screen. Its identity is host/owner/name as
// its origin remote spells it, or the directory name of a repository with no
// remote, and an untracked vault is named by its registry name. A repository
// on GitHub shows only its owner and name, because GitHub's mark beside them
// says what the host says (TASK-477).

/** A repository's name as the chrome shows it. */
interface ShownRepository {
	/** The words shown: the owner and name on GitHub, else the whole identity. */
	readonly name: string;
	/** Whether the repository is on GitHub, which its mark says in place of the host. */
	readonly onGitHub: boolean;
}

/** The host of an identity on GitHub, where an owner and a name follow it and nothing else. */
const GITHUB_HOST = /^github\.com\/(?=[^/]+\/[^/]+$)/iu;

/**
 * What a repository is called on screen.
 * @param identity The repository's identity, or an untracked vault's registry name.
 * @returns The words shown, and whether GitHub's mark stands beside them.
 */
function shownRepository(identity: string): ShownRepository {
	const host = GITHUB_HOST.exec(identity);
	if (host === null) return { name: identity, onGitHub: false };
	return { name: identity.slice(host[0].length), onGitHub: true };
}

export { shownRepository, type ShownRepository };
