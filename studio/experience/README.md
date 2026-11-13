# How Foundry looks and reads

`src/FoundryExperience.lex.tex` is the specification of Foundry's look and feel: one named statement per
preference. It is a LexLean module of its own, outside `app/`, so changing a preference does not change
the kernel's proof inputs and does not rebuild or re-prove the kernel.

These are statements, not theorems: Lean proves nothing about looks. `lexlean check` holds the module to
the language, and `studio/tools/shell_ui.test.mjs` holds the stylesheet and the wording to each statement.

    lexlean fmt --check && lexlean lock --check && lexlean check
