{
  description = "The tools that build and check Archboard";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs =
    { nixpkgs, ... }:
    let
      # Bun's release name for each system this shell supports.
      bunPlatforms = {
        x86_64-linux = "linux-x64";
        aarch64-linux = "linux-aarch64";
        x86_64-darwin = "darwin-x64";
        aarch64-darwin = "darwin-aarch64";
      };
      # package.json pins Bun 1.4.3, which nixpkgs does not carry yet.
      bunVersion = "1.4.3";
      bunHashes = {
        linux-x64 = "sha256-PnMFKNiXdfA/h/BcBnh8TfQJnQo38/JS57gpyyOBbhg=";
        linux-aarch64 = "sha256-76mBPaXtckI7+Ef5FujSxHwNd2rdlyNUAmp14Q2pqiE=";
        darwin-x64 = "sha256-YmYOZDjrhyJ4h3rMp34RUtXQMTJN82jUqBtCghFInS0=";
        darwin-aarch64 = "sha256-gK/UwGm0am+o8+xSC+vHUKeEPkqNW5WD0prUNsAKNAM=";
      };
    in
    {
      devShells = nixpkgs.lib.mapAttrs (
        system: bunPlatform:
        let
          pkgs = nixpkgs.legacyPackages.${system};
          bun = pkgs.bun.overrideAttrs {
            version = bunVersion;
            src = pkgs.fetchurl {
              url = "https://github.com/oven-sh/bun/releases/download/bun-v${bunVersion}/bun-${bunPlatform}.zip";
              hash = bunHashes.${bunPlatform};
            };
          };
        in
        {
          # The renderer core builds for wasm32-unknown-unknown with nixpkgs' rustc
          # (ADR 0057). The crate pins wasm-bindgen to the CLI version below.
          default = pkgs.mkShell {
            packages = [
              bun
              pkgs.cargo
              pkgs.rustc
              pkgs.rustfmt
              pkgs.clippy
              # nixpkgs' rustc links wasm32 with lld.
              pkgs.lld
              pkgs.wasm-bindgen-cli
            ];
          };
        }
      ) bunPlatforms;
    };
}
