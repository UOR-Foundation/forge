import Lean
import PrismTextRequest.Payment
open Lean Elab Command Term Meta

-- A false statement (clearing adds 1, not 2) entered into the environment with the proof of the true one, with the
-- kernel switched off. Lean accepts the file and writes it to the .olean. This is the fault a replay exists for.
run_cmd do
  let type ← liftTermElabM do
    let stx ← `(∀ state : PrismTextRequest.Payment.State,
      (PrismTextRequest.Payment.cleared state).revision = state.revision + 2)
    instantiateMVars (← elabType stx)
  liftCoreM <| withOptions (fun o => o.setBool `debug.skipKernelTC true) do
    addDecl <| .thmDecl {
      name := `Fault.hackedAdvance, levelParams := [], type := type,
      value := mkConst ``PrismTextRequest.Payment.clearAdvances }
