# Choose review boundaries

Keep the user's requested delivery structure.
A request for one integration PR takes precedence over general splitting advice.
The number of modules changed does not determine the number of PRs.

Consider splitting only when each layer provides a concrete independently reviewable result.
Use the installed gh-stack skill when an authorized stack needs branch operations.
Keep an existing PR intact unless the user authorizes restructuring it.

## Establish a useful cut

Read the whole diff, its intended behavior, and the canonical proposal comparison.
Identify changes that can ship independently with clear contracts and focused evidence.
Keep coupled API changes, their callers, and required data transitions together when separation creates an unusable intermediate state.
A test and its implementation belong to the same delivery boundary.
Documentation follows the behavior that it describes.

Name each proposed layer's resulting behavior and dependencies.
If a layer exists only because a diagram contains another module, keep it in the integration PR.
If no independent delivery benefit remains, stop splitting.

## Preserve architecture meaning

Each authorized layer can use a compact proposal against the actual state that its code assumes.
Record model, stable state identity, exact predecessor, and comparison base.
A proposal can span modules and flows.
Never derive proposal ancestry from branch names alone.

Use dependent proposals only when the complete predecessor represents the architecture that the layer follows.
Keep a larger unbuilt design separate from a partially implemented state when its unbuilt subjects cannot be inherited accurately.
Scope and focus narrow pictures without deleting intended subjects.
Retain exact comparison evidence for each review boundary.

## Deliver the chosen structure

Keep all work on the approved integration branch when the user requests one PR.
Use commits as implementation checkpoints within that branch.
Explain broad work through several coherent scopes or walkthrough beats in its single Summary.

For an authorized stack, use the actual lower source branch as each PR's base.
Make sure that each layer works with its dependencies and has focused evidence.
Use the parent skill's three-section body for each PR.
Adoption remains an owner-authorized architecture operation after implementation, independently of any source merge.
