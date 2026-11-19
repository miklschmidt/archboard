// A browser build reads no vault configuration, so it carries no icon names and
// none of the icons they would load (`installed-icons.ts`).

/** No icon names: a browser build checks no vault configuration. */
const INSTALLED_ICONS: readonly string[] = [];

export { INSTALLED_ICONS };
