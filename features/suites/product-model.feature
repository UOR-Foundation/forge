Feature: product-model

  Foundry is one Prism model, as every app it builds is: its behavior is the kernel in app/src, and
  its other facets are written from app/product.json and the kernel by the builder's projector
  (studio/shell/prism/builder/facets.mjs, through studio/tools/foundry_model.mjs).

  @PM-01 @build
  Scenario: Foundry is one Prism model whose architecture, design, features, security, quality and compliance facets are projected from app/product.json and the kernel, and whose quality thresholds are the kernel's own terms
    Given app/product.json, model/ids.toml and the kernel modules in app/src
    When the projector writes Architecture, Design, Features, Security, Quality and Compliance
    Then each facet module is an entrypoint of app/lexlean.toml, so prismpm check and verify read it
    And the architecture, quality and compliance theorems are proved by decide over their own records
    And every kernel budget and experience rule is a quality measure whose threshold theorem names the kernel's term, never a copied number
