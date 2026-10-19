// The process group of a Git command: capturing it when detached, asking whether it or another member exists, and ending it.
export { stopAndKillOwnedGroup } from "#runtime/processes/git-group-termination.ts";
export {
	captureDetachedProcessGroup,
	processGroupExists,
	processGroupHasOtherMember,
} from "#runtime/processes/group.ts";
export type { ProcessGroupIdentity } from "#runtime/processes/group.ts";
