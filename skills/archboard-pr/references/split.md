# Choose review boundaries

Use this reference only under the parent skill's delivery authorization rules.
Module count alone never determines PR count.
For authorized branch operations, use the installed gh-stack skill.
Keep an existing PR intact unless restructuring is authorized.

Read the whole diff, intended behavior, and proposal comparison.
Choose layers that ship independently with clear contracts and focused evidence.
Keep coupled APIs, callers, and required data transitions together when separation creates an unusable state.
Tests belong with their implementation. Documentation belongs with its behavior.

Name each layer's result and dependencies.
If a layer exists only because a diagram shows another module, keep it in the integration PR.
If no independent benefit remains, stop splitting.

For each layer, record model, stable state ID, exact predecessor, and comparison base.
A proposal can span modules and flows.
Never derive proposal ancestry from branch names.
For a partial implementation of a larger design, follow [reconciliation](reconcile.md).
Retain exact comparison evidence per review boundary.

For one integration PR, keep work on its branch and use commits as progress points.
Explain broad work through several scopes or walkthrough beats in its Summary.
For an authorized stack, use the actual lower branch as each PR's base.
Make sure that every layer works with its dependencies and has focused evidence.
Use the parent skill's body and adoption workflow for each PR.
