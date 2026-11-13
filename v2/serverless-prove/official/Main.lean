-- Lean's own kernel over an export file: the "official" checker of the Lean Kernel Arena
-- (github.com/leanprover/lean-kernel-arena, checkers/official/Main.lean), unchanged in substance, built here against
-- Lean 4.32.1, the version LexLean pins. `replay` adds every declaration through `addDeclCore`, which is the C++
-- kernel (`lean_add_decl`). It reads the same bytes the tab's checker reads, so the two judgements are on one input.
import Export.Parse
import Lean

def runKernel (solution : Export.ExportedEnv) : IO Unit := do
  let env ← Lean.mkEmptyEnvironment
  let mut constMap := solution.constMap
  -- Lean's kernel adds Quot.mk, Quot.lift and Quot.ind together with Quot; adding them again is an error.
  constMap := constMap.erase `Quot.mk |>.erase `Quot.lift |>.erase `Quot.ind
  -- In 4.32.1 the entry point is `Environment.replay` (Lean/Replay.lean); it sends each constant to the kernel and
  -- skips unsafe and partial constants, as leanchecker does.
  discard <| env.replay constMap
  IO.println s!"Accepted {constMap.size} declarations."

def main (args : List String) : IO Unit := do
  let inputPath ← match args with
    | [p] => pure p
    | _ => throw <| .userError "usage: kernel <export.ndjson>"
  let handle ← IO.FS.Handle.mk inputPath .read
  let env ← Export.parseStream (.ofHandle handle)
  runKernel env
