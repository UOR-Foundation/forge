import PrismTextRequest.Payment

-- A false statement (clearing adds 1, not 2) closed with `sorry`. Lean accepts the file with a warning, and its
-- kernel accepts the declaration, because `sorry` is the axiom `sorryAx`. Only an axiom rule refuses it.
theorem Fault.sorryAdvance (state : PrismTextRequest.Payment.State) :
    (PrismTextRequest.Payment.cleared state).revision = state.revision + 2 := sorry
