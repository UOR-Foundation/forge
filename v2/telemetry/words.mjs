// The View's words for the model's codes: what the panel shows and what Prometheus calls each series.
// Words only; no decision lives here. Keys are the model's names (Telemetry.lex.tex), read at load.

// Label values for budgeted KPIs are the kernel's journey names, so a Prometheus rule, the kernel and
// the panel name the same thing the same way.
export const KPI_WORDS = {
  preview: { label: "Enter to preview frame", unit: "time" },
  declaration: { label: "Enter to first declaration", unit: "time" },
  pixel: { label: "First declaration to first pixel", unit: "time" },
  update: { label: "Work per preview update (worst)", unit: "time" },
  edit: { label: "Edit to screen (worst)", unit: "time" },
  checked: { label: "Module complete to Checked", unit: "time" },
  built: { label: "Enter to Checked", unit: "time" },
  reloads: { label: "Preview reloads", unit: "count" },
  think: { label: "Enter to first token (model thinking)", unit: "time" },
  lead: { label: "First token to first declaration", unit: "time" },
  write: { label: "First declaration to module complete", unit: "time" },
  firstTry: { label: "Modules reading at the first try", unit: "count" },
  repaired: { label: "Modules reading after one repair", unit: "count" },
  refused: { label: "Modules refused by the reader", unit: "count" },
  reused: { label: "Checks reused", unit: "count" },
  rechecked: { label: "Checks run", unit: "count" },
};

export const LEVER_WORDS = {
  warmFrame: "Open the live frame earlier: keep a warm frame mounted before Enter so the first preview is a message, not a page load.",
  reasoning: "The model spends most of the wait reasoning before it writes. Cap its reasoning for build turns, or pick a model that reasons less.",
  declarationsFirst: "The first declaration comes late in the answer. Ask the model to write the module's declarations before any prose.",
  projectEarly: "Paint the first declaration as soon as it is whole, without waiting for a structure or the rules.",
  coalesce: "Preview updates cost more than a frame. Coalesce updates to one per animation frame and move the decision table off the main thread.",
  editPath: "An edit takes more than two frames to reach the screen. Send an edit to the frame on its own frame, without waiting for a model stream's batch.",
  reuseChecks: "Checking dominates. Reuse checks by content address so an edit re-checks only what changed (v2/reuse).",
  shorterModule: "Writing the module dominates. Ask for a smaller first module and add to it in later turns.",
  reloadTrigger: "A turn reloaded the preview. Find what changed the frame's address; the live frame should load once per app.",
};

export const SWITCH_WORDS = (from, to, fromRate, toRate) =>
  `Turns run over budget and ${from}'s modules read at the first try ${fromRate / 10}% of the time against ${toRate / 10}% for ${to}. Consider ${to} for build turns.`;

// Prometheus metric families. Names follow Prometheus's conventions: base unit seconds, counters end in
// _total, one family per meaning, the KPI as a label.
export const METRICS = {
  kpi: { name: "prism_kpi_seconds", help: "Latest value of a Prism build KPI in seconds, per turn." },
  threshold: { name: "prism_kpi_threshold_seconds", help: "Smallest value the Forge kernel judges over budget (budget + 1 ms), in seconds." },
  duration: { name: "prism_kpi_duration_seconds", help: "Distribution of a Prism build KPI over turns, in seconds; buckets are 1/4, 1/2, 1, 2 and 4 times the threshold." },
  turns: { name: "prism_kpi_turns", help: "Turns in which a KPI was observed." },
  overTurns: { name: "prism_kpi_over_budget_turns", help: "Turns in which a KPI was over its kernel budget." },
  reloads: { name: "prism_preview_reloads", help: "Preview reloads during build turns." },
  reads: { name: "prism_module_reads", help: "Modules that read, by model and by attempt (first, or after one repair)." },
  refusals: { name: "prism_module_refusals", help: "Modules the reader refused, by model." },
  checks: { name: "prism_checks", help: "Checks after a turn, by whether the result was reused." },
  suggestion: { name: "prism_suggestion_info", help: "A suggestion the on-device loop makes now; 1 while it stands." },
};
