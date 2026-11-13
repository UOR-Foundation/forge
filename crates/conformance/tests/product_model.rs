//! The `product-model` suite: one test per scenario in `features/suites/product-model.feature`.
//!
//! The facet theorems are checked by the Lean kernel when `just vv` runs `prismpm verify` on `app/`,
//! and `just app` refuses a facet that differs from what the projector writes. What this test holds
//! fixed is what the theorems are about, so a facet that still verifies after being weakened (a
//! threshold pinned to a copied number instead of the kernel's term) fails the gate.
use std::path::PathBuf;

fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(2)
        .expect("crates/conformance is two below the root")
        .to_path_buf()
}

fn module(path: &str) -> String {
    std::fs::read_to_string(root().join(path)).unwrap_or_else(|_| panic!("{path}"))
}

/// The body of the top-level declaration named `name`, up to its closing brace.
fn declaration<'a>(model: &'a str, name: &str) -> &'a str {
    let start = model
        .find(&format!("\n  name: {name},\n"))
        .unwrap_or_else(|| panic!("{name} is not declared"));
    let end = model[start..]
        .find("\n}\n")
        .unwrap_or_else(|| panic!("{name} is not closed"));
    &model[start..start + end]
}

/// `PM-01`: Foundry is one Prism model whose architecture, design, features, security, quality and compliance facets are projected from app/product.json and the kernel, and whose quality thresholds are the kernel's own terms
#[test]
fn product_model_pm_01() {
    let toml = module("app/lexlean.toml");
    for facet in [
        "Architecture",
        "Compliance",
        "Design",
        "Features",
        "Quality",
        "Security",
    ] {
        assert!(
            toml.contains(&format!("\"src/{facet}.lex.tex\"")),
            "{facet} is not an entrypoint, so the SDK never reads it"
        );
    }
    for (path, theorem, statement) in [
        (
            "app/src/Architecture.lex.tex",
            "architectureDescriptionHolds",
            "((architectureValid) = true)",
        ),
        (
            "app/src/Quality.lex.tex",
            "qualityModelHolds",
            "((qualityValid) = true)",
        ),
        (
            "app/src/Compliance.lex.tex",
            "everyObligationEvidenced",
            "((obligationsEvidenced 0 (obligations)) = true)",
        ),
    ] {
        let model = module(path);
        let found = declaration(&model, theorem);
        assert!(
            found.contains(&format!("statement: {statement},")),
            "{theorem} must state {statement}:\n{found}"
        );
        assert!(
            found.contains("proof: decide{}"),
            "{theorem} is proved by decide"
        );
    }

    // Every budget and experience rule the kernel declares is a measure, and its threshold theorem
    // names the kernel's own term.
    let kernel = module("app/src/ForgeKernel.lex.tex");
    let quality = module("app/src/Quality.lex.tex");
    let terms: Vec<String> = kernel
        .lines()
        .filter_map(|line| line.strip_prefix("definition{name: "))
        .filter_map(|rest| rest.split(',').next())
        .filter(|name| {
            name.starts_with("journey")
                || ["narrowBreakpoint", "motionMaximum", "tapMinimum"].contains(name)
        })
        .map(|name| {
            if name.starts_with("journey") {
                format!("= (ForgeKernel::budgetOf (ForgeKernel::{name})))")
            } else {
                format!("= (ForgeKernel::{name}))")
            }
        })
        .collect();
    assert_eq!(terms.len(), 21, "the kernel's budgets and rules changed");
    for term in &terms {
        let pinned = quality
            .lines()
            .filter(|line| {
                line.starts_with("  statement: ((thresholdOf ")
                    && line.ends_with(&format!("{term},"))
            })
            .count();
        assert_eq!(
            pinned, 1,
            "no threshold theorem names the kernel's term {term}"
        );
    }
}
