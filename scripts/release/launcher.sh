#!/bin/sh
# The bin `archboard` of the launcher packages `archboard` and `@archboard/cli` (ADR 0075). It
# starts the executable of the platform package that the package manager installed beside this
# package, with every argument, and the executable's exit status is its own.
set -eu

# The PATH entry is a link to this file, as npm and `bun add -g` make it. Follow the links to
# the package.
self=$0
while [ -L "$self" ]; do
	link=$(readlink "$self")
	case $link in
	/*) self=$link ;;
	*) self=$(dirname "$self")/$link ;;
	esac
done
package=$(CDPATH='' cd -P "$(dirname "$self")/.." && pwd)

case $(uname -s)-$(uname -m) in
Linux-x86_64 | Linux-amd64) platform=linux-x64 ;;
Linux-aarch64 | Linux-arm64) platform=linux-arm64 ;;
Darwin-arm64) platform=darwin-arm64 ;;
*)
	echo "archboard: there is no Archboard release for $(uname -s) on $(uname -m). Archboard releases run on linux-x64, linux-arm64 and darwin-arm64." >&2
	exit 1
	;;
esac

# Find the platform package as Node.js finds a dependency: in the node_modules of this package
# (the nested layout of npm), else in the node_modules of each directory above it (the hoisted
# layout of `bun add -g` and of a project install).
directory=$package
while :; do
	if [ "$(basename "$directory")" != node_modules ]; then
		executable=$directory/node_modules/@archboard/cli-$platform/bin/archboard
		if [ -x "$executable" ]; then
			exec "$executable" "$@"
		fi
	fi
	if [ "$directory" = / ]; then
		break
	fi
	directory=$(dirname "$directory")
done

echo "archboard: the package @archboard/cli-$platform is not installed beside $package. Install archboard again, and keep its optional dependencies: do not pass --omit=optional or --no-optional." >&2
exit 1
