// The view: how every Prism app is drawn from its projection, on shadcn/ui. The live frame (frame.jsx)
// renders it in the preview as the spec is written; the card renderer (card-render.jsx) renders it at
// publish into the app's own card, so the published page draws the same components with the same classes.
// What a node shows comes from `Live`, the state of the screen: the frame fills it from what the user
// typed, the card renderer once for each state a node can be in. Interactions are marked in the markup
// (data-value, data-step, data-fill) so the published page, which runs no React, can wire the same ones.
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

// The screen's state: {ready, answer, fires, request, passes, rules, values, set, note}.
export const Live = createContext({ ready: false, values: {}, set: () => {} });

function Field({ data }) {
  const { values, set } = useContext(Live);
  const f = data.field, v = values[f.name] ?? "", id = "f-" + f.name;
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{data.label}</Label>
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
        <CardDescription>{data.label}</CardDescription>
        <CardTitle key={answer} className={cn("font-display text-4xl tracking-tight animate-in fade-in-0 slide-in-from-bottom-1 duration-200", answer === "invalid" || !ready ? "text-muted-foreground" : "text-brand")}>{ready ? answer : "—"}</CardTitle>
      </CardHeader>
      {(meaning || because) && <CardContent className="grid gap-1">{meaning && <p>{meaning}</p>}{because && <p className="text-sm text-muted-foreground">{because}</p>}</CardContent>}
    </Card>
  );
}
function Rule({ kind, data }) {
  const { fires } = useContext(Live);
  const on = fires === data.index;
  return (
    <div className={cn("rounded-lg border px-4 py-3 transition-colors", on && "border-brand bg-brand/5")}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm">{kind === "rule" ? "When " + data.when : "Otherwise"}</span>
        <Badge variant={on ? "default" : "secondary"} className={cn(on && "bg-brand text-brand-foreground")}>{data.then}</Badge>
      </div>
      {data.why && <p className="mt-1 text-sm text-muted-foreground">{data.why}</p>}
    </div>
  );
}
function Example({ data }) {
  const { ready, request, passes, values, set, logic } = useContext(Live);
  const pass = ready ? passes(data.request, data.response) : null;
  return (
    <Button variant="outline" size="sm" data-fill={data.request} onClick={() => set(fillValues(logic, data.request, values))} className={cn("self-start rounded-full font-mono", ready && request === data.request && "border-foreground", pass === false && "border-destructive")}>
      {data.request}<span className="text-muted-foreground">→</span>{data.response}
      {pass === true ? <CheckIcon className="text-brand" /> : pass === false ? <XIcon className="text-destructive" /> : null}
    </Button>
  );
}

/** One node's body. */
export function NodeBody({ node }) {
  const d = node.data;
  return node.kind === "heading" ? <h1 className="font-display text-4xl font-semibold tracking-tight text-balance">{d.text}</h1>
    : node.kind === "text" ? <p className="leading-7 text-muted-foreground">{d.text}</p>
    : node.kind === "input" ? <Field data={d} />
    : node.kind === "answer" ? <Answer data={d} />
    : node.kind === "rule" || node.kind === "otherwise" ? <Rule kind={node.kind} data={d} />
    : node.kind === "example" ? <Example data={d} /> : null;
}

/** The props of a node's wrapper: the same element in the frame and in the card. */
export const nodeProps = (node, gap) => ({ "data-key": node.key, "data-kappa": node.kappa, className: cn("flex flex-col rounded-lg animate-in fade-in-0 slide-in-from-bottom-1 duration-300", gap && "mt-3") });

const group = (kind) => (kind === "rule" || kind === "otherwise" ? "rules" : kind);
/** Whether a node opens a new group of the screen, and so stands apart from the one before it. */
export const gapBefore = (nodes, i) => i > 0 && group(nodes[i].kind) !== group(nodes[i - 1].kind) && (group(nodes[i].kind) === "rules" || nodes[i].kind === "example");

export const mainClass = "mx-auto flex max-w-xl flex-col gap-4 px-5 pt-14 pb-16";
export const EMPTY = "The app appears here as its rules are written.";
