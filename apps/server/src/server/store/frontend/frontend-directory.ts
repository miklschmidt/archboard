import { installation } from "@archboard/workspace/installation";

/**
 * The directory of the frontend build: `dist/frontend` of the checkout whose source runs
 * (ADR 0014, `vite.config.ts`), or `frontend` of a release. The server serves this directory and
 * nothing else of the build.
 */
const FRONTEND_DIRECTORY = installation().frontendDirectory;

export { FRONTEND_DIRECTORY };
