// The guard that refuses a request from a page that is not Archboard's own, and the CSRF check of a socket upgrade.
export { checkBrowserCsrf } from "#server/middleware/browser-csrf.ts";
export { createBrowserOriginGuard } from "#server/middleware/browser-origin-guard.ts";
