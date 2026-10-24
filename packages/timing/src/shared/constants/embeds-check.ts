// The embeds check (ADR 0057) fetches the vault of a repository that this
// machine has no checkout of.

/**
 * Outer bound for one network Git command of the embeds check: asking a remote
 * where its default branch is, or fetching that commit's vault shallow and
 * sparse. It pulls against two things. A CI run must end when a remote never
 * answers: Git is told never to prompt for credentials, so a wait this long is
 * a stalled connection, not a person typing. And the `.archboard/vault`
 * directory of one commit, a few megabytes at most, must still arrive over a
 * slow link. A command past it counts as a failed fetch, and the check reads
 * the cache.
 */
const VAULT_FETCH_TIMEOUT_MS = 60_000;

export { VAULT_FETCH_TIMEOUT_MS };
