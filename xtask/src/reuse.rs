//! Spend time and compute only on what changed.
//!
//! Every workflow that a push or a pull request starts must say what it reads, so that a change
//! outside its inputs costs nothing. It says so in one of three ways:
//!
//! - a path filter (`paths:` or `paths-ignore:`) under every such trigger, so it does not run;
//! - an address: a cache key computed with `hashFiles(...)` and restored through `actions/cache`,
//!   so it runs but reuses the work already done for the same files;
//! - a stated exemption, `# reuse-exempt: <reason>`, for a workflow whose every run is an explicit
//!   request to do the work again.
//!
//! The gate checks the declaration, not that a key names every input: that soundness argument
//! belongs beside each key, in the workflow.

use std::path::Path;

type Fail = Box<dyn std::error::Error>;

const TRIGGERS: [&str; 2] = ["push", "pull_request"];
const EXEMPT: &str = "# reuse-exempt: ";

pub fn audit(root: &Path) -> Result<(), Fail> {
    let directory = root.join(".github/workflows");
    let mut paths = std::fs::read_dir(&directory)?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| {
            path.extension()
                .is_some_and(|extension| extension == "yml" || extension == "yaml")
        })
        .collect::<Vec<_>>();
    paths.sort();
    for path in paths {
        let source = std::fs::read_to_string(&path)?;
        if let Err(trigger) = reuse_is_declared(&source) {
            return Err(format!(
                "{} runs on every {trigger} without a path filter, an address (a hashFiles cache key) or a stated `{}` reason",
                path.display(),
                EXEMPT.trim_end()
            )
            .into());
        }
    }
    println!("audit-reuse: every workflow runs only on its inputs or reuses work by address");
    Ok(())
}

/// `Err(trigger)` names the first push or pull-request trigger that would redo work it cannot
/// tell is unchanged.
fn reuse_is_declared(source: &str) -> Result<(), &'static str> {
    let lines: Vec<&str> = source.lines().collect();
    let addressed = lines.iter().any(|line| {
        let line = line.trim_start();
        (line.starts_with("key:") || line.contains("key=")) && line.contains("hashFiles(")
    }) && lines.iter().any(|line| {
        let line = line.trim_start();
        line.starts_with("uses: actions/cache@") || line.starts_with("uses: actions/cache/restore@")
    });
    let exempt = lines.iter().any(|line| {
        line.trim_start()
            .strip_prefix(EXEMPT)
            .is_some_and(|reason| reason.trim().len() >= 20)
    });
    if addressed || exempt {
        return Ok(());
    }
    let Some(start) = lines.iter().position(|line| *line == "on:") else {
        return Ok(());
    };
    let on: Vec<&str> = lines[start + 1..]
        .iter()
        .take_while(|line| line.is_empty() || line.starts_with(' '))
        .copied()
        .collect();
    for trigger in TRIGGERS {
        let Some(at) = on.iter().position(|line| {
            line.strip_prefix("  ")
                .and_then(|rest| rest.strip_prefix(trigger))
                .is_some_and(|rest| rest.starts_with(':'))
        }) else {
            continue;
        };
        let filtered = on[at + 1..]
            .iter()
            .take_while(|line| line.is_empty() || line.starts_with("    "))
            .any(|line| line.starts_with("    paths:") || line.starts_with("    paths-ignore:"));
        if !filtered {
            return Err(trigger);
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::reuse_is_declared;

    fn workflows() -> Vec<(String, String)> {
        let directory =
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../.github/workflows");
        let mut out: Vec<(String, String)> = std::fs::read_dir(directory)
            .expect("the workflows directory")
            .map(|entry| entry.expect("an entry").path())
            .filter(|path| path.extension().is_some_and(|e| e == "yml"))
            .map(|path| {
                let name = path.file_name().unwrap().to_string_lossy().into_owned();
                (name, std::fs::read_to_string(&path).expect("a workflow"))
            })
            .collect();
        out.sort();
        out
    }

    fn workflow(name: &str) -> String {
        workflows()
            .into_iter()
            .find(|(n, _)| n == name)
            .map(|(_, s)| s)
            .unwrap_or_else(|| panic!("{name} exists"))
    }

    #[test]
    fn every_workflow_declares_its_reuse() {
        for (name, source) in workflows() {
            assert_eq!(reuse_is_declared(&source), Ok(()), "{name}");
        }
    }

    #[test]
    fn redone_work_plants_are_rejected() {
        let codespace = workflow("try-codespace.yml");
        let pages = workflow("pages.yml");
        let build = workflow("build.yml");
        let plants = [
            // A push to main loses its path filter.
            (
                codespace.replacen(
                    "    branches: [main]\n    paths-ignore:\n      - \"studio/**\"\n      - \"v2/**\"\n",
                    "    branches: [main]\n",
                    1,
                ),
                "push",
            ),
            // A pull request loses its path filter.
            (
                codespace.replacen(
                    "  pull_request:\n    # Forge (studio/) is not read by the try page, the frame, the identity page or the try codespace: a pull\n    # request that changes only Forge or the v2/ prototypes does not wait for them.\n    paths-ignore:\n      - \"studio/**\"\n      - \"v2/**\"\n",
                    "  pull_request:\n",
                    1,
                ),
                "pull_request",
            ),
            // The deploy's work is no longer addressed: its keys stop hashing the files.
            (pages.replace("hashFiles(", "format("), "push"),
            // An exemption with no reason.
            (
                build
                    .lines()
                    .map(|line| if line.starts_with("# reuse-exempt: ") { "# reuse-exempt: " } else { line })
                    .collect::<Vec<_>>()
                    .join("\n"),
                "push",
            ),
        ];
        for (plant, trigger) in &plants {
            assert!(
                [&codespace, &pages, &build]
                    .iter()
                    .all(|original| *original != plant),
                "every plant must change its workflow"
            );
            assert_eq!(reuse_is_declared(plant), Err(*trigger));
        }
    }

    /// The Prism page's address leaves the other workflows out, and may: its build reads none of them.
    /// A key that omits an input is wrong, so the omission is held to the build itself. If the build
    /// job, or a script it runs, comes to read another workflow, this fails until the key names it.
    #[test]
    fn the_page_address_omits_only_workflows_its_build_does_not_read() {
        let pages = workflow("pages.yml");
        assert!(
            pages.contains(
                "hashFiles('**', '!studio/**', '!v2/**', '!.git/**', '!.github/workflows/**', '.github/workflows/pages.yml')"
            ),
            "the page address changed: say here what its build reads"
        );
        let build = pages
            .split("\n  build:\n")
            .nth(1)
            .and_then(|rest| rest.split("\n  forge:\n").next())
            .expect("the build job, before the forge job");
        // What a step reads is in what it runs, not in a comment beside it.
        let build: String = build
            .lines()
            .filter(|line| !line.trim_start().starts_with('#'))
            .collect::<Vec<_>>()
            .join("\n");
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("..");
        let mut read = vec![("pages.yml: build".to_owned(), build.clone())];
        for script in build
            .split(|c: char| c.is_whitespace() || c == '"' || c == '\'')
            .filter(|word| word.starts_with("bootstrap/") && word.contains('.'))
        {
            let source = std::fs::read_to_string(root.join(script))
                .unwrap_or_else(|_| panic!("{script} is run by the page build and must exist"));
            read.push((script.to_owned(), source));
        }
        assert!(
            read.len() > 5,
            "the scripts the page build runs were not found"
        );
        for (name, _) in workflows() {
            if name == "pages.yml" {
                continue;
            }
            for (reader, source) in &read {
                assert!(
                    !source.contains(&name),
                    "{reader} names {name}: the page address must then include it"
                );
            }
        }
        for (reader, source) in &read[1..] {
            assert!(
                !source.contains(".github/workflows"),
                "{reader} reads the workflows directory: the page address must then include it"
            );
        }
    }
}
