# How Foundry looks and reads

`src/FoundryExperience.lex.tex` is the specification of Foundry's look and feel: one named statement per
preference. It is a LexLean module of its own, outside `app/`, so changing a preference does not change
the kernel's proof inputs and does not rebuild or re-prove the kernel.

These are statements, not theorems: Lean proves nothing about looks. `lexlean check` holds the module to
the language. `studio/tools/shell_ui.test.mjs` checks stylesheet and wording consistency;
`home_card_keyboard.test.mjs` and `chat_mode_accessibility.test.mjs` execute projected components for
selection, covers and accessible controls. The mandatory renderer journeys check native keyboard
behavior, persisted saved/search selection and responsive presentation. A source or component check
does not establish a browser or visual pass.

    lexlean fmt --check && lexlean lock --check && lexlean check
