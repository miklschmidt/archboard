# Analysis policy of the Rust crates

TASK-520.09 holds the Rust crates under `crates/` to a policy as strict as the
TypeScript policy in [strict-analysis.md](strict-analysis.md). It is not a
one-to-one port. Some TypeScript rules have a Rust lint with the same intent,
some are already the job of the Rust compiler, and some do not apply to Rust.
This page names each lint the crates use, each lint they leave off, and each
TypeScript rule that does not carry over, with the reason.

## Where the policy lives

- `Cargo.toml` holds one `[workspace.lints]` table. Every crate's manifest says
  `[lints] workspace = true`, so no crate has a policy of its own.
- `clippy.toml` holds the thresholds and settings of the clippy lints.
- `lint:core` in `vite.config.ts` runs
  `cargo clippy --locked --workspace --all-targets --target wasm32-unknown-unknown -- --deny warnings`.
  No crate code depends on the target, so the native target gives the same
  findings. `format:core` and `test:core` run `cargo fmt --check` and the tests.
- `lint:core-docs` runs
  `RUSTDOCFLAGS='-D warnings' cargo doc --locked --workspace --no-deps --document-private-items`.
  rustdoc reads every doc comment, private ones too, and fails on any rustdoc lint.
- The cache of these lanes reads `crates/**`, `Cargo.toml`, `clippy.toml` and
  `Cargo.lock`, so a policy change runs the lanes again.
- `tests/system/repository-policy/rust-crates.test.ts` in `test:repository`
  holds the two rules that no lint can see. Every crate manifest under
  `crates/` inherits the workspace lints, and every `.rs` file under `crates/`
  has 600 lines or fewer, counted as `max-lines` counts them.

Every lint is at `warn`, and `lint:core` and `lint:core-docs` turn every
warning into a failure.
A build or a test run still works while a fix is under way. The one exception
is `unsafe_code`, which is `forbid`: no crate needs unsafe code. The code
that the `wasm-bindgen` macros write passes it.

## Exceptions

An exception is a local `#[expect(lint, reason = "...")]` on the item or the
statement that needs it. The reason states the fact that makes the finding
wrong at that site, for example "a whole index from 0 to the falloff's last
step, as the clamps make it". An `expect` that stops matching is itself a
warning, so a stale exception fails the gate.

`#[allow]` is refused by `allow_attributes`, and an attribute without a reason
is refused by `allow_attributes_without_reason`. There is no crate-wide
exception. The four pedantic lints that the policy rejects are set to `allow`
in the workspace table, with the reason below.

The crates carry 25 exceptions:

- Ten float-to-integer casts (`cast_possible_truncation`, `cast_sign_loss`).
  The ECMAScript source works in floating point, so a few counts and indices
  come from `Math.floor`, `Math.round` or a clamp. Each site proves that the
  value is whole and in range.
- Eight `missing_docs` on enums that are pure vocabularies, such as palette
  colours, dash styles and compass directions. The enum's doc says what the
  set is, and each variant is the word its name says.
- Two `match_same_arms` on colour tables, where two colours share a value by
  chance and each row stays one colour.
- One each of `unreadable_literal` (numbers spelt as ECMAScript prints them),
  `print_stdout` (the binary that prints the TypeScript types),
  `decimal_bitwise_operands` (mulberry32's published constant),
  `struct_field_names` (viz-js's own attribute names) and
  `struct_excessive_bools` (independent remedies that a relaying turns on).

## Thresholds

- `cognitive-complexity-threshold = 6`, with the restriction lint
  `cognitive_complexity` on. The TypeScript caps cyclomatic complexity at 6.
  Clippy has no cyclomatic lint, and its cognitive measure is the nearest.
  It counts each branch, loop, `?` and assertion, and it does not count the
  body of a closure.
- `avoid-breaking-exported-api = false`. No crate is published, so the lints
  that keep a public interface stable also check public items.
- `allow-unwrap-in-tests = true`. A test states what it expects by unwrapping.
- `doc-valid-idents` lists the names that the docs spell as words.

## Lints the policy uses

### rustc

- `missing_docs`: every public item has a doc. `ts-rs` writes these docs into
  the generated TypeScript types, so they reach the TypeScript readers too.
- `unreachable_pub`: an item is `pub` only when another crate can reach it.
  This is the Rust form of the TypeScript module-boundary rules.
- The groups `future_incompatible`, `let_underscore`, `nonstandard_style` and
  `rust_2018_idioms`. The last one refuses elided lifetimes in paths, so a
  borrowed type always shows that it borrows.
- `meta_variable_misuse`, `missing_debug_implementations`, `non_ascii_idents`,
  `redundant_lifetimes`, `trivial_casts`, `trivial_numeric_casts`,
  `unit_bindings`, `unused_import_braces`, `unused_lifetimes`,
  `unused_macro_rules` and `unused_qualifications`. Each finds dead or
  misleading code, and none has a false positive in these crates.

### rustdoc

- The `rustdoc::all` group: every stable rustdoc lint. It holds
  `broken_intra_doc_links`, `invalid_html_tags` and `bare_urls`, and also
  `unescaped_backticks`, which rustdoc leaves off by default. A doc link that names no item is a
  failure, so a rename cannot leave a doc pointing at nothing. A citation
  such as `\[W09\]` in the router is escaped, because it names a paper and not
  an item.

### clippy groups

- `clippy::all`: the default groups `correctness`, `suspicious`, `complexity`,
  `perf` and `style`. The TypeScript enables `correctness`, `suspicious` and
  `perf`. Rust's `style` and `complexity` groups are the community norm and
  are stable, so they are on too.
- `clippy::pedantic`, less four lints:
  - `cast_precision_loss`: the crates port ECMAScript, where every number is
    an `f64`. A count turned into an `f64` is the contract, and no count comes
    near 2^52.
  - `float_cmp`: exact comparison of floats is ECMAScript's `===`, which the
    port keeps on purpose.
  - `must_use_candidate`: it asks for `#[must_use]` on 144 functions whose
    results every caller uses. `Result` and `Option` already carry it.
  - `similar_names`: it flags pairs such as `one` and `other`, which name two
    sides of one comparison on purpose.

### clippy nursery, one by one

The nursery group is unstable, so the policy takes only lints that found real
problems or that guard a known risk, and never the group:
`collection_is_never_read`, `debug_assert_with_mut_call`,
`derive_partial_eq_without_eq`, `fallible_impl_from`,
`iter_on_empty_collections`, `iter_on_single_items`, `needless_collect`
(the TypeScript's `unicorn/no-useless-iterator-to-array`),
`needless_pass_by_ref_mut`, `or_fun_call`, `redundant_clone`,
`set_contains_or_insert`, `string_lit_as_bytes`, `trait_duplication_in_bounds`,
`unused_peekable` and `useless_let_if_seq`.

### clippy restriction, one by one

The restriction group is a catalogue, and many of its lints contradict each
other or idiomatic Rust. Clippy's own documentation says not to enable it as a
group. The policy takes:

- Exceptions stay local and give a reason: `allow_attributes`,
  `allow_attributes_without_reason`.
- No debug or placeholder code ships: `dbg_macro`, `todo`, `unimplemented`,
  `use_debug`, `print_stdout`, `print_stderr`, `exit`.
- No silent failure: `unwrap_used`, `get_unwrap`, `map_err_ignore`,
  `let_underscore_must_use`, `assertions_on_result_states`, `mem_forget`,
  `infinite_loop`.
- Shared ownership is explicit: `clone_on_ref_ptr` makes a cheap `Rc` clone
  read as `Rc::clone`.
- Numbers mean what they say: `lossy_float_literal`, `fn_to_numeric_cast_any`.
- Clear evaluation and tidy items: `mixed_read_write_in_expression`,
  `rest_pat_in_fully_bound_structs`, `empty_drop`,
  `empty_enum_variants_with_brackets`, `empty_structs_with_brackets`,
  `unnecessary_self_imports`, `str_to_string`, `string_add`,
  `verbose_file_reads`.
- One module layout: `self_named_module_files` keeps every module with
  children in a `mod.rs`, as the crates already do.
- `cognitive_complexity`, with the threshold above.

## Lints the policy leaves off

Each count is the number of findings that the lint raised on these crates
before the fixes. A count shows the cost, and the reason shows why the cost
buys nothing.

- `implicit_return` (3042), `arbitrary_source_item_ordering` (812),
  `single_call_fn` (437), `min_ident_chars` (196), `use_self` (177),
  `missing_const_for_fn` (67), `option_if_let_else` (34) and `shadow_unrelated`
  (24) contradict idiomatic Rust or the repository's naming.
- `float_arithmetic` (1603), `arithmetic_side_effects` (315), `as_conversions`
  (157) and `default_numeric_fallback` (609) refuse the arithmetic that a
  geometry engine is made of.
- `indexing_slicing` (922) and `string_slice` (21): the indices are positions
  the code found itself. A checked access turns a broken invariant into a
  silent `None`.
- `expect_used` (76): an `expect` states an invariant with its reason, which is
  the Rust form of an assertion. `unwrap_used` stays on, so a bare unwrap
  still needs that reason.
- `unwrap_in_result` (5): those unwraps are invariants, not errors. Turning
  them into an error case mixes two meanings.
- `suboptimal_flops` (161): `mul_add` and its kin round differently, and every
  corpus picture has to stay the same bytes as the ECMAScript drew.
- `missing_docs_in_private_items` (868): besides functions, it asks for a doc
  on each of 609 private fields, 150 constants and 57 variants. The
  TypeScript asks for a doc on every function, not on every field.
- `unused_results` (154), `excessive_nesting` (96 at a depth of 4),
  `tests_outside_test_module`, `unused_crate_dependencies`,
  `single_use_lifetimes` and `missing_copy_implementations` gave noise and no
  real finding. The TypeScript has no nesting rule either.
- `redundant_pub_crate` contradicts `unreachable_pub`.
- The `cargo` group checks the metadata of published crates, and no crate is
  published.

## TypeScript rules and their Rust form

- File length of 600 lines: clippy has no file-length lint, so
  `rust-crates.test.ts` holds every crate file to the cap. The 13 files that
  were longer were split along their seams into modules of their own.
- A JSDoc description on every function: `missing_docs` holds every public
  item to it. Every private function and type has a doc too, but no lint
  holds them to it, because `missing_docs_in_private_items` also asks for one
  on every private field, constant and variant. Review keeps new private
  functions documented.
- JSDoc parameter, return and type rules: the Rust signature states them, and
  rustdoc has no parameter tags. `missing_errors_doc` and `missing_panics_doc`
  (pedantic) are the Rust form of `@throws`.
- The `#` import entries, absolute imports, module entry points and the import
  boundaries: Rust module privacy, `unreachable_pub` and the crate graph in
  `Cargo.toml` do this job. A crate reaches another only through a declared
  dependency and only its public items.
- `no-restricted-exports`: Rust has no default export.
- The `.js` rejection: Rust has one source language.
- `no-shadow`: shadowing a binding with a new value of the same meaning is
  idiomatic Rust, so `shadow_unrelated` and its kin stay off.
- `no-unreachable-loop` and `typescript/no-unnecessary-condition`: the default
  lint `never_loop` and the compiler's own unreachable and type checks.
- `import/named` and `import/export`: the compiler refuses a missing name.
- `promise/no-return-in-finally`, React, `react-perf` and `jsx-a11y` rules:
  Rust has no promises, React or JSX.
- The test complexity of 60 in `.oxlintrc.tests.jsonc`: Rust tests stay under
  6 as well. A test that grew past it became a table or two tests.

## Rules for fixes

A fix improves the code and keeps every computed number. Inside the crates
this means:

- An ECMAScript comparison keeps its NaN behaviour. A `>` never becomes `<=`.
- `f64::midpoint` replaces `(a + b) / 2.0` only where both values are far from
  `f64::MAX`, where the two are the same bytes.
- A split keeps the order of every push, measurement and constraint.

`bun scripts/render-corpus.ts compare` between a render before and after the
change says "0 of N drawings differ".
