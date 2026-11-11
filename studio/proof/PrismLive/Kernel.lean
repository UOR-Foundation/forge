/-!
# Prism live kernel: the projector, proved and exported

The definitions under "Exported" are the projector. lean4-prod exports them to Rust and wasm, so
the code that decides and checks in the browser is these definitions, not a transcription.

They stay inside lean4-prod's subset: Nat, Bool, List, Option, single-constructor structures, and
recursion that is either structural or well-founded. No function consumes a list another function
returns; lists are read as parameters or built in call arguments.

The definitions under "Specification" are never exported. They state the cell construction with
cut lists, and the exported definitions are proved equal to them.

Encoding. A request is a `List Nat` in field order: a number, or a choice's index. An operator is
a `Nat`: 0 `<`, 1 `<=`, 2 `>`, 3 `>=`, 4 `=`/`is`, and anything else `!=`/`is not`.

Main results, for every model:
* `judge_const`: the judge is constant on a cell (the cell lemma).
* `check_sound`: if `check` returns `none`, every property holds on every in-bounds request.
* `decide` is the first-match judge on in-bounds requests, by definition.
-/

namespace PrismLive.Kernel

structure Cond where
  field : Nat
  op : Nat
  value : Nat

structure Rule where
  when : List Cond
  outcome : Nat

structure Property where
  always : Bool
  when : List Cond
  outcome : Nat

/-! ## Exported: semantics -/

def get : List Nat → Nat → Nat
  | [], _ => 0
  | v :: _, 0 => v
  | _ :: vs, n + 1 => get vs n

def len : List Nat → Nat
  | [] => 0
  | _ :: vs => len vs + 1

def opHolds (op c x : Nat) : Bool :=
  if op = 0 then (if x < c then true else false)
  else if op = 1 then (if x ≤ c then true else false)
  else if op = 2 then (if c < x then true else false)
  else if op = 3 then (if c ≤ x then true else false)
  else if op = 4 then (if x = c then true else false)
  else (if x = c then false else true)

def condHolds (c : Cond) (x : List Nat) : Bool := opHolds c.op c.value (get x c.field)

def allHold : List Cond → List Nat → Bool
  | [], _ => true
  | c :: cs, x => if condHolds c x then allHold cs x else false

/-- First match decides; `d` is `otherwise`. -/
def judge : List Rule → Nat → List Nat → Nat
  | [], d, _ => d
  | r :: rs, d, x => if allHold r.when x then r.outcome else judge rs d x

/-- The position of the rule that decides, or the number of rules when `otherwise` decides. -/
def whichRule : List Rule → List Nat → Nat
  | [], _ => 0
  | r :: rs, x => if allHold r.when x then 0 else whichRule rs x + 1

def inBounds : List Nat → List Nat → List Nat → Bool
  | [], [], [] => true
  | lo :: los, hi :: his, v :: vs => if lo ≤ v then (if v ≤ hi then inBounds los his vs else false) else false
  | _, _, _ => false

/-- The app's decision: the judge on an in-bounds request, `none` (invalid) otherwise. -/
def decide (rules : List Rule) (d : Nat) (los his x : List Nat) : Option Nat :=
  if inBounds los his x then some (judge rules d x) else none

/-- The request with outcome `o` breaks property `p`. -/
def breaksWith (p : Property) (x : List Nat) (o : Nat) : Bool :=
  if allHold p.when x then
    (if p.always then (if o = p.outcome then false else true)
     else (if o = p.outcome then true else false))
  else false

def breaks (rules : List Rule) (d : Nat) (p : Property) (x : List Nat) : Bool :=
  breaksWith p x (judge rules d x)

def anyBad : List Property → List Nat → Nat → Bool
  | [], _, _ => false
  | p :: ps, x, o => if breaksWith p x o then true else anyBad ps x o

/-! ## Exported: cell starts without cut lists -/

/-- One cut `k` updates the cell start `m` of `x`. -/
def upd (x m k : Nat) : Nat := if k ≤ x then (if m < k then k else m) else m

def opRep (op c x m : Nat) : Nat :=
  if op = 0 then upd x m c else if op = 3 then upd x m c
  else if op = 1 then upd x m (c + 1) else if op = 2 then upd x m (c + 1)
  else upd x (upd x m c) (c + 1)

def condRep : List Cond → Nat → Nat → Nat → Nat
  | [], _, _, m => m
  | c :: cs, f, x, m => condRep cs f x (if c.field = f then opRep c.op c.value x m else m)

def ruleRep : List Rule → Nat → Nat → Nat → Nat
  | [], _, _, m => m
  | r :: rs, f, x, m => ruleRep rs f x (condRep r.when f x m)

def propRep : List Property → Nat → Nat → Nat → Nat
  | [], _, _, m => m
  | p :: ps, f, x, m => propRep ps f x (condRep p.when f x m)

/-- The start of the cell that holds value `x` of field `f`, whose minimum is `lo`. -/
def fieldRep (rules : List Rule) (props : List Property) (f x lo : Nat) : Nat :=
  propRep props f x (ruleRep rules f x lo)

/-- One cut `k` updates `b`, the least cut above `s` found so far. -/
def nupd (s b k : Nat) : Nat := if s < k then (if k < b then k else b) else b

def opNext (op c s b : Nat) : Nat :=
  if op = 0 then nupd s b c else if op = 3 then nupd s b c
  else if op = 1 then nupd s b (c + 1) else if op = 2 then nupd s b (c + 1)
  else nupd s (nupd s b c) (c + 1)

def condNext : List Cond → Nat → Nat → Nat → Nat
  | [], _, _, b => b
  | c :: cs, f, s, b => condNext cs f s (if c.field = f then opNext c.op c.value s b else b)

def ruleNext : List Rule → Nat → Nat → Nat → Nat
  | [], _, _, b => b
  | r :: rs, f, s, b => ruleNext rs f s (condNext r.when f s b)

def propNext : List Property → Nat → Nat → Nat → Nat
  | [], _, _, b => b
  | p :: ps, f, s, b => propNext ps f s (condNext p.when f s b)

/-- The next cell start of field `f` after `s`, or `hi + 1` when `s` starts the last cell. -/
def fieldNext (rules : List Rule) (props : List Property) (f s hi : Nat) : Nat :=
  propNext props f s (ruleNext rules f s (hi + 1))

/-! ## Specification: cut lists (not exported) -/

def opCuts (op c : Nat) : List Nat :=
  if op = 0 then [c] else if op = 3 then [c]
  else if op = 1 then [c + 1] else if op = 2 then [c + 1]
  else [c, c + 1]

def condCuts : List Cond → Nat → List Nat
  | [], _ => []
  | c :: cs, f => if c.field = f then opCuts c.op c.value ++ condCuts cs f else condCuts cs f

def ruleCuts : List Rule → Nat → List Nat
  | [], _ => []
  | r :: rs, f => condCuts r.when f ++ ruleCuts rs f

def propCuts : List Property → Nat → List Nat
  | [], _ => []
  | p :: ps, f => condCuts p.when f ++ propCuts ps f

def fieldCuts (rules : List Rule) (props : List Property) (f : Nat) : List Nat :=
  ruleCuts rules f ++ propCuts props f

/-- The start of `x`'s cell: the largest of `m` and the cuts at or below `x`. -/
def rep : List Nat → Nat → Nat → Nat
  | [], m, _ => m
  | k :: ks, m, x => rep ks (upd x m k) x

/-- The least cut above `s`, or `b` when none is below `b`. -/
def nxt : List Nat → Nat → Nat → Nat
  | [], _, b => b
  | k :: ks, s, b => nxt ks s (nupd s b k)

/-! ## Exported: the check, a depth-first search over cell starts

Fields are filled from the last to the first, consing onto `acc`, so a full `acc` is a request
in field order. `levels k acc` fills fields `0 .. k-1`; `values f v acc` tries every cell start
of field `f` from `v` up. -/

theorem rep_append : ∀ (a b : List Nat) (m x : Nat), rep (a ++ b) m x = rep b (rep a m x) x
  | [], _, _, _ => rfl
  | k :: a, b, m, x => rep_append a b (upd x m k) x

theorem nxt_append : ∀ (a b : List Nat) (s c : Nat), nxt (a ++ b) s c = nxt b s (nxt a s c)
  | [], _, _, _ => rfl
  | k :: a, b, s, c => nxt_append a b s (nupd s c k)

theorem nxt_gt : ∀ (ks : List Nat) (s b : Nat), s < b → s < nxt ks s b
  | [], _, _, h => h
  | k :: ks, s, b, h => by
    simp only [nxt]
    apply nxt_gt
    simp only [nupd]
    split <;> (try split) <;> omega

theorem nxt_le : ∀ (ks : List Nat) (s b : Nat), nxt ks s b ≤ b
  | [], _, _ => Nat.le_refl _
  | k :: ks, s, b => by
    simp only [nxt]
    have h1 := nxt_le ks s (nupd s b k)
    have h2 : nupd s b k ≤ b := by simp only [nupd]; split <;> (try split) <;> omega
    omega

theorem nxt_cut : ∀ (ks : List Nat) (s b k : Nat), k ∈ ks → s < k → nxt ks s b ≤ k
  | [], _, _, _, hk, _ => absurd hk List.not_mem_nil
  | j :: ks, s, b, k, hk, hsk => by
    simp only [nxt]
    cases List.mem_cons.mp hk with
    | inl he =>
      have h1 := nxt_le ks s (nupd s b j)
      have h2 : nupd s b j ≤ k := by simp only [nupd]; split <;> (try split) <;> omega
      omega
    | inr hm => exact nxt_cut ks s _ k hm hsk

theorem opNext_eq (op c s b : Nat) : opNext op c s b = nxt (opCuts op c) s b := by
  unfold opNext opCuts
  by_cases h0 : op = 0 <;> by_cases h3 : op = 3 <;> by_cases h1 : op = 1 <;> by_cases h2 : op = 2 <;>
    simp [h0, h1, h2, h3, nxt]

theorem condNext_eq : ∀ (cs : List Cond) (f s b : Nat), condNext cs f s b = nxt (condCuts cs f) s b
  | [], _, _, _ => rfl
  | c :: cs, f, s, b => by
    simp only [condNext, condCuts]
    split
    · rw [nxt_append, ← opNext_eq]; exact condNext_eq cs f s _
    · exact condNext_eq cs f s b

theorem ruleNext_eq : ∀ (rs : List Rule) (f s b : Nat), ruleNext rs f s b = nxt (ruleCuts rs f) s b
  | [], _, _, _ => rfl
  | r :: rs, f, s, b => by
    simp only [ruleNext, ruleCuts]
    rw [nxt_append, ← condNext_eq]; exact ruleNext_eq rs f s _

theorem propNext_eq : ∀ (ps : List Property) (f s b : Nat), propNext ps f s b = nxt (propCuts ps f) s b
  | [], _, _, _ => rfl
  | p :: ps, f, s, b => by
    simp only [propNext, propCuts]
    rw [nxt_append, ← condNext_eq]; exact propNext_eq ps f s _

theorem fieldNext_eq (rules : List Rule) (props : List Property) (f s hi : Nat) :
    fieldNext rules props f s hi = nxt (fieldCuts rules props f) s (hi + 1) := by
  simp only [fieldNext, fieldCuts, nxt_append, ruleNext_eq, propNext_eq]

theorem fieldNext_gt (rules : List Rule) (props : List Property) (f s hi : Nat) (h : s ≤ hi) :
    s < fieldNext rules props f s hi := by
  rw [fieldNext_eq]; exact nxt_gt _ s _ (by omega)

/-- The cell starts of field `f` from `v` up. The host calls this once per field; `check`
re-verifies what the host passes, so the host is not trusted with it. -/
def startsFrom (rules : List Rule) (props : List Property) (his : List Nat) (f v : Nat) : List Nat :=
  if h : v ≤ get his f then
    have := fieldNext_gt rules props f v (get his f) h
    v :: startsFrom rules props his f (fieldNext rules props f v (get his f))
  else []
termination_by get his f + 1 - v

/-- `s` is exactly the cell starts of field `f` from `v` up. -/
def startsOk (rules : List Rule) (props : List Property) (his : List Nat) (f v : Nat) : List Nat → Bool
  | [] => if v ≤ get his f then false else true
  | w :: ws =>
    if w = v then
      (if v ≤ get his f then startsOk rules props his f (fieldNext rules props f v (get his f)) ws else false)
    else false

/-- `ss` lists the cell starts of fields `k-1, ..., 0`, in that order. -/
def ssOk (rules : List Rule) (props : List Property) (los his : List Nat) : Nat → List (List Nat) → Bool
  | 0, [] => true
  | k + 1, s :: ss => if startsOk rules props his k (get los k) s then ssOk rules props los his k ss else false
  | _, _ => false

mutual
/-- Fill the remaining fields from `ss`, last field first; a full `acc` is a request. -/
def levels (rules : List Rule) (props : List Property) (d : Nat) :
    List (List Nat) → List Nat → Option (List Nat)
  | [], acc => if anyBad props acc (judge rules d acc) then some acc else none
  | s :: ss, acc => values rules props d s ss acc

/-- Try every value of `s` for the current field. -/
def values (rules : List Rule) (props : List Property) (d : Nat) :
    List Nat → List (List Nat) → List Nat → Option (List Nat)
  | [], _, _ => none
  | v :: vs, ss, acc =>
    match levels rules props d ss (v :: acc) with
    | some r => some r
    | none => values rules props d vs ss acc
end

/-- The check: `none` when every property holds on every in-bounds request; a request that breaks
one otherwise; `some []` when `ss` is not the model's cell starts. -/
def check (rules : List Rule) (props : List Property) (d : Nat) (los his : List Nat)
    (ss : List (List Nat)) : Option (List Nat) :=
  if ssOk rules props los his (len los) ss then levels rules props d ss [] else some []

/-! ## The cell lemma -/

def SameSide (ks : List Nat) (x y : Nat) : Prop := ∀ k ∈ ks, (k ≤ x ↔ k ≤ y)

theorem holds_const (op c x y : Nat) (h : SameSide (opCuts op c) x y) :
    opHolds op c x = opHolds op c y := by
  unfold opCuts at h
  unfold opHolds
  by_cases h0 : op = 0 <;> by_cases h1 : op = 1 <;> by_cases h2 : op = 2 <;>
    by_cases h3 : op = 3 <;> by_cases h4 : op = 4 <;> simp_all [SameSide] <;> omega

def Covers (cuts : Nat → List Nat) (cs : List Cond) : Prop :=
  ∀ c ∈ cs, ∀ k ∈ opCuts c.op c.value, k ∈ cuts c.field

def SameCell (cuts : Nat → List Nat) (x y : List Nat) : Prop :=
  ∀ f, SameSide (cuts f) (get x f) (get y f)

theorem allHold_const {cuts : Nat → List Nat} {x y : List Nat} (h : SameCell cuts x y) :
    ∀ cs : List Cond, Covers cuts cs → allHold cs x = allHold cs y
  | [], _ => rfl
  | c :: cs, hcov => by
    have h1 : condHolds c x = condHolds c y :=
      holds_const c.op c.value _ _ (fun k hk => h c.field k (hcov c (List.mem_cons_self ..) k hk))
    have h2 := allHold_const h cs (fun c' hc' => hcov c' (List.mem_cons_of_mem _ hc'))
    simp only [allHold, h1, h2]

/-- The cell lemma: the judge is constant on a cell. -/
theorem judge_const {cuts : Nat → List Nat} {d : Nat} {x y : List Nat} (h : SameCell cuts x y) :
    ∀ rules : List Rule, (∀ r ∈ rules, Covers cuts r.when) → judge rules d x = judge rules d y
  | [], _ => rfl
  | r :: rs, hcov => by
    have hr := allHold_const h r.when (hcov r (List.mem_cons_self ..))
    have ih := judge_const (d := d) h rs (fun r' hr' => hcov r' (List.mem_cons_of_mem _ hr'))
    simp only [judge, hr, ih]

theorem breaks_const {cuts : Nat → List Nat} (rules : List Rule) (d : Nat) (p : Property)
    (hr : ∀ r ∈ rules, Covers cuts r.when) (hp : Covers cuts p.when) {x y : List Nat}
    (h : SameCell cuts x y) : breaks rules d p x = breaks rules d p y := by
  simp only [breaks, breaksWith, allHold_const h p.when hp, judge_const (d := d) h rules hr]

/-! ## The cuts cover every condition -/

theorem condCuts_cover : ∀ (cs : List Cond) (c : Cond), c ∈ cs →
    ∀ k ∈ opCuts c.op c.value, k ∈ condCuts cs c.field
  | [], _, hc, _, _ => absurd hc List.not_mem_nil
  | c' :: cs, c, hc, k, hk => by
    simp only [condCuts]
    cases List.mem_cons.mp hc with
    | inl he => subst he; simp [hk]
    | inr hm =>
      have := condCuts_cover cs c hm k hk
      split <;> simp [this]

theorem ruleCuts_cover : ∀ (rules : List Rule) (r : Rule), r ∈ rules →
    ∀ c ∈ r.when, ∀ k ∈ opCuts c.op c.value, k ∈ ruleCuts rules c.field
  | [], _, hr, _, _, _, _ => absurd hr List.not_mem_nil
  | r' :: rs, r, hr, c, hc, k, hk => by
    simp only [ruleCuts, List.mem_append]
    cases List.mem_cons.mp hr with
    | inl he => subst he; exact Or.inl (condCuts_cover _ c hc k hk)
    | inr hm => exact Or.inr (ruleCuts_cover rs r hm c hc k hk)

theorem propCuts_cover : ∀ (props : List Property) (p : Property), p ∈ props →
    ∀ c ∈ p.when, ∀ k ∈ opCuts c.op c.value, k ∈ propCuts props c.field
  | [], _, hp, _, _, _, _ => absurd hp List.not_mem_nil
  | p' :: ps, p, hp, c, hc, k, hk => by
    simp only [propCuts, List.mem_append]
    cases List.mem_cons.mp hp with
    | inl he => subst he; exact Or.inl (condCuts_cover _ c hc k hk)
    | inr hm => exact Or.inr (propCuts_cover ps p hm c hc k hk)

theorem rules_covered (rules : List Rule) (props : List Property) :
    ∀ r ∈ rules, Covers (fieldCuts rules props) r.when :=
  fun r hr c hc k hk => List.mem_append.mpr (Or.inl (ruleCuts_cover rules r hr c hc k hk))

theorem prop_covered (rules : List Rule) (props : List Property) (p : Property) (hp : p ∈ props) :
    Covers (fieldCuts rules props) p.when :=
  fun c hc k hk => List.mem_append.mpr (Or.inr (propCuts_cover props p hp c hc k hk))

/-! ## Cell starts -/

theorem rep_ge : ∀ (ks : List Nat) (m x : Nat), m ≤ rep ks m x
  | [], _, _ => Nat.le_refl _
  | k :: ks, m, x => by
    simp only [rep, upd]
    split
    · split
      · have := rep_ge ks k x; omega
      · exact rep_ge ks m x
    · exact rep_ge ks m x

theorem rep_le : ∀ (ks : List Nat) (m x : Nat), m ≤ x → rep ks m x ≤ x
  | [], _, _, h => h
  | k :: ks, m, x, h => by
    simp only [rep, upd]
    apply rep_le
    split
    · split <;> omega
    · omega

theorem rep_cover : ∀ (ks : List Nat) (m x k : Nat), k ∈ ks → k ≤ x → k ≤ rep ks m x
  | [], _, _, _, hk, _ => absurd hk List.not_mem_nil
  | j :: ks, m, x, k, hk, hkx => by
    simp only [rep, upd]
    cases List.mem_cons.mp hk with
    | inl he =>
      split
      · split
        · have := rep_ge ks j x; omega
        · have := rep_ge ks m x; omega
      · omega
    | inr hm => exact rep_cover ks _ x k hm hkx

theorem rep_mem : ∀ (ks : List Nat) (m x : Nat), rep ks m x = m ∨ rep ks m x ∈ ks
  | [], _, _ => Or.inl rfl
  | k :: ks, m, x => by
    simp only [rep, upd]
    split
    · split
      · rcases rep_mem ks k x with h | h
        · exact Or.inr (by rw [h]; exact List.mem_cons_self ..)
        · exact Or.inr (List.mem_cons_of_mem _ h)
      · rcases rep_mem ks m x with h | h
        · exact Or.inl h
        · exact Or.inr (List.mem_cons_of_mem _ h)
    · rcases rep_mem ks m x with h | h
      · exact Or.inl h
      · exact Or.inr (List.mem_cons_of_mem _ h)

theorem rep_same_side (ks : List Nat) (m x : Nat) (hm : m ≤ x) : SameSide ks (rep ks m x) x :=
  fun k hk => ⟨fun h => Nat.le_trans h (rep_le ks m x hm), rep_cover ks m x k hk⟩

theorem opRep_eq (op c x m : Nat) : opRep op c x m = rep (opCuts op c) m x := by
  unfold opRep opCuts
  by_cases h0 : op = 0 <;> by_cases h3 : op = 3 <;> by_cases h1 : op = 1 <;> by_cases h2 : op = 2 <;>
    simp [h0, h1, h2, h3, rep]

theorem condRep_eq : ∀ (cs : List Cond) (f x m : Nat), condRep cs f x m = rep (condCuts cs f) m x
  | [], _, _, _ => rfl
  | c :: cs, f, x, m => by
    simp only [condRep, condCuts]
    split
    · rw [rep_append, ← opRep_eq]; exact condRep_eq cs f x _
    · exact condRep_eq cs f x m

theorem ruleRep_eq : ∀ (rs : List Rule) (f x m : Nat), ruleRep rs f x m = rep (ruleCuts rs f) m x
  | [], _, _, _ => rfl
  | r :: rs, f, x, m => by
    simp only [ruleRep, ruleCuts]
    rw [rep_append, ← condRep_eq]; exact ruleRep_eq rs f x _

theorem propRep_eq : ∀ (ps : List Property) (f x m : Nat), propRep ps f x m = rep (propCuts ps f) m x
  | [], _, _, _ => rfl
  | p :: ps, f, x, m => by
    simp only [propRep, propCuts]
    rw [rep_append, ← condRep_eq]; exact propRep_eq ps f x _

theorem fieldRep_eq (rules : List Rule) (props : List Property) (f x lo : Nat) :
    fieldRep rules props f x lo = rep (fieldCuts rules props f) lo x := by
  simp only [fieldRep, fieldCuts, rep_append, ruleRep_eq, propRep_eq]

/-! ## Completeness of the search -/

/-- `w` starts a cell of field `f`. -/
def Start (rules : List Rule) (props : List Property) (los his : List Nat) (f w : Nat) : Prop :=
  get los f ≤ w ∧ w ≤ get his f ∧ (w = get los f ∨ w ∈ fieldCuts rules props f)

theorem anyBad_false : ∀ (ps : List Property) (x : List Nat) (o : Nat), anyBad ps x o = false →
    ∀ p ∈ ps, breaksWith p x o = false
  | [], _, _, _, _, hp => absurd hp List.not_mem_nil
  | q :: ps, x, o, h, p, hp => by
    simp only [anyBad] at h
    split at h
    · simp at h
    · rename_i hq
      cases List.mem_cons.mp hp with
      | inl he => subst he; simpa using hq
      | inr hm => exact anyBad_false ps x o h p hm

/-- A verified list of starts holds every cell start at or above `v`. -/
theorem startsOk_mem (rules : List Rule) (props : List Property) (los his : List Nat) (f : Nat) :
    ∀ (s : List Nat) (v : Nat), startsOk rules props his f v s = true → get los f ≤ v →
    ∀ w, Start rules props los his f w → v ≤ w → w ∈ s
  | [], v, h, _, w, ⟨_, hwh, _⟩, hvw => by
    simp only [startsOk] at h
    split at h
    · simp at h
    · omega
  | w0 :: ws, v, h, hv, w, hw, hvw => by
    obtain ⟨hlw, hwh, hcut⟩ := hw
    simp only [startsOk] at h
    split at h
    · rename_i he0
      split at h
      · rename_i hvh
        by_cases he : v = w
        · subst he; subst he0; exact List.mem_cons_self ..
        · have hlt : v < w := by omega
          have hwc : w ∈ fieldCuts rules props f := by
            rcases hcut with h' | h'
            · omega
            · exact h'
          have hn1 := fieldNext_gt rules props f v (get his f) hvh
          have hn2 : fieldNext rules props f v (get his f) ≤ w := by
            rw [fieldNext_eq]; exact nxt_cut _ v _ w hwc hlt
          exact List.mem_cons_of_mem _
            (startsOk_mem rules props los his f ws _ h (by omega) w ⟨hlw, hwh, hcut⟩ hn2)
      · simp at h
    · simp at h

theorem values_none (rules : List Rule) (props : List Property) (d : Nat) (ss : List (List Nat))
    (acc : List Nat) : ∀ (s : List Nat), values rules props d s ss acc = none →
    ∀ w ∈ s, levels rules props d ss (w :: acc) = none
  | [], _, _, hw => absurd hw List.not_mem_nil
  | v :: vs, h, w, hw => by
    rw [values] at h
    split at h
    · simp at h
    · rename_i hl
      cases List.mem_cons.mp hw with
      | inl he => subst he; exact hl
      | inr hm => exact values_none rules props d ss acc vs h w hm

/-- The first `k` values of `g`, in field order. -/
def prefixL (g : Nat → Nat) : Nat → List Nat
  | 0 => []
  | k + 1 => prefixL g k ++ [g k]

theorem levels_none (rules : List Rule) (props : List Property) (d : Nat) (los his : List Nat) :
    ∀ (k : Nat) (ss : List (List Nat)) (acc : List Nat), ssOk rules props los his k ss = true →
    levels rules props d ss acc = none →
    ∀ g : Nat → Nat, (∀ i < k, Start rules props los his i (g i)) →
    ∀ p ∈ props, breaks rules d p (prefixL g k ++ acc) = false
  | 0, [], acc, _, h, g, _, p, hp => by
    rw [levels] at h
    simp only [prefixL, List.nil_append]
    split at h
    · simp at h
    · rename_i hb
      exact anyBad_false props acc _ (by simpa using hb) p hp
  | k + 1, s :: ss, acc, hok, h, g, hg, p, hp => by
    simp only [ssOk] at hok
    split at hok
    · rename_i hs
      rw [levels] at h
      have hk := hg k (Nat.lt_succ_self k)
      have hw := startsOk_mem rules props los his k s (get los k) hs (Nat.le_refl _) (g k) hk hk.1
      have hl := values_none rules props d ss acc s h (g k) hw
      have := levels_none rules props d los his k ss (g k :: acc) hok hl g (fun i hi => hg i (by omega)) p hp
      simpa [prefixL, List.append_assoc] using this
    · simp at hok
  | 0, _ :: _, _, hok, _, _, _, _, _ => by simp [ssOk] at hok
  | _ + 1, [], _, hok, _, _, _, _, _ => by simp [ssOk] at hok

theorem len_eq : ∀ l : List Nat, len l = l.length
  | [] => rfl
  | _ :: vs => by simp [len, len_eq vs]

theorem get_append : ∀ (a b : List Nat) (i : Nat),
    get (a ++ b) i = if i < a.length then get a i else get b (i - a.length)
  | [], b, i => by simp
  | v :: a, b, 0 => by simp [get]
  | v :: a, b, i + 1 => by
    simp only [List.cons_append, get, List.length_cons]
    rw [get_append a b i]
    by_cases h : i < a.length
    · simp [h]
    · simp [h, show ¬ (i + 1 < a.length + 1) by omega]

theorem get_ge : ∀ (l : List Nat) (i : Nat), l.length ≤ i → get l i = 0
  | [], i, _ => by cases i <;> rfl
  | v :: vs, 0, h => by simp at h
  | v :: vs, i + 1, h => get_ge vs i (by simp at h; omega)

theorem prefix_length (g : Nat → Nat) : ∀ k, (prefixL g k).length = k
  | 0 => rfl
  | k + 1 => by simp [prefixL, prefix_length g k]

theorem get_prefix (g : Nat → Nat) : ∀ (k i : Nat), i < k → get (prefixL g k) i = g i
  | 0, _, h => absurd h (Nat.not_lt_zero _)
  | k + 1, i, h => by
    simp only [prefixL]
    rw [get_append, prefix_length]
    by_cases hi : i < k
    · simp [hi, get_prefix g k i hi]
    · have : i = k := by omega
      subst this; simp [get]

theorem inBounds_spec : ∀ (los his x : List Nat), inBounds los his x = true →
    x.length = los.length ∧ ∀ i < los.length, get los i ≤ get x i ∧ get x i ≤ get his i
  | [], [], [], _ => ⟨rfl, fun i h => absurd h (Nat.not_lt_zero _)⟩
  | lo :: los, hi :: his, v :: vs, h => by
    simp only [inBounds] at h
    split at h
    · split at h
      · rename_i h1 h2
        obtain ⟨hl, hb⟩ := inBounds_spec los his vs h
        refine ⟨by simp [hl], fun i hi' => ?_⟩
        cases i with
        | zero => exact ⟨h1, h2⟩
        | succ j => exact hb j (by simp at hi'; omega)
      · simp at h
    · simp at h
  | [], [], _ :: _, h => by simp [inBounds] at h
  | [], _ :: _, _, h => by simp [inBounds] at h
  | _ :: _, [], _, h => by simp [inBounds] at h
  | _ :: _, _ :: _, [], h => by simp [inBounds] at h

/-- Soundness of the check: when `check` finds no counterexample, every property of the model holds
on every in-bounds request. -/
theorem check_sound (rules : List Rule) (props : List Property) (d : Nat) (los his : List Nat)
    (ss : List (List Nat)) (hc : check rules props d los his ss = none) (p : Property) (hp : p ∈ props)
    (x : List Nat) (hb : inBounds los his x = true) : breaks rules d p x = false := by
  obtain ⟨hlen, hbd⟩ := inBounds_spec los his x hb
  let g := fun i => rep (fieldCuts rules props i) (get los i) (get x i)
  have hstart : ∀ i < los.length, Start rules props los his i (g i) := fun i hi => by
    obtain ⟨h1, h2⟩ := hbd i hi
    refine ⟨rep_ge _ _ _, Nat.le_trans (rep_le _ _ _ h1) h2, ?_⟩
    rcases rep_mem (fieldCuts rules props i) (get los i) (get x i) with h | h
    · exact Or.inl h
    · exact Or.inr h
  unfold check at hc
  rw [len_eq] at hc
  split at hc
  · rename_i hok
    have h0 := levels_none rules props d los his los.length ss [] hok hc g hstart p hp
    rw [List.append_nil] at h0
    have hcell : SameCell (fieldCuts rules props) (prefixL g los.length) x := by
      intro i
      by_cases hi : i < los.length
      · rw [get_prefix g _ i hi]; exact rep_same_side _ _ _ (hbd i hi).1
      · rw [get_ge _ i (by rw [prefix_length]; omega), get_ge x i (by omega)]
        intro k _; exact Iff.rfl
    rw [breaks_const rules d p (rules_covered rules props) (prop_covered rules props p hp) hcell] at h0
    exact h0
  · simp at hc

/-- The cell a request falls in is decided like the request (exported `fieldRep` is the spec). -/
theorem decide_eq (rules : List Rule) (d : Nat) (los his x : List Nat) (hb : inBounds los his x = true) :
    decide rules d los his x = some (judge rules d x) := by
  simp [decide, hb]

end PrismLive.Kernel

