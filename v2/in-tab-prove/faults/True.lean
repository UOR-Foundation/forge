import PrismTextRequest.Payment

-- The control: a true statement, proved from the app's own theorem. Every checker must accept it.
theorem Fault.trueAdvance (state : PrismTextRequest.Payment.State) :
    (PrismTextRequest.Payment.cleared state).revision = state.revision + 1 :=
  PrismTextRequest.Payment.clearAdvances state
