// A repository's name as the chrome shows it: a repository on GitHub by its
// owner and name beside GitHub's mark, and any other repository or untracked
// vault by its whole identity (TASK-477). The navigator, a pane's header and
// About page, the move dialog and the opener settings use it, because it
// depends on no shell or pane composition. The rule itself, with no React, is
// the `shown-name` entrypoint, for the navigator's pure rows.

export { GitHubMark, RepositoryName } from "@/ui/repository-name/components/RepositoryName";
