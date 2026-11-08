{
  description = "The tools that build and check Archboard";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    # The npm dependencies of the release build come from bun.lock through bun.nix, which
    # `bun2nix > bun.nix` writes (docs/agents/releasing.md).
    bun2nix = {
      url = "github:nix-community/bun2nix/2.1.2";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    { self, nixpkgs, bun2nix, ... }:
    let
      inherit (nixpkgs) lib;

      # The repository pins each tool once, and the shell follows that pin:
      # Bun from the packageManager field of package.json, and the wasm-bindgen
      # CLI from the wasm-bindgen crate in Cargo.lock, which refuses a CLI of
      # any other version.
      packageJson = lib.importJSON ./package.json;
      bunVersion = lib.removePrefix "bun@" packageJson.packageManager;
      wasmBindgenVersion =
        (lib.findFirst (crate: crate.name == "wasm-bindgen") (throw "Cargo.lock holds no wasm-bindgen")
          (lib.importTOML ./Cargo.lock).package
        ).version;

      # Bun's release name for each system this shell supports.
      bunPlatforms = {
        x86_64-linux = "linux-x64";
        aarch64-linux = "linux-aarch64";
        aarch64-darwin = "darwin-aarch64";
      };
      # The release archives of a Bun that nixpkgs does not carry yet.
      bunReleases = {
        "1.4.4" = {
          linux-x64 = "sha256-v4zL+ysLgBWeD5ptFcVTF63YB3U028YTCj7bUvzLOVw=";
          linux-aarch64 = "sha256-uqa7NvUdblhWHgK76oJQOKnfRU9nPW13bou/hvjHhQ4=";
          darwin-aarch64 = "sha256-wkDX8My5DCY6hJ/NsJt+5iYw2SE0jtaq/ahrnVd7xRA=";
        };
      };

      # The release archive of the pinned Bun for one platform.
      bunRelease =
        pkgs: bunPlatform:
        pkgs.fetchurl {
          url = "https://github.com/oven-sh/bun/releases/download/bun-v${bunVersion}/bun-${bunPlatform}.zip";
          hash =
            bunReleases.${bunVersion}.${bunPlatform}
              or (throw "nixpkgs has Bun ${pkgs.bun.version}, and flake.nix has no hash for Bun ${bunVersion} on ${bunPlatform}: add it to bunReleases");
        };

      # The pinned tools of one system, which the shell and the release build share.
      toolsOf =
        system: bunPlatform:
        let
          pkgs = nixpkgs.legacyPackages.${system};
          wasmBindgenAttribute = "wasm-bindgen-cli_${lib.replaceStrings [ "." ] [ "_" ] wasmBindgenVersion}";
        in
        {
          inherit pkgs;
          bun =
            if pkgs.bun.version == bunVersion then
              pkgs.bun
            else
              pkgs.bun.overrideAttrs {
                version = bunVersion;
                src = bunRelease pkgs bunPlatform;
              };
          wasm-bindgen-cli =
            pkgs.${wasmBindgenAttribute}
              or (throw "nixpkgs has no ${wasmBindgenAttribute} for the wasm-bindgen ${wasmBindgenVersion} that Cargo.lock pins: pin a version nixpkgs carries, or update flake.lock");
          bun2nix = bun2nix.packages.${system}.default;
        };

      # The npm packages of a release (ADR 0076), as `bun run release` and `bun run pack:voice`
      # make them in a checkout, built offline in the sandbox: $out holds the six packed tarballs
      # that the publish job of .github/workflows/release.yml uploads.
      releaseOf =
        { pkgs, bun, wasm-bindgen-cli, bun2nix, ... }:
        let
          # The Bun runtime that each release target embeds. `bun build --compile` would download
          # it, so it comes from the release archive that bunReleases pins, unpatched, named by
          # the Bun target that scripts/release/compile.ts compiles for.
          bunTargets = {
            bun-linux-x64 = "linux-x64";
            bun-linux-arm64 = "linux-aarch64";
            bun-darwin-arm64 = "darwin-aarch64";
          };
          bunRuntimes = pkgs.runCommand "bun-${bunVersion}-runtimes" { nativeBuildInputs = [ pkgs.unzip ]; } (
            "mkdir $out\n"
            + lib.concatStrings (
              lib.mapAttrsToList (target: bunPlatform: ''
                unzip -p ${bunRelease pkgs bunPlatform} "bun-${bunPlatform}/bun" > "$out/${target}"
                chmod +x "$out/${target}"
              '') bunTargets
            )
          );
          cargoDeps = pkgs.rustPlatform.importCargoLock { lockFile = ./Cargo.lock; };
        in
        pkgs.stdenv.mkDerivation {
          pname = "archboard-release";
          inherit (packageJson) version;
          src = self;

          nativeBuildInputs = [
            # Before the hook, whose own Bun is nixpkgs' and not the pinned one.
            bun
            bun2nix.hook
            pkgs.cargo
            pkgs.rustc
            pkgs.lld
            wasm-bindgen-cli
            pkgs.autoPatchelfHook
          ];
          buildInputs = [ pkgs.stdenv.cc.cc.lib ];

          bunDeps = bun2nix.fetchBunDeps {
            bunNix = ./bun.nix;
            # The patches of package.json, which the hook takes out of the install.
            overrides = bun2nix.patchedDependenciesToOverrides {
              patchedDependencies = lib.mapAttrs (_: patch: ./. + "/${patch}") packageJson.patchedDependencies;
            };
          };
          # The layout of a checkout's `bun install`: bun.lock's configVersion 0 is hoisted.
          bunInstallFlags = [
            "--linker=hoisted"
            "--frozen-lockfile"
          ];

          # Vite+, Lightning CSS and TypeScript run native programs and addons during the build. Only
          # the installed packages are patched, since bun.nix holds those of every platform. bun
          # installs the musl builds beside the glibc ones, and the build loads the glibc ones.
          autoPatchelfIgnoreMissingDeps = [ "libc.musl-x86_64.so.1" ];
          postBunNodeModulesInstallPhase = ''
            chmod -R u+w node_modules
            autoPatchelf node_modules
          '';

          # The hook would patch every shebang of the source, and the launcher ships `#!/bin/sh`.
          # Only the declaration compiler that the voice package's build starts needs its shebang.
          dontUseBunPatch = true;
          postPatch = ''
            export HOME="$TMPDIR/home"
            patchShebangs scripts/pack-codex-realtime-voice-tsgo.ts
          '';

          # The commit that archboard-release.json records, since the source has no .git. A source
          # without one leaves it empty, and scripts/release/compile.ts refuses to compile.
          ARCHBOARD_RELEASE_COMMIT = self.rev or self.dirtyRev or "";
          ARCHBOARD_RELEASE_BUN_RUNTIMES = bunRuntimes;

          # Cargo reads the crates of Cargo.lock from the store. They are configured in CARGO_HOME,
          # because .cargo/config.toml is a source of the core's hash.
          preBuild = ''
            export CARGO_HOME="$TMPDIR/cargo-home" CARGO_NET_OFFLINE=true
            mkdir -p "$CARGO_HOME"
            cat > "$CARGO_HOME/config.toml" <<EOF
            [source.crates-io]
            replace-with = "vendored-sources"

            [source.vendored-sources]
            directory = "${cargoDeps}"
            EOF
          '';

          buildPhase = ''
            runHook preBuild
            bun run release
            bun run pack:voice
            (cd dist/codex-realtime-voice && bun pm pack --destination ../release --ignore-scripts)
            runHook postBuild
          '';

          installPhase = ''
            runHook preInstall
            mkdir -p "$out"
            cp dist/release/*.tgz "$out"
            runHook postInstall
          '';

          dontFixup = true;
        };
    in
    {
      packages.x86_64-linux = rec {
        release = releaseOf (toolsOf "x86_64-linux" bunPlatforms.x86_64-linux);
        default = release;
      };

      devShells = lib.mapAttrs (
        system: bunPlatform:
        let
          inherit (toolsOf system bunPlatform)
            pkgs
            bun
            wasm-bindgen-cli
            bun2nix
            ;
        in
        {
          # The renderer core builds for wasm32-unknown-unknown with nixpkgs'
          # rustc (ADR 0059).
          default = pkgs.mkShell {
            packages = [
              bun
              pkgs.cargo
              pkgs.rustc
              pkgs.rustfmt
              pkgs.clippy
              # nixpkgs' rustc links wasm32 with lld.
              pkgs.lld
              wasm-bindgen-cli
              # Writes bun.nix from bun.lock, which the gate checks.
              bun2nix
              # The language server `archboard check --code` asks about Rust
              # names, once `repo language-server rust` configures it.
              pkgs.rust-analyzer
              # gopls answers Go names once `repo language-server go`
              # configures it, and it runs the go command to load packages.
              pkgs.go
              pkgs.gopls
              # Lints the GitHub workflows, and their scripts with shellcheck.
              pkgs.actionlint
            ];
            # rust-analyzer reads the standard library's source from here.
            RUST_SRC_PATH = "${pkgs.rustPlatform.rustLibSrc}";
          };
        }
      ) bunPlatforms;
    };
}
