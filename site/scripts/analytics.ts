// Add PostHog to every page of the assembled site, before the deploy. The deploy adds it, not the
// Astro build, so that it reaches the docs of every release, which their own tags built, and so that
// a local build or a pull request build sends nothing.
//
// PostHog runs in cookieless mode: it sets no cookie and stores nothing in the browser, so the
// site needs no consent banner. It sends its requests to e.usearchboard.dev, a host of the site's
// own domain that forwards them to PostHog's EU Cloud, because ad blockers drop requests to
// PostHog's own hosts.
//
// Run from the repository root, after the versions are put together:
//   POSTHOG_PROJECT_KEY=phc_... bun site/scripts/analytics.ts [--site site/dist]
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

/** PostHog's own loader snippet, unchanged: https://posthog.com/docs/libraries/js */
const loader =
	'!function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],Object.defineProperty(u,"toString",{configurable:!0,enumerable:!0,writable:!0,value:function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e}}),Object.defineProperty(u.people,"toString",{configurable:!0,enumerable:!0,writable:!0,value:function(){return u.toString(1)+".people (stub)"}}),o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagResult isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey getNextSurveyStep identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);';

/** The PostHog configuration of the site. */
const config = (key: string): string =>
	`posthog.init(${JSON.stringify(key)},${JSON.stringify({
		api_host: "https://e.usearchboard.dev",
		ui_host: "https://eu.posthog.com",
		defaults: "2026-08-30",
		cookieless_mode: "always",
	})})`;

/** Marks a page that holds the snippet, so that a second run changes nothing. */
const marker = "<script data-analytics>";

/**
 * Add the PostHog snippet to one page, at the end of its head.
 * @param html The page.
 * @param key The PostHog project key, which is public: every page holds it.
 * @returns The page with the snippet.
 */
export function addAnalytics(html: string, key: string): string {
	if (html.includes(marker)) return html;
	if (!html.includes("</head>")) throw new Error("A page has no </head> to add PostHog to");
	return html.replace("</head>", `${marker}${loader}${config(key)}</script></head>`);
}

if (import.meta.main) {
	const { values } = parseArgs({
		options: { site: { type: "string", default: join(import.meta.dir, "../dist") } },
	});
	const key = process.env["POSTHOG_PROJECT_KEY"] ?? "";
	if (!/^phc_\w+$/u.test(key)) throw new Error("Set POSTHOG_PROJECT_KEY to a PostHog project key");
	const pages = readdirSync(values.site, { recursive: true, encoding: "utf8" }).filter((path) =>
		path.endsWith(".html"),
	);
	for (const page of pages) {
		const path = join(values.site, page);
		writeFileSync(path, addAnalytics(readFileSync(path, "utf8"), key));
	}
	console.log(`analytics: PostHog on ${String(pages.length)} pages`);
}
