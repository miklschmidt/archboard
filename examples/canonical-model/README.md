# Authored canonical model fixture

Copy this directory to a temporary directory before using it.
Commands inside this repository discover its authoritative legacy vault.

```bash
fixture_dir=$(mktemp -d)
cp -R examples/canonical-model/.archboard "$fixture_dir/.archboard"
archboard model read -C "$fixture_dir"
archboard model read 'Shop#Gateway' -C "$fixture_dir"
```

The fixture contains two root services and one child module.
The Gateway calls the Worker and carries authored metadata for the details view.
The public result identifies the roots as `Shop#Worker` and `Shop#Gateway`, in that order.

The fixture exercises a read-only path.
It requires no migration, history archive, or model writer.
