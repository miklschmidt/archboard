#!/usr/bin/env bash
# Install the archboard CLI for an Action. ARCHBOARD_VERSION names the version. Without one, it
# installs the version of the archboard release that the Action comes from: every package has the
# version of the repository's root package.json, which release-please sets.
set -euo pipefail
version="${ARCHBOARD_VERSION:-}"
if [ -z "$version" ]; then
	version="$(node -p 'require(process.argv[1]).version' "$(dirname "$0")/../../package.json")"
fi
npm install --global "archboard@${version}"
