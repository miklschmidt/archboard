{
  description = "The tools that build and check Archboard";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs =
    { nixpkgs, ... }:
    let
      inherit (nixpkgs) lib;

      # The repository pins each tool once, and the shell follows that pin:
      # Bun from the packageManager field of package.json, and the wasm-bindgen
      # CLI from the wasm-bindgen crate in Cargo.lock, which refuses a CLI of
      # any other version.
      bunVersion = lib.removePrefix "bun@" (lib.importJSON ./package.json).packageManager;
      wasmBindgenVersion =
        (lib.findFirst (crate: crate.name == "wasm-bindgen") (throw "Cargo.lock holds no wasm-bindgen")
          (lib.importTOML ./Cargo.lock).package
        ).version;

      # Bun's release name for each system this shell supports.
      bunPlatforms = {
        x86_64-linux = "linux-x64";
        aarch64-linux = "linux-aarch64";
        x86_64-darwin = "darwin-x64";
        aarch64-darwin = "darwin-aarch64";
      };
      # The release archives of a Bun that nixpkgs does not carry yet.
      bunReleases = {
        "1.4.3" = {
          linux-x64 = "sha256-PnMFKNiXdfA/h/BcBnh8TfQJnQo38/JS57gpyyOBbhg=";
          linux-aarch64 = "sha256-76mBPaXtckI7+Ef5FujSxHwNd2rdlyNUAmp14Q2pqiE=";
          darwin-x64 = "sha256-YmYOZDjrhyJ4h3rMp34RUtXQMTJN82jUqBtCghFInS0=";
          darwin-aarch64 = "sha256-gK/UwGm0am+o8+xSC+vHUKeEPkqNW5WD0prUNsAKNAM=";
        };
      };
    in
    {
      devShells = lib.mapAttrs (
        system: bunPlatform:
        let
          pkgs = nixpkgs.legacyPackages.${system};
          bun =
            if pkgs.bun.version == bunVersion then
              pkgs.bun
            else
              pkgs.bun.overrideAttrs {
                version = bunVersion;
                src = pkgs.fetchurl {
                  url = "https://github.com/oven-sh/bun/releases/download/bun-v${bunVersion}/bun-${bunPlatform}.zip";
                  hash =
                    bunReleases.${bunVersion}.${bunPlatform}
                      or (throw "nixpkgs has Bun ${pkgs.bun.version}, and flake.nix has no hash for Bun ${bunVersion} on ${bunPlatform}: add it to bunReleases");
                };
              };
          wasmBindgenAttribute = "wasm-bindgen-cli_${lib.replaceStrings [ "." ] [ "_" ] wasmBindgenVersion}";
          wasm-bindgen-cli =
            pkgs.${wasmBindgenAttribute}
              or (throw "nixpkgs has no ${wasmBindgenAttribute} for the wasm-bindgen ${wasmBindgenVersion} that Cargo.lock pins: pin a version nixpkgs carries, or update flake.lock");
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
              # The language server `archboard check --code` asks about Rust
              # names, once `repo language-server rust` configures it.
              pkgs.rust-analyzer
            ];
            # rust-analyzer reads the standard library's source from here.
            RUST_SRC_PATH = "${pkgs.rustPlatform.rustLibSrc}";
          };
        }
      ) bunPlatforms;
    };
}
