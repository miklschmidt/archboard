// Name overlay for library items that carry no `.name` field in their source
// .excalidrawlib file (TASK-025).
//
// Of the 111 stencils seeded from libraries/*.excalidrawlib, 11 (all in
// architecture-diagram-components.excalidrawlib, the one file in the modern
// v2 format) already carry a `.name`, and readLibrary() surfaces it as-is —
// they need no entry here. The other 100 are in the older v1 format (a bare
// array of element arrays), which carries no name at all, so this file
// supplies one for every one of them. Keyed by the item id exactly as
// src/core/library.ts derives it for v1 sets — `deriveId(setName, index)`,
// i.e. `sha256(`${setName}:${index}`).hex.slice(0, 20)` — so a name here
// always lines up with the matching seeded item, however it was reached.
//
// How each name was produced (see TASK-025 for the full accounting):
//  - Most (43) are a single text element inside the item, cleaned up:
//    collapse whitespace, sentence-case each word, but leave a word alone if
//    it was already ALL CAPS in the source (DB, CDN, API, JSON, DNS, IAM,
//    ...) since that is almost always an initialism, not a stylistic
//    accident.
//  - 8 more (system-design, drwnio, cloud multi-line captions) are the same
//    idea applied to an item with several text elements, after dropping
//    placeholder junk (lorem ipsum filler, pure numbers, stray single
//    letters that spell a word letter-by-letter) and taking what is left.
//  - decision-flow-control's 8 items are all "Condition / Yes / No" diamonds
//    that differ only in which way the Yes/No branches point, so their name
//    is generated from the geometry of the arrows rather than the identical
//    text — "Decision diamond (yes upper-left, no lower-left)" and so on.
//  - A handful of multi-text items do not resolve to one obvious candidate
//    after filtering (e.g. cloud's AWS/GCP logos each carry two text
//    fragments) and are named by an explicit override.
//  - The 41 with no text at all (cloud, drwnio, software-architecture,
//    system-design) were identified visually: rendered in a labelled grid on
//    a scratch canvas, screenshotted in batches of ~8, and named from what
//    they show. Marked "vision" below; the few genuinely hard to place with
//    confidence are marked "vision, uncertain" and given a descriptive,
//    non-brand name rather than a guessed one.
//
// Naming convention (keep new entries consistent with this):
//  - Sentence case: capitalize only the first word, unless a later word is a
//    well-known initialism (DB, API, CDN, DNS, IAM, CPU, ...) or a proper
//    noun/product name (PostgreSQL, GitHub, RabbitMQ, Nginx, ...) — those
//    keep their own canonical casing.
//  - No underscores, no file-extension noise, no numbering. Say it the way
//    someone would ask for it out loud: "Load balancer", not "load_balancer"
//    or "Load-Balancer-v2".
//  - A name is not required to be globally unique — the same concept (e.g.
//    "Database", "Kubernetes") legitimately appears with different artwork
//    in more than one source library. It only needs to be unique *within*
//    the library it comes from; callers that care which one they get can
//    pass the source library alongside the name.
export const LIBRARY_NAME_OVERLAY: Record<string, string> = {
  // awesome-icons
  "0a55e3ffb44b3e95819d": "Menu",
  "75c0b0577fe49d8af149": "Cancel",
  "b35a30e6343db3aad182": "Search",
  "b5458161574bfde908e7": "Delete",
  "8ca052ca684df77154f8": "Home",
  "27fc09e4ea1bf263ce9a": "Lock",
  "22ba17622876e8102508": "Time",
  "220b8fcfcd755dbc80e9": "Bookmark",
  "9f6edc05bac5a7411dda": "Chart",
  "4347c0b2721e531eb04a": "Work",
  "0c39e78326dccd0f94a1": "Calendar",
  "198d2b6738718da45721": "Payment",
  "c60203c500841fe8e16a": "Balance",
  "8cc5c0faed8926b19efd": "User",
  "3d355d34b7d61b3aeba6": "Users",
  "91996a534c0d032bc6b0": "Alarm",
  "3088c08bbde0ef88bfe7": "Shopping basket",
  "efd80408c20dccd216a9": "Location",
  "23adfef4ad87ef75c4cb": "Navigation",
  "6ef2fca39df9f7adbc63": "Information",
  "bad9320f5cc86fc373c1": "Plus",
  "c3ceee85c61b5a8f7743": "Notifications",
  "3d5849ddd4f9553ea529": "Email",
  "5809ba3eebfc620adc92": "Tag",

  // cloud
  "017c24953b47c72f39b6": "Kubernetes", // vision
  "937967114dfc098e4d54": "Gardener", // vision
  "ac21f02a2f6b83be143f": "Key", // vision
  "f756933ddbb9fb52face": "Skull and crossbones", // vision
  "732e1d3c3eaea5fbffd8": "Amazon Web Services",
  "1155742b8f7c9cd8de1e": "Microsoft Azure", // vision
  "449530776d432b0fc6d6": "Google Cloud Platform",
  "3205840dc726a3de28a9": "Laptop", // vision
  "3f364994781e673b06c4": "CPU", // vision
  "ea6056ca3e7292958ce4": "Database", // vision
  "44e718623bc7f2bf1c6a": "Network", // vision
  "5e2db139a9bc59cc52a9": "Cloud", // vision
  "ae26c698460e7f037ee5": "Distributed security", // vision
  "bd04cd70d7cf94226784": "Touchscreen", // vision
  "e78f9bef5ceb3793448c": "Database cluster", // vision
  "a05daefe50ad5b24c819": "Data migration", // vision, uncertain
  "ef55c22681cc65f320e0": "Monitoring", // vision
  "e44e4de5ba91a7d582fd": "API",
  "a5a87db2e82ef1d0fa65": "Server rack", // vision

  // decision-flow-control
  "502b1a1e227501b88a21": "Decision diamond (yes upper-left, no lower-left)",
  "5b6c9760338163113c4a": "Decision diamond (yes upper-right, no lower-right)",
  "bb9e24f15a534183360a": "Decision diamond (yes left, no right)",
  "65da68d0f9691b16e00c": "Decision diamond (yes right, no left)",
  "61330e67c576470c3048": "Decision diamond (yes below, no above)",
  "a3f7a4467c9bad731c7b": "Decision diamond (yes above, no below)",
  "a470c59e9a677e26df1f": "Decision diamond (yes lower-left, no lower-right)",
  "73605db0858f299e6d6b": "Decision diamond (yes upper-left, no upper-right)",

  // drwnio
  "a3a634cb087e6e4ead4f": "Archive", // vision
  "35ed3b04a6027e77509a": "Database", // vision
  "bef9fd36b78b0d28ae3e": "Docker", // vision
  "4cfa66ba4c7ba18b7a7c": "JSON",
  "424a05d9a3c2ed6b1b93": "Kubernetes", // vision
  "4251f778bb5e0c359c98": "Redis", // vision
  "03c74c737f7b676f9faf": "Nginx", // vision
  "5230887284f8b1db9e8e": "RabbitMQ", // vision
  "1657c4605a973c16581d": "CPU", // vision
  "e79e314e5a18865cda58": "Lock", // vision
  "aea13157bf79e813aded": "Load balancer", // vision
  "7555fad70a46453d97aa": "Code", // vision
  "cf31207397e02923b930": "PostgreSQL", // vision
  "432dd7466d20f8b12993": "GitHub", // vision
  "d3139180d6f021d51d2b": "Server rack", // vision
  "92fd9341508db8e814b0": "Python", // vision
  "59cbb0bce8c039245302": "Browser", // vision
  "e2dedec9bf935424e158": "DNS",

  // software-architecture
  "d99598d5373d009a12b8": "Microservice", // vision
  "ea85ad8f10b08445e6d5": "Database", // vision
  "86f35c913f22f6e8dd4c": "Cache", // vision
  "fb0a4c86098705660b09": "Event bus", // vision
  "95b6d0ab3d3cf4a62a02": "Documents", // vision, uncertain
  "c6c2c8c8bbbd5b1c1da6": "Browser", // vision
  "4343933f1209da8923d8": "Mobile device", // vision

  // system-design
  "195807a8a74b2e82f78e": "Blank box", // vision, uncertain
  "c3afcdc077de3dc206bc": "Application server",
  "0c352ee05907579a2cb2": "Multi instance server",
  "1ff8f27e39b8ee4fb8db": "Server",
  "dd16c481086aabb1a0bd": "Multi instance",
  "375d0f818a37b18bb6cc": "Database", // vision
  "d01e2f8e6ebfb11e93f5": "Relational DB",
  "3b7e6e3c0a98f87c7719": "Object storage",
  "b41489765b768c492fbf": "Cold storage",
  "4f274d92ee5122e5fb13": "Document DB",
  "dc1352ef1482083bcfed": "Columnar DB",
  "cfd9f4fe8574550048a0": "Graph DB",
  "ed8ac5518dbf097d8cfd": "Stack storage",
  "dac0997dd0a26ddb460f": "Key-value cache",
  "f653762b490e874ed21f": "Auth & IAM",
  "4658add4b16d1eba78a4": "DNS",
  "b02378756b7966c9a623": "Load balancer",
  "6cf9ecf378cbe59ea16d": "Message queue",
  "cf5d557ae4fe0c5e3805": "Pipeline",
  "ca51a6e442348edcf5fe": "Cloud",
  "b9fa7cd75c1b48867136": "CDN",
  "88f182157fdfbd1811a3": "Archive",
  "206de34e6ab8d1809d10": "Mobile",
  "bbbffdbba62ac52f93e7": "Web application"
};
