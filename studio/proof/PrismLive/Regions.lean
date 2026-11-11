import PrismLive.Kernel

/-!
# Local, kernel-checkable obligations

For every property `p` and every rule `r` whose answer would break `p`, one obligation: the part
of `r`'s box inside `p`'s box is covered by the boxes of the rules before `r`. Then no request
that `p` speaks about is first matched by `r`. One more obligation covers `otherwise`. Each is
box subtraction over a few intervals, so the Lean kernel decides it quickly, and each depends only
on `p`, `r` and the rules before `r`, which is what makes it a reusable, addressable block.

`regionCheck_sound` proves, once for every model, that passing every obligation means every
property holds on every request in the bounds. Rules must use only `<`, `<=`, `>`, `>=` and `=`
(their box is exactly where they match); properties may also use `!=`, whose box over-covers.
-/

namespace PrismLive.Kernel

/-- A box: one closed interval per field. -/
abbrev Box := List (Nat × Nat)

def inBox : Box → List Nat → Bool
  | [], [] => true
  | (l, h) :: bs, v :: vs => if l ≤ v then (if v ≤ h then inBox bs vs else false) else false
  | _, _ => false

def nonEmpty : Box → Bool
  | [] => true
  | (l, h) :: bs => if l ≤ h then nonEmpty bs else false

@[simp] theorem inBox_cons (l h : Nat) (bs : Box) (v : Nat) (vs : List Nat) :
    inBox ((l, h) :: bs) (v :: vs) = (Decidable.decide (l ≤ v) && Decidable.decide (v ≤ h) && inBox bs vs) := by
  simp only [inBox]; by_cases a : l ≤ v <;> by_cases b : v ≤ h <;> simp [a, b]

theorem nonEmpty_of_inBox : ∀ (b : Box) (x : List Nat), inBox b x = true → nonEmpty b = true
  | [], [], _ => rfl
  | (l, h) :: bs, v :: vs, hx => by
    simp only [inBox] at hx
    split at hx
    · split at hx
      · simp only [nonEmpty]; rw [if_pos (by omega)]; exact nonEmpty_of_inBox bs vs hx
      · simp at hx
    · simp at hx
  | [], _ :: _, hx => by simp [inBox] at hx
  | _ :: _, [], hx => by simp [inBox] at hx

theorem inBox_length : ∀ (b : Box) (x : List Nat), inBox b x = true → x.length = b.length
  | [], [], _ => rfl
  | (l, h) :: bs, v :: vs, hx => by
    simp only [inBox] at hx
    split at hx
    · split at hx
      · simp [inBox_length bs vs hx]
      · simp at hx
    · simp at hx
  | [], _ :: _, hx => by simp [inBox] at hx
  | _ :: _, [], hx => by simp [inBox] at hx

/-! ## Subtraction -/

/-- Boxes that together cover every point of `A` outside `B`. -/
def sub : Box → Box → List Box
  | [], [] => []
  | [], _ :: _ => [[]]
  | a :: as, [] => [a :: as]
  | (al, ah) :: as, (bl, bh) :: bs =>
    if ah < bl then [(al, ah) :: as] else if bh < al then [(al, ah) :: as]
    else (if al < bl then [(al, bl - 1) :: as] else []) ++
         (if bh < ah then [(bh + 1, ah) :: as] else []) ++
         (sub as bs).map (fun p => (max al bl, min ah bh) :: p)

theorem sub_cover : ∀ (A B : Box) (x : List Nat), inBox A x = true → inBox B x = false →
    ∃ p ∈ sub A B, inBox p x = true
  | [], [], [], _, hb => by simp [inBox] at hb
  | [], _ :: _, [], _, _ => ⟨[], by simp [sub], rfl⟩
  | a :: as, [], x, ha, _ => ⟨a :: as, by simp [sub], ha⟩
  | (al, ah) :: as, (bl, bh) :: bs, v :: vs, ha, hb => by
    have hA := ha
    simp only [inBox_cons, Bool.and_eq_true, decide_eq_true_eq] at hA
    obtain ⟨⟨h1, h2⟩, ha'⟩ := hA
    simp only [sub]
    by_cases c1 : ah < bl
    · rw [if_pos c1]; exact ⟨_, List.mem_singleton_self _, ha⟩
    · rw [if_neg c1]
      by_cases c2 : bh < al
      · rw [if_pos c2]; exact ⟨_, List.mem_singleton_self _, ha⟩
      · rw [if_neg c2]
        by_cases lv : v < bl
        · refine ⟨(al, bl - 1) :: as, ?_, ?_⟩
          · rw [if_pos (show al < bl by omega)]; simp
          · simp only [inBox_cons, Bool.and_eq_true, decide_eq_true_eq]; exact ⟨⟨h1, by omega⟩, ha'⟩
        · by_cases rv : bh < v
          · refine ⟨(bh + 1, ah) :: as, ?_, ?_⟩
            · rw [if_pos (show bh < ah by omega)]; simp
            · simp only [inBox_cons, Bool.and_eq_true, decide_eq_true_eq]; exact ⟨⟨by omega, h2⟩, ha'⟩
          · have hbs : inBox bs vs = false := by
              cases h : inBox bs vs
              · rfl
              · simp only [inBox_cons, h, Bool.and_true, Bool.and_eq_false_iff, decide_eq_false_iff_not] at hb
                omega
            obtain ⟨p, hp, hin⟩ := sub_cover as bs vs ha' hbs
            refine ⟨(max al bl, min ah bh) :: p, ?_, ?_⟩
            · simp only [List.mem_append, List.mem_map]; exact Or.inr ⟨p, hp, rfl⟩
            · simp only [inBox_cons, Bool.and_eq_true, decide_eq_true_eq]
              exact ⟨⟨Nat.max_le.mpr ⟨h1, by omega⟩, Nat.le_min.mpr ⟨h2, by omega⟩⟩, hin⟩
  | [], [], _ :: _, ha, _ => by simp [inBox] at ha
  | [], _ :: _, _ :: _, ha, _ => by simp [inBox] at ha
  | _ :: _, _ :: _, [], ha, _ => by simp [inBox] at ha

/-- `A` minus every box of `Bs`, as boxes, empty ones dropped. -/
def subAll (A : Box) : List Box → List Box
  | [] => if nonEmpty A then [A] else []
  | B :: Bs => (subAll A Bs).flatMap (fun p => (sub p B).filter nonEmpty)

theorem subAll_cover (A : Box) (x : List Nat) (ha : inBox A x = true) :
    ∀ Bs : List Box, (∀ B ∈ Bs, inBox B x = false) → ∃ p ∈ subAll A Bs, inBox p x = true
  | [], _ => ⟨A, by simp [subAll, nonEmpty_of_inBox A x ha], ha⟩
  | B :: Bs, h => by
    obtain ⟨p, hp, hin⟩ := subAll_cover A x ha Bs (fun B' hB' => h B' (List.mem_cons_of_mem _ hB'))
    obtain ⟨q, hq, hqin⟩ := sub_cover p B x hin (h B (List.mem_cons_self ..))
    exact ⟨q, List.mem_flatMap.mpr ⟨p, hp, List.mem_filter.mpr ⟨hq, nonEmpty_of_inBox q x hqin⟩⟩, hqin⟩

/-- Empty subtraction: every point of `A` is in some box of `Bs`. -/
theorem covered_of_subAll (A : Box) (Bs : List Box) (h : subAll A Bs = []) (x : List Nat)
    (ha : inBox A x = true) : ∃ B ∈ Bs, inBox B x = true := by
  by_cases hc : ∃ B ∈ Bs, inBox B x = true
  · exact hc
  · have : ∀ B ∈ Bs, inBox B x = false := fun B hB => by
      cases hx : inBox B x
      · rfl
      · exact absurd ⟨B, hB, hx⟩ hc
    obtain ⟨p, hp, _⟩ := subAll_cover A x ha Bs this
    rw [h] at hp; exact absurd hp List.not_mem_nil

def meet : Box → Box → Box
  | (al, ah) :: as, (bl, bh) :: bs => (max al bl, min ah bh) :: meet as bs
  | _, _ => []

theorem inBox_meet : ∀ (A B : Box) (x : List Nat), inBox A x = true → inBox B x = true →
    inBox (meet A B) x = true
  | (al, ah) :: as, (bl, bh) :: bs, v :: vs, ha, hb => by
    simp only [inBox_cons, Bool.and_eq_true, decide_eq_true_eq] at ha hb
    simp only [meet, inBox_cons, Bool.and_eq_true, decide_eq_true_eq]
    exact ⟨⟨Nat.max_le.mpr ⟨ha.1.1, hb.1.1⟩, Nat.le_min.mpr ⟨ha.1.2, hb.1.2⟩⟩, inBox_meet as bs vs ha.2 hb.2⟩
  | _ :: _, _ :: _, [], ha, _ => by simp [inBox] at ha
  | [], _, x, ha, _ => by cases x <;> simp_all [inBox, meet]
  | _ :: _, [], x, _, hb => by cases x <;> simp_all [inBox, meet]

/-! ## The box of a list of conditions -/

def setLo : Box → Nat → Nat → Box
  | [], _, _ => []
  | (l, h) :: bs, 0, lo => (max l lo, h) :: bs
  | b :: bs, f + 1, lo => b :: setLo bs f lo

def setHi : Box → Nat → Nat → Box
  | [], _, _ => []
  | (l, h) :: bs, 0, hi => (l, min h hi) :: bs
  | b :: bs, f + 1, hi => b :: setHi bs f hi

theorem inBox_setLo : ∀ (B : Box) (f lo : Nat) (x : List Nat), f < B.length →
    (inBox (setLo B f lo) x = true ↔ inBox B x = true ∧ lo ≤ get x f)
  | [], _, _, _, hf => absurd hf (Nat.not_lt_zero _)
  | (l, h) :: bs, 0, lo, v :: vs, _ => by
    simp only [setLo, inBox, get]
    constructor
    · intro hx; split at hx
      · split at hx
        · exact ⟨by rw [if_pos (by omega), if_pos (by omega)]; exact hx, by omega⟩
        · simp at hx
      · simp at hx
    · intro ⟨hx, hlo⟩; split at hx
      · split at hx
        · rw [if_pos (by omega), if_pos (by omega)]; exact hx
        · simp at hx
      · simp at hx
  | (l, h) :: bs, f + 1, lo, v :: vs, hf => by
    simp only [setLo, inBox, get]
    have ih := inBox_setLo bs f lo vs (by simp at hf; omega)
    constructor
    · intro hx; split at hx
      · split at hx
        · rename_i a b; exact ⟨by rw [if_pos a, if_pos b]; exact (ih.mp hx).1, (ih.mp hx).2⟩
        · simp at hx
      · simp at hx
    · intro ⟨hx, hlo⟩; split at hx
      · split at hx
        · rename_i a b; rw [if_pos a, if_pos b]; exact ih.mpr ⟨hx, hlo⟩
        · simp at hx
      · simp at hx
  | (l, h) :: bs, f, lo, [], _ => by cases f <;> simp [setLo, inBox]

theorem inBox_setHi : ∀ (B : Box) (f hi : Nat) (x : List Nat), f < B.length →
    (inBox (setHi B f hi) x = true ↔ inBox B x = true ∧ get x f ≤ hi)
  | [], _, _, _, hf => absurd hf (Nat.not_lt_zero _)
  | (l, h) :: bs, 0, hi, v :: vs, _ => by
    simp only [setHi, inBox, get]
    constructor
    · intro hx; split at hx
      · split at hx
        · exact ⟨by rw [if_pos (by omega), if_pos (by omega)]; exact hx, by omega⟩
        · simp at hx
      · simp at hx
    · intro ⟨hx, hhi⟩; split at hx
      · split at hx
        · rw [if_pos (by omega), if_pos (by omega)]; exact hx
        · simp at hx
      · simp at hx
  | (l, h) :: bs, f + 1, hi, v :: vs, hf => by
    simp only [setHi, inBox, get]
    have ih := inBox_setHi bs f hi vs (by simp at hf; omega)
    constructor
    · intro hx; split at hx
      · split at hx
        · rename_i a b; exact ⟨by rw [if_pos a, if_pos b]; exact (ih.mp hx).1, (ih.mp hx).2⟩
        · simp at hx
      · simp at hx
    · intro ⟨hx, hhi⟩; split at hx
      · split at hx
        · rename_i a b; rw [if_pos a, if_pos b]; exact ih.mpr ⟨hx, hhi⟩
        · simp at hx
      · simp at hx
  | (l, h) :: bs, f, hi, [], _ => by cases f <;> simp [setHi, inBox]

theorem setLo_length : ∀ (B : Box) (f lo : Nat), (setLo B f lo).length = B.length
  | [], _, _ => rfl
  | (l, h) :: bs, 0, lo => rfl
  | b :: bs, f + 1, lo => by simp [setLo, setLo_length bs f lo]

theorem setHi_length : ∀ (B : Box) (f hi : Nat), (setHi B f hi).length = B.length
  | [], _, _ => rfl
  | (l, h) :: bs, 0, hi => rfl
  | b :: bs, f + 1, hi => by simp [setHi, setHi_length bs f hi]

/-- Narrow a box by one condition. `!=` (op 5 and above) does not narrow. -/
def condBox (B : Box) (c : Cond) : Box :=
  if c.op = 0 then (if c.value = 0 then setHi (setLo B c.field 1) c.field 0 else setHi B c.field (c.value - 1))
  else if c.op = 1 then setHi B c.field c.value
  else if c.op = 2 then setLo B c.field (c.value + 1)
  else if c.op = 3 then setLo B c.field c.value
  else if c.op = 4 then setHi (setLo B c.field c.value) c.field c.value
  else B

theorem condBox_length (B : Box) (c : Cond) : (condBox B c).length = B.length := by
  unfold condBox; repeat' split
  all_goals simp [setLo_length, setHi_length]

/-- A point in the box that meets the condition stays in the narrowed box. -/
theorem condBox_hull (B : Box) (c : Cond) (x : List Nat) (hf : c.field < B.length)
    (hx : inBox B x = true) (hc : condHolds c x = true) : inBox (condBox B c) x = true := by
  simp only [condHolds, opHolds] at hc
  unfold condBox
  have hl := hf; have hl2 : c.field < (setLo B c.field 1).length := by rw [setLo_length]; exact hf
  have hl3 : c.field < (setLo B c.field c.value).length := by rw [setLo_length]; exact hf
  by_cases h0 : c.op = 0
  · simp only [h0, if_true] at hc ⊢
    split at hc
    · rename_i hv
      by_cases hz : c.value = 0
      · omega
      · rw [if_neg hz]; exact (inBox_setHi B _ _ x hf).mpr ⟨hx, by omega⟩
    · simp at hc
  · simp only [h0, if_false] at hc ⊢
    by_cases h1 : c.op = 1
    · simp only [h1, if_true] at hc ⊢
      split at hc
      · exact (inBox_setHi B _ _ x hf).mpr ⟨hx, by omega⟩
      · simp at hc
    · simp only [h1, if_false] at hc ⊢
      by_cases h2 : c.op = 2
      · simp only [h2, if_true] at hc ⊢
        split at hc
        · exact (inBox_setLo B _ _ x hf).mpr ⟨hx, by omega⟩
        · simp at hc
      · simp only [h2, if_false] at hc ⊢
        by_cases h3 : c.op = 3
        · simp only [h3, if_true] at hc ⊢
          split at hc
          · exact (inBox_setLo B _ _ x hf).mpr ⟨hx, by omega⟩
          · simp at hc
        · simp only [h3, if_false] at hc ⊢
          by_cases h4 : c.op = 4
          · simp only [h4, if_true] at hc ⊢
            split at hc
            · exact (inBox_setHi _ _ _ x hl3).mpr ⟨(inBox_setLo B _ _ x hf).mpr ⟨hx, by omega⟩, by omega⟩
            · simp at hc
          · simp only [h4, if_false]; exact hx

/-- For `<`, `<=`, `>`, `>=` and `=`, a point in the narrowed box meets the condition. -/
theorem condBox_exact (B : Box) (c : Cond) (x : List Nat) (hf : c.field < B.length) (hop : c.op < 5)
    (hx : inBox (condBox B c) x = true) : inBox B x = true ∧ condHolds c x = true := by
  simp only [condHolds, opHolds]
  unfold condBox at hx
  have hl2 : c.field < (setLo B c.field 1).length := by rw [setLo_length]; exact hf
  have hl3 : c.field < (setLo B c.field c.value).length := by rw [setLo_length]; exact hf
  by_cases h0 : c.op = 0
  · simp only [h0, if_true] at hx ⊢
    by_cases hz : c.value = 0
    · rw [if_pos hz] at hx
      have := (inBox_setHi _ _ _ x hl2).mp hx
      have := (inBox_setLo B _ _ x hf).mp this.1
      omega
    · rw [if_neg hz] at hx
      have := (inBox_setHi B _ _ x hf).mp hx
      exact ⟨this.1, by rw [if_pos (by omega)]⟩
  · simp only [h0, if_false] at hx ⊢
    by_cases h1 : c.op = 1
    · simp only [h1, if_true] at hx ⊢
      have := (inBox_setHi B _ _ x hf).mp hx
      exact ⟨this.1, by rw [if_pos this.2]⟩
    · simp only [h1, if_false] at hx ⊢
      by_cases h2 : c.op = 2
      · simp only [h2, if_true] at hx ⊢
        have := (inBox_setLo B _ _ x hf).mp hx
        exact ⟨this.1, by rw [if_pos (by omega)]⟩
      · simp only [h2, if_false] at hx ⊢
        by_cases h3 : c.op = 3
        · simp only [h3, if_true] at hx ⊢
          have := (inBox_setLo B _ _ x hf).mp hx
          exact ⟨this.1, by rw [if_pos this.2]⟩
        · simp only [h3, if_false] at hx ⊢
          have h4 : c.op = 4 := by omega
          simp only [h4, if_true] at hx ⊢
          have a := (inBox_setHi _ _ _ x hl3).mp hx
          have b := (inBox_setLo B _ _ x hf).mp a.1
          exact ⟨b.1, by rw [if_pos (by omega)]⟩

def boxOf (B : Box) : List Cond → Box
  | [] => B
  | c :: cs => boxOf (condBox B c) cs

def condsOk (n : Nat) (strict : Bool) : List Cond → Bool
  | [] => true
  | c :: cs => if c.field < n then (if strict then (if c.op < 5 then condsOk n strict cs else false) else condsOk n strict cs) else false

theorem condsOk_weaken (n : Nat) : ∀ cs : List Cond, condsOk n true cs = true → condsOk n false cs = true
  | [], _ => rfl
  | c :: cs, h => by
    by_cases hf : c.field < n
    · by_cases ho : c.op < 5
      · simp [condsOk, hf, ho] at h ⊢; exact condsOk_weaken n cs h
      · simp [condsOk, hf, ho] at h
    · simp [condsOk, hf] at h

theorem boxOf_length : ∀ (B : Box) (cs : List Cond), (boxOf B cs).length = B.length
  | _, [] => rfl
  | B, c :: cs => by simp [boxOf, boxOf_length _ cs, condBox_length]

theorem boxOf_hull : ∀ (B : Box) (cs : List Cond) (x : List Nat), condsOk B.length false cs = true →
    inBox B x = true → allHold cs x = true → inBox (boxOf B cs) x = true
  | _, [], _, _, hx, _ => hx
  | B, c :: cs, x, hok, hx, hall => by
    simp only [condsOk] at hok
    split at hok
    · rename_i hf
      simp only [allHold] at hall
      split at hall
      · rename_i hc
        have := boxOf_hull (condBox B c) cs x (by rw [condBox_length]; exact hok) (condBox_hull B c x hf hx hc) hall
        exact this
      · simp at hall
    · simp at hok

theorem boxOf_exact : ∀ (B : Box) (cs : List Cond) (x : List Nat), condsOk B.length true cs = true →
    inBox (boxOf B cs) x = true → inBox B x = true ∧ allHold cs x = true
  | _, [], _, _, hx => ⟨hx, rfl⟩
  | B, c :: cs, x, hok, hx => by
    simp only [condsOk] at hok
    split at hok
    · rename_i hf
      rw [if_true] at hok
      split at hok
      · rename_i hop
        have ih := boxOf_exact (condBox B c) cs x (by rw [condBox_length]; exact hok) hx
        have := condBox_exact B c x hf hop ih.1
        simp only [allHold, this.2, if_true]
        exact ⟨this.1, ih.2⟩
      · simp at hok
    · simp at hok

/-! ## The obligations -/

/-- Outcome `o` would break property `p`. -/
def bad (p : Property) (o : Nat) : Bool :=
  if p.always then (if o = p.outcome then false else true) else (if o = p.outcome then true else false)

theorem breaksWith_eq (p : Property) (x : List Nat) (o : Nat) :
    breaksWith p x o = (allHold p.when x && bad p o) := by
  simp only [breaksWith, bad]; split <;> simp_all

/-- Rule `r`, after the rules `pre`, never first-matches a request that `p` speaks about with an
answer that breaks `p`. -/
def oblRule (B : Box) (pre : List Rule) (r : Rule) (p : Property) : Bool :=
  if bad p r.outcome then (subAll (meet (boxOf B r.when) (boxOf B p.when)) (pre.map (fun q => boxOf B q.when))).isEmpty
  else true

def oblRules (B : Box) (p : Property) : List Rule → List Rule → Bool
  | _, [] => true
  | pre, r :: rs => oblRule B pre r p && oblRules B p (pre ++ [r]) rs

/-- `otherwise` never answers, against `p`, a request no rule matches. -/
def oblOther (B : Box) (rules : List Rule) (d : Nat) (p : Property) : Bool :=
  if bad p d then (subAll (meet B (boxOf B p.when)) (rules.map (fun q => boxOf B q.when))).isEmpty else true

def regionCheck (B : Box) (rules : List Rule) (props : List Property) (d : Nat) : Bool :=
  rules.all (fun r => condsOk B.length true r.when) &&
  props.all (fun p => condsOk B.length false p.when && oblRules B p [] rules && oblOther B rules d p)

/-! ## Soundness -/

theorem judge_cases (d : Nat) (x : List Nat) : ∀ rules : List Rule,
    ((∀ r ∈ rules, allHold r.when x = false) ∧ judge rules d x = d) ∨
    ∃ pre r suf, rules = pre ++ r :: suf ∧ (∀ q ∈ pre, allHold q.when x = false) ∧
      allHold r.when x = true ∧ judge rules d x = r.outcome
  | [] => Or.inl ⟨fun _ h => absurd h List.not_mem_nil, rfl⟩
  | r :: rs => by
    cases hr : allHold r.when x
    · rcases judge_cases d x rs with ⟨hn, hj⟩ | ⟨pre, r', suf, he, hp, hm, hj⟩
      · left; refine ⟨fun q hq => ?_, ?_⟩
        · cases List.mem_cons.mp hq with
          | inl h => subst h; exact hr
          | inr h => exact hn q h
        · simp [judge, hr, hj]
      · right; refine ⟨r :: pre, r', suf, by simp [he], fun q hq => ?_, hm, by simp [judge, hr, hj]⟩
        cases List.mem_cons.mp hq with
        | inl h => subst h; exact hr
        | inr h => exact hp q h
    · right; exact ⟨[], r, rs, rfl, fun _ h => absurd h List.not_mem_nil, hr, by simp [judge, hr]⟩

theorem oblRules_at (B : Box) (p : Property) : ∀ (acc pre : List Rule) (r : Rule) (suf : List Rule),
    oblRules B p acc (pre ++ r :: suf) = true → oblRule B (acc ++ pre) r p = true
  | acc, [], r, suf, h => by simp only [List.nil_append, oblRules, Bool.and_eq_true] at h; simpa using h.1
  | acc, q :: pre, r, suf, h => by
    simp only [List.cons_append, oblRules, Bool.and_eq_true] at h
    have := oblRules_at B p (acc ++ [q]) pre r suf h.2
    simpa [List.append_assoc] using this

/-- Passing every obligation means every property holds on every request in the bounds. -/
theorem regionCheck_sound (B : Box) (rules : List Rule) (props : List Property) (d : Nat)
    (hc : regionCheck B rules props d = true) (p : Property) (hp : p ∈ props)
    (x : List Nat) (hx : inBox B x = true) : breaks rules d p x = false := by
  simp only [regionCheck, Bool.and_eq_true, List.all_eq_true] at hc
  obtain ⟨hrules, hprops⟩ := hc
  obtain ⟨⟨hpok, hobl⟩, hother⟩ := hprops p hp
  simp only [breaks, breaksWith_eq]
  cases hw : allHold p.when x
  · rfl
  · have hW := boxOf_hull B p.when x hpok hx hw
    rcases judge_cases d x rules with ⟨hn, hj⟩ | ⟨pre, r, suf, he, hpre, hm, hj⟩
    · rw [hj]
      cases hb : bad p d
      · rfl
      · simp only [oblOther, hb, if_true, List.isEmpty_iff] at hother
        obtain ⟨Q, hQ, hin⟩ := covered_of_subAll _ _ hother x (inBox_meet _ _ x hx hW)
        obtain ⟨q, hq, rfl⟩ := List.mem_map.mp hQ
        have := (boxOf_exact B q.when x (hrules q hq) hin).2
        rw [hn q hq] at this; exact absurd this (by simp)
    · rw [hj]
      cases hb : bad p r.outcome
      · rfl
      · have hr := oblRules_at B p [] pre r suf (he ▸ hobl)
        simp only [List.nil_append, oblRule, hb, if_true, List.isEmpty_iff] at hr
        have hR := boxOf_hull B r.when x (condsOk_weaken _ _ (hrules r (by rw [he]; simp))) hx hm
        obtain ⟨Q, hQ, hin⟩ := covered_of_subAll _ _ hr x (inBox_meet _ _ x hR hW)
        obtain ⟨q, hq, rfl⟩ := List.mem_map.mp hQ
        have hqr : q ∈ rules := by rw [he]; simp [hq]
        have := (boxOf_exact B q.when x (hrules q hqr) hin).2
        rw [hpre q hq] at this; exact absurd this (by simp)

end PrismLive.Kernel

