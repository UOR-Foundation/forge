# Work ownership model

Authority: `FoundrySpecification.requirement Obligation.ownership` and
`app/src/WorkOwnership.lex.tex`. FA-13 exports `initialize` and `transition`
as generated library operations. This is a pure state-machine capability, not
an assertion that the browser already persists or executes these operations.

A work record retains owner, revision, capacity, consumed units, reserved units,
achieved checkpoint, outstanding units and phase. Initialization requires a
positive owner, capacity and outstanding work. State validation checks accounting
and ready/completed phase consistency. Reservations cannot exceed capacity.
Progress requires running state, positive cost and accomplished units, sufficient
reservation, sufficient outstanding work and an advancing checkpoint. Every
accepted action increments revision. Suspension retains the entire record except
phase/revision; transfer is permitted only while paused. Completion requires zero
outstanding work, releases unused reservation and works after interruption even
when the reservation has been exhausted. Errors return no replacement state.

The model's twelve error constructors have finite negative proof controls.
Owner identifiers require authentication by the eventual adapter; revision checks
require atomic persistence. Semantic unit accounting is not CPU, memory, provider
billing or proof that the stated external checkpoint was achieved. These limits
are declared by `WorkOwnership.boundary`.

FA-13 was registered with a scenario and failing Rust test before implementation.
There are 28 reflexivity proof controls comparing complete records or exact typed
refusals. The local diagnostic compiler verifies all nine modules; this does not
replace the repository's immutable-SDK `just vv` boundary.

Planted defects: removing the reservation-overrun guard makes the Lean kernel
reject `unreservedProgressRefused`; clearing the checkpoint during suspension
makes it reject `pauseRetainsWork`. Both mutations were restored. The Rust gate
also requires all named controls, their error categories, proof terms with no
axioms, and both certified library exports.

Full SDK/Studio qualification and the final author completeness review are
recorded on the feature PR at the exact reviewed revision.
