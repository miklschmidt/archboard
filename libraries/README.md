# Curated libraries

Seven Excalidraw libraries — 111 stencils — that ship with archboard and are
seeded into the library the first time the canvas server reads its store. They
are here rather than in the frontend bundle because the **server** owns the
library (ADR 0007): the browser never needs these files, so it never fetches
them, and an agent can read them without a browser being open at all.

None of this is our work. Every file is somebody else's, taken verbatim from
[excalidraw/excalidraw-libraries][repo] — the index behind the "Browse
libraries" button — and the table below is the attribution that goes with it.
Keep it accurate: if a file is replaced or one is added, its row moves with it.

| File | Library | Author | Upstream path |
|---|---|---|---|
| `architecture-diagram-components.excalidrawlib` | Architecture Diagram Components — common components for architecture diagrams | [Anna Pastushko](https://www.linkedin.com/in/annpastushko) | `anna-pastushko/architecture-diagram-components.excalidrawlib` |
| `awesome-icons.excalidrawlib` | Awesome Icons — a growing collection of do-whatever-you-want icons | [ferminrp](https://github.com/ferminrp) | `ferminrp/awesome-icons.excalidrawlib` |
| `cloud.excalidrawlib` | Cloud — Kubernetes, Gardener, AWS, Azure, GCP logos and architecture icons | [rfranzke](https://twitter.com/rafaelfranzke) | `cloud/cloud.excalidrawlib` |
| `decision-flow-control.excalidrawlib` | Decision Flow Control — yes/no condition boxes | [James Wiens](https://github.com/aretecode) | `aretecode/decision-flow-control.excalidrawlib` |
| `drwnio.excalidrawlib` | Software Logos — archive, database, docker, Kubernetes, load balancer, Postgres, Redis, Nginx, RabbitMQ, reverse proxy | [drwnio.polyrand.net](https://drwnio.polyrand.net/) | `drwnio/drwnio.excalidrawlib` |
| `software-architecture.excalidrawlib` | Software Architecture — microservice, database, cache, event bus, browser, mobile device | [Youri Tjang](https://github.com/youritjang) | `youritjang/software-architecture.excalidrawlib` |
| `system-design.excalidrawlib` | System Design Components — pieces for high-level system diagrams | [Rohan Pithadiya](https://github.com/Rohanpithadiya) | `rohanp/system-design.excalidrawlib` |

[repo]: https://github.com/excalidraw/excalidraw-libraries

The upstream repository is MIT licensed; each library is contributed under it by
its author.

## Adding one

Drop the `.excalidrawlib` file in this directory and add its row above. The
store keys seeding by file basename, so a new file is seeded into vaults that
already exist, and a set the human deleted from the library stays deleted. Both
on-disk formats are read: version 1 (`library: elements[][]`) and version 2
(`libraryItems: [...]`).

Nothing here is loaded at build time, so a file added while the server is
running is picked up on the next restart.
