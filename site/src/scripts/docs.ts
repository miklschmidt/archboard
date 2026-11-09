// The docs' page script: the section the reader is in, the links on each section's head, the
// sidebar's scroll across pages, the drawer on a narrow screen, the search and the versions.

/** Mark the section of the page that the reader is in, in the table of contents. */
function followSections(): void {
	const links = [...document.querySelectorAll<HTMLAnchorElement>("[data-toc-link]")];
	if (links.length === 0) return;
	const bySlug = new Map(links.map((link) => [link.dataset["tocLink"] ?? "", link]));
	const headings = [...bySlug.keys()]
		.map((slug) => document.getElementById(slug))
		.filter((heading): heading is HTMLElement => heading !== null);
	const mark = (): void => {
		// The current section is the last whose head has passed a line just under where a link to
		// a section puts its head: the page's scroll padding.
		const padding = Number.parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop);
		const line = (Number.isNaN(padding) ? 96 : padding) + 24;
		let current = headings[0];
		for (const heading of headings) {
			if (heading.getBoundingClientRect().top - line <= 0) current = heading;
		}
		// At the foot of the page the last section is the current one, however short it is.
		if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
			current = headings.at(-1);
		}
		for (const [slug, link] of bySlug) link.classList.toggle("is-current", slug === current?.id);
	};
	let queued = false;
	window.addEventListener(
		"scroll",
		() => {
			if (queued) return;
			queued = true;
			requestAnimationFrame(() => {
				queued = false;
				mark();
			});
		},
		{ passive: true },
	);
	mark();
}

/** A click on a section's link copies its address, and the address bar takes it. */
function copyHeadingLinks(): void {
	for (const link of document.querySelectorAll<HTMLAnchorElement>("[data-heading-link]")) {
		link.addEventListener("click", () => {
			const url = new URL(link.href, location.href).href;
			void navigator.clipboard?.writeText(url).then(
				() => {
					link.classList.add("is-copied");
					window.setTimeout(() => link.classList.remove("is-copied"), 1400);
				},
				() => undefined,
			);
		});
	}
}

const SIDEBAR_KEY = "archboard-docs-sidebar";

/** The sidebar keeps its scroll from page to page, and shows the current page. */
function keepSidebar(): void {
	const sidebar = document.querySelector<HTMLElement>("[data-sidebar]");
	if (!sidebar) return;
	try {
		const saved = Number(sessionStorage.getItem(SIDEBAR_KEY));
		if (saved > 0) sidebar.scrollTop = saved;
	} catch {
		// Storage can be closed to the page. The sidebar then starts at its top.
	}
	const current = sidebar.querySelector<HTMLElement>('[aria-current="page"]');
	if (current) {
		const box = sidebar.getBoundingClientRect();
		const item = current.getBoundingClientRect();
		if (item.top < box.top || item.bottom > box.bottom) current.scrollIntoView({ block: "center" });
	}
	window.addEventListener("pagehide", () => {
		try {
			sessionStorage.setItem(SIDEBAR_KEY, String(sidebar.scrollTop));
		} catch {
			// Nothing to keep.
		}
	});
}

/** The drawer that holds the sidebar on a narrow screen. */
function mountDrawer(): void {
	const drawer = document.querySelector<HTMLDialogElement>("[data-drawer]");
	if (!drawer) return;
	for (const open of document.querySelectorAll("[data-drawer-open]")) {
		open.addEventListener("click", () => drawer.showModal());
	}
	for (const close of drawer.querySelectorAll("[data-drawer-close]")) {
		close.addEventListener("click", () => drawer.close());
	}
	drawer.addEventListener("click", (event) => {
		if (event.target === drawer) drawer.close();
	});
}

interface PagefindResult {
	url: string;
	excerpt: string;
	meta: { title?: string };
	sub_results?: { title: string; url: string; excerpt: string }[];
}
interface Pagefind {
	options(options: Record<string, unknown>): Promise<void>;
	debouncedSearch(
		query: string,
		options?: Record<string, unknown>,
		wait?: number,
	): Promise<{ results: { data(): Promise<PagefindResult> }[] } | null>;
}

/** The search dialog and its keys. */
function mountSearch(): void {
	const dialog = document.querySelector<HTMLDialogElement>("[data-search]");
	const input = dialog?.querySelector<HTMLInputElement>("[data-search-input]");
	const list = dialog?.querySelector<HTMLElement>("[data-search-results]");
	if (!dialog || !input || !list) return;
	// Each version of the docs has its own index at its own root, so a search stays in its version.
	const root = document.documentElement.dataset["docsRoot"] ?? "/";
	let pagefind: Promise<Pagefind | null> | undefined;
	const load = (): Promise<Pagefind | null> => {
		pagefind ??= import(/* @vite-ignore */ `${root}pagefind/pagefind.js`).then(
			async (module: Pagefind) => {
				// A name that a page repeats often must not outrank the page whose heading is that name,
				// so how often a term occurs counts for little next to where it occurs.
				await module.options({
					baseUrl: root,
					excerptLength: 18,
					ranking: { termFrequency: 0.2 },
				});
				return module;
			},
			() => null,
		);
		return pagefind;
	};
	const hint = (text: string): void => {
		const line = document.createElement("p");
		line.className = "hint";
		line.textContent = text;
		list.replaceChildren(line);
		input.removeAttribute("aria-activedescendant");
	};
	const items = (): HTMLAnchorElement[] => [...list.querySelectorAll<HTMLAnchorElement>(".result")];
	const select = (index: number): void => {
		const all = items();
		all.forEach((item, at) => {
			item.id = `search-result-${at}`;
			item.setAttribute("aria-selected", at === index ? "true" : "false");
		});
		const active = all[index];
		if (active) input.setAttribute("aria-activedescendant", active.id);
		else input.removeAttribute("aria-activedescendant");
		all[index]?.scrollIntoView({ block: "nearest" });
	};
	const selected = (): number => items().findIndex((item) => item.ariaSelected === "true");
	const result = (page: string, title: string, url: string, excerpt: string): HTMLAnchorElement => {
		const link = document.createElement("a");
		link.className = "result";
		link.href = url;
		link.setAttribute("role", "option");
		const pageLine = document.createElement("span");
		pageLine.className = "result-page";
		pageLine.textContent = page;
		const titleLine = document.createElement("span");
		titleLine.className = "result-title";
		titleLine.textContent = title;
		const excerptLine = document.createElement("span");
		excerptLine.className = "result-excerpt";
		// Pagefind's excerpt is the page's own text, escaped, with <mark> around the words found.
		excerptLine.innerHTML = excerpt;
		link.append(pageLine, titleLine, excerptLine);
		link.addEventListener("mousemove", () => select(items().indexOf(link)));
		return link;
	};
	const run = async (query: string): Promise<void> => {
		if (query.trim() === "") {
			hint("Type to search every page, command and schema.");
			return;
		}
		const engine = await load();
		if (!engine) {
			hint("Search is unavailable. Reload this page to try again.");
			return;
		}
		const found = await engine.debouncedSearch(query, {}, 120);
		if (!found) return;
		const pages = await Promise.all(found.results.slice(0, 8).map((entry) => entry.data()));
		if (input.value !== query) return;
		if (pages.length === 0) {
			hint(`Nothing in the docs matches “${query}”.`);
			return;
		}
		list.replaceChildren(
			...pages.flatMap((page) => {
				const name = page.meta.title ?? page.url;
				// Two sections of a page at most, so the next pages that match stay in view.
				const sections = (page.sub_results ?? []).filter((sub) => sub.url !== page.url).slice(0, 2);
				return sections.length > 0
					? sections.map((sub) => result(name, sub.title, sub.url, sub.excerpt))
					: [result("Page", name, page.url, page.excerpt)];
			}),
		);
		select(0);
	};
	const open = (): void => {
		if (dialog.open) return;
		dialog.showModal();
		input.setAttribute("aria-expanded", "true");
		input.select();
		void load();
	};
	for (const trigger of document.querySelectorAll("[data-search-open]")) {
		trigger.addEventListener("click", open);
	}
	dialog.querySelector("[data-search-close]")?.addEventListener("click", () => dialog.close());
	dialog.addEventListener("close", () => input.setAttribute("aria-expanded", "false"));
	dialog.addEventListener("click", (event) => {
		if (event.target === dialog) dialog.close();
	});
	input.addEventListener("input", () => void run(input.value));
	input.addEventListener("keydown", (event) => {
		const count = items().length;
		if (event.key === "ArrowDown" && count > 0) {
			event.preventDefault();
			select((selected() + 1) % count);
		} else if (event.key === "ArrowUp" && count > 0) {
			event.preventDefault();
			select((selected() - 1 + count) % count);
		} else if (event.key === "Enter") {
			const chosen = items()[Math.max(0, selected())];
			if (chosen) {
				event.preventDefault();
				chosen.click();
			}
		}
	});
	document.addEventListener("keydown", (event) => {
		const target = event.target as HTMLElement | null;
		const typing =
			target?.isContentEditable === true ||
			["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "");
		if ((event.key === "k" && (event.metaKey || event.ctrlKey)) || (event.key === "/" && !typing)) {
			event.preventDefault();
			open();
		}
	});
	// A Mac shows ⌘K where another system shows Ctrl K.
	if (/Mac|iPhone|iPad/.test(navigator.platform)) {
		for (const key of document.querySelectorAll("[data-search-key]")) key.textContent = "⌘K";
	}
}

/**
 * Name each code block that scrolls sideways. Expressive Code makes such a block a focusable
 * region, and a region needs a name that tells it apart from the others on the page.
 */
function nameCodeRegions(): void {
	const blocks = [...document.querySelectorAll<HTMLPreElement>(".expressive-code pre")];
	const name = (pre: HTMLPreElement, index: number): string => {
		const title = pre.closest("figure")?.querySelector("figcaption .title")?.textContent?.trim();
		return `${title === undefined || title === "" ? "" : `${title}, `}code example ${String(index + 1)}`;
	};
	const label = (): void => {
		for (const [index, pre] of blocks.entries()) {
			if (pre.getAttribute("role") === "region") pre.setAttribute("aria-label", name(pre, index));
			else pre.removeAttribute("aria-label");
		}
	};
	new MutationObserver(label).observe(document.body, { subtree: true, attributeFilter: ["role"] });
	label();
}

/** What `docs/versions.json` lists: the newest release with docs, and every release with docs. */
interface Versions {
	readonly latest: string | null;
	/** Newest first. */
	readonly releases: readonly string[];
}

/**
 * Fill the version switch, and say on main or an older release which version the page describes.
 * The list is read at run time, so a page of an old release names the releases after it.
 */
async function mountVersions(): Promise<void> {
	const { docsRoot: root, docsVersion: version } = document.documentElement.dataset;
	const switcher = document.querySelector<HTMLDetailsElement>("[data-versions]");
	const list = switcher?.querySelector<HTMLElement>("[data-version-list]");
	const note = document.querySelector<HTMLElement>("[data-version-note]");
	if (!root || !version || !switcher || !list || !note) return;
	const top = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/docs/`;
	let versions: Versions;
	try {
		const response = await fetch(`${top}versions.json`);
		if (!response.ok) return;
		versions = (await response.json()) as Versions;
	} catch {
		return;
	}
	// The same page in another version, at the same path under its root. The latest release is at
	// the top root, and main is at next/.
	const page = location.pathname.startsWith(root) ? location.pathname.slice(root.length) : "";
	const hrefOf = (other: string): string =>
		other === versions.latest ? `${top}${page}` : `${top}${other}/${page}`;
	const entries = [
		...versions.releases.map((release) => ({
			version: release,
			tag: release === versions.latest ? "latest" : "",
		})),
		{ version: "next", tag: "unreleased" },
	];
	list.replaceChildren(
		...entries.map(({ version: other, tag }) => {
			const item = document.createElement("li");
			const link = document.createElement("a");
			link.href = hrefOf(other);
			link.append(other === "next" ? "main" : other);
			if (tag !== "") {
				const label = document.createElement("span");
				label.className = "tag";
				label.textContent = tag;
				link.append(label);
			}
			if (other === version) link.setAttribute("aria-current", "true");
			item.append(link);
			return item;
		}),
	);
	switcher.hidden = false;
	document.addEventListener("click", (event) => {
		if (switcher.open && !switcher.contains(event.target as Node)) switcher.open = false;
	});
	switcher.addEventListener("keydown", (event) => {
		if (event.key !== "Escape" || !switcher.open) return;
		switcher.open = false;
		switcher.querySelector("summary")?.focus();
	});
	const latest = versions.latest;
	if (latest === null || version === latest) return;
	// A version is data, so it is set as code.
	const code = (text: string): HTMLElement => {
		const element = document.createElement("code");
		element.textContent = text;
		return element;
	};
	const read = document.createElement("a");
	read.href = hrefOf(latest);
	read.append("Read the ", code(latest), " docs");
	note.replaceChildren(
		...(version === "next"
			? ["These docs describe main, which is newer than the latest release, ", code(latest), ". "]
			: ["These docs describe ", code(version), ". The latest release is ", code(latest), ". "]),
		read,
		".",
	);
	note.hidden = false;
}

followSections();
nameCodeRegions();
copyHeadingLinks();
keepSidebar();
mountDrawer();
mountSearch();
void mountVersions();
