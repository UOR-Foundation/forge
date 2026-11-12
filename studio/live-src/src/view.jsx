// The view: how every Prism app is drawn from its projection, on shadcn/ui. The live frame (frame.jsx)
// renders it in the preview as the spec is written; the card renderer (card-render.jsx) renders it at
// publish into the app's own card, so the published page draws the same components with the same classes.
// What a node shows comes from `Live`, the state of the screen: the frame fills it from what the user
// typed, the card renderer once for each state a node can be in. Interactions are marked in the markup
// (data-value, data-step, data-fill) so the published page, which runs no React, can wire the same ones,
// and an element React remounts when a value changes (a `key`) says so (data-remount), so the page
// remounts it too and it enters as it does in the preview.
//
// Words on the screen are places in the spec (each node's `edit` paths). The frame makes them editable by
// providing an editor (Editor); the card provides none, so on the published page they are words only.
import { createContext, useContext } from "react";
import { CheckIcon, MinusIcon, PlusIcon, XIcon } from "lucide-react";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/ui/card";
import { Input } from "@/ui/input";
import { Label } from "@/ui/label";
import { NativeSelect, NativeSelectOption } from "@/ui/native-select";
import { ToggleGroup, ToggleGroupItem } from "@/ui/toggle-group";
import { cn } from "@/lib/utils";
import { stepValue, fillValues } from "../../shell/live/card-runtime.mjs";

// The screen's state: {ready, answer, fires, request, passes, rules, values, logic, set, note, checks,
// broken, size, reason, trust}.
export const Live = createContext({ ready: false, values: {}, set: () => {} });
// The component that edits a word in place, given {path, value, className, onDouble}; null where nothing is edited.
export const Editor = createContext(null);
function Editable({ path, value, className, onDouble = false }) {
  const Edit = useContext(Editor);
  const text = value == null ? "" : String(value);
  if (!path || !Edit) return <span className={className}>{text}</span>;
  return <Edit path={path} value={text} className={className} onDouble={onDouble} />;
}

function Field({ data }) {
  const { values, set } = useContext(Live);
  const f = data.field, v = values[f.name] ?? "", id = "f-" + f.name;
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}><Editable path={data.edit && data.edit.label} value={data.label} /></Label>
      {f.kind === "choice" && f.values.length <= 5 ? (
        <ToggleGroup id={id} type="single" variant="outline" className="w-full" value={v} onValueChange={(x) => x && set({ [f.name]: x })}>
          {f.values.map((x) => <ToggleGroupItem key={x} value={x} data-value={x} className="flex-1">{x}</ToggleGroupItem>)}
        </ToggleGroup>
      ) : f.kind === "choice" ? (
        <NativeSelect id={id} className="w-full" value={v} onChange={(e) => set({ [f.name]: e.target.value })}>
          {f.values.map((x) => <NativeSelectOption key={x} value={x}>{x}</NativeSelectOption>)}
        </NativeSelect>
      ) : (
        <div className="flex gap-2">
          <Button variant="outline" size="icon" aria-label="less" data-step="-1" onClick={() => set({ [f.name]: stepValue(f, v, -1) })}><MinusIcon /></Button>
          <Input id={id} type="number" inputMode="numeric" step={1} min={f.min} max={f.max} className="text-center tabular-nums" value={v} onChange={(e) => set({ [f.name]: e.target.value })} />
          <Button variant="outline" size="icon" aria-label="more" data-step="1" onClick={() => set({ [f.name]: stepValue(f, v, 1) })}><PlusIcon /></Button>
        </div>
      )}
    </div>
  );
}
function Answer({ data }) {
  const { ready, answer, fires, rules, note } = useContext(Live);
  const meaning = ready && answer && data.meanings ? data.meanings[answer] : "";
  const because = note || (!ready ? "" : answer === "invalid" ? "Not a valid request" : fires < rules ? `Rule ${fires + 1} decides` : "No rule matches, so the otherwise answer");
  return (
    <Card className="mt-2 gap-3">
      <CardHeader>
        <CardDescription><Editable path={data.edit && data.edit.label} value={data.label} /></CardDescription>
        <CardTitle key={answer} data-remount={String(answer)} className={cn("font-display text-4xl tracking-tight animate-in fade-in-0 slide-in-from-bottom-1 duration-200", answer === "invalid" || !ready ? "text-muted-foreground" : "text-brand")}>{ready ? answer : "—"}</CardTitle>
      </CardHeader>
      {(meaning || because) && <CardContent className="grid gap-1">{meaning && <p><Editable path={data.edit && data.edit.meaning ? [...data.edit.meaning, answer] : null} value={meaning} /></p>}{because && <p className="text-sm text-muted-foreground">{because}</p>}</CardContent>}
    </Card>
  );
}
function Rule({ kind, data }) {
  const { fires, broken } = useContext(Live);
  const on = fires === data.index, bad = broken && broken.has(data.index);
  return (
    <div className={cn("rounded-lg border px-4 py-3 transition-colors", on && "border-brand bg-brand/5", bad && "border-destructive bg-destructive/5")}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm">{kind === "rule" ? "When " + data.when : "Otherwise"}</span>
        <Badge variant={on ? "default" : "secondary"} className={cn(on && "bg-brand text-brand-foreground")}><Editable path={data.edit && data.edit.then} value={data.then} /></Badge>
      </div>
      {data.why && <p className="mt-1 text-sm text-muted-foreground"><Editable path={data.edit && data.edit.why} value={data.why} /></p>}
    </div>
  );
}
function Guarantee({ data }) {
  const { checks, size, reason, trust, rules } = useContext(Live);
  const c = checks ? checks[data.index] : null;
  const proved = trust === "proved" || trust === "published";
  const n = (x) => x.toLocaleString("en");
  return (
    <div className={cn("rounded-lg border px-4 py-3", c && !c.ok && "border-destructive")}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium">{data.kind === "never" ? "Never" : "Always"} <Editable path={data.edit && data.edit.then} value={data.then} /> when {data.when}</span>
        {proved ? <Badge className="bg-brand text-brand-foreground">Proved by Lean</Badge>
          : c && c.ok ? <Badge variant="outline"><CheckIcon className="text-brand" />Tested on all {n(size)}</Badge>
          : c ? <Badge variant="destructive">Broken</Badge>
          : <Badge variant="secondary">{reason ? "Not tabulated" : "Checking"}</Badge>}
      </div>
      {c && !c.ok ? <p className="mt-1 text-sm text-destructive"><span className="font-mono">{c.request}</span> answers {c.outcome}, by {c.rule < (rules || 0) ? "rule " + (c.rule + 1) : "otherwise"}.</p>
        : data.why ? <p className="mt-1 text-sm text-muted-foreground"><Editable path={data.edit && data.edit.why} value={data.why} /></p> : null}
      {reason && !c && <p className="mt-1 text-sm text-muted-foreground">{reason}; Lean will check it for every request.</p>}
    </div>
  );
}
function Example({ data }) {
  const { ready, request, passes, values, set, logic } = useContext(Live);
  const pass = ready ? passes(data.request, data.response) : null;
  return (
    <Button variant="outline" size="sm" data-fill={data.request} onClick={() => set(fillValues(logic, data.request, values))} className={cn("self-start rounded-full font-mono", ready && request === data.request && "border-foreground", pass === false && "border-destructive")}>
      <Editable onDouble path={data.edit && data.edit.request} value={data.request} /><span className="text-muted-foreground">→</span><Editable onDouble path={data.edit && data.edit.response} value={data.response} />
      {pass === true ? <CheckIcon className="text-brand" /> : pass === false ? <XIcon className="text-destructive" /> : null}
    </Button>
  );
}

/** One node's body. */
export function NodeBody({ node }) {
  const d = node.data;
  return node.kind === "heading" ? <h1 className="font-display text-4xl font-semibold tracking-tight text-balance"><Editable path={d.edit && d.edit.text} value={d.text} /></h1>
    : node.kind === "text" ? <p className="leading-7 text-muted-foreground"><Editable path={d.edit && d.edit.text} value={d.text} /></p>
    : node.kind === "input" ? <Field data={d} />
    : node.kind === "answer" ? <Answer data={d} />
    : node.kind === "rule" || node.kind === "otherwise" ? <Rule kind={node.kind} data={d} />
    : node.kind === "property" ? <Guarantee data={d} />
    : node.kind === "example" ? <Example data={d} /> : null;
}

/** The props of a node's wrapper: the same element in the frame and in the card. */
// `pointed` (the frame's: the node the user pointed the agent at) is never set on the published page.
export const nodeProps = (node, gap, pointed = false) => ({ "data-key": node.key, "data-kappa": node.kappa, className: cn("flex flex-col rounded-lg animate-in fade-in-0 slide-in-from-bottom-1 duration-300", gap && "mt-3", pointed && "ring-2 ring-brand ring-offset-4 ring-offset-background") });

const group = (kind) => (kind === "rule" || kind === "otherwise" ? "rules" : kind === "property" ? "guarantees" : kind);
/** Whether a node opens a new group of the screen, and so stands apart from the one before it. */
export const gapBefore = (nodes, i) => i > 0 && group(nodes[i].kind) !== group(nodes[i - 1].kind) && (group(nodes[i].kind) === "rules" || group(nodes[i].kind) === "guarantees" || nodes[i].kind === "example");

export const mainClass = "mx-auto flex max-w-xl flex-col gap-4 px-5 pt-14 pb-16";
export const EMPTY = "The app appears here as its rules are written.";
