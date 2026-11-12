// A stateful app's screen: one frame of PrismPM's browser presentation protocol, as the host read it
// from the running spec (shell/live/app.mjs), drawn with the same shadcn/ui components as every other
// node of the live frame. The frame holds no app logic: a pressed action is sent to the host as an
// intent with the fields it binds, and the host answers with the next frame.
//
// A content kind this cannot draw is named on the screen, never skipped.
import { useState } from "react";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import { Label } from "@/ui/label";
import { NativeSelect, NativeSelectOption } from "@/ui/native-select";
import { cn } from "@/lib/utils";

const HEADING = {
  h1: "font-display text-4xl font-semibold tracking-tight text-balance",
  h2: "font-display text-2xl font-semibold tracking-tight",
  h3: "text-xl font-semibold tracking-tight",
  h4: "text-lg font-semibold",
  h5: "font-semibold",
  h6: "font-medium text-muted-foreground",
};
const AREA = "border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 min-h-24 w-full rounded-md border bg-transparent px-3 py-2 text-base shadow-xs outline-none focus-visible:ring-[3px] disabled:opacity-50 md:text-sm";

// A field shows what the person typed for as long as the model keeps its value and draft epoch; when
// either moves, the field shows the model's value again. That is how a name box empties after Add.
const modelValue = (n) => (n.control === "select" ? n.selected : n.value);
const modelKey = (n) => n.epoch + ":" + modelValue(n);

export function Presentation({ frame, interactive, onIntent }) {
  const [drafts, setDrafts] = useState({});
  const nodes = frame.nodes;
  const valueOf = (n, id) => (drafts[id] && drafts[id].key === modelKey(n) ? drafts[id].value : modelValue(n));
  const type = (n, id, value) => setDrafts((d) => ({ ...d, [id]: { key: modelKey(n), value } }));
  const press = (n) => {
    if (!interactive || n.disabled) return;
    onIntent({ revision: frame.revision, action: n.action, fields: n.binds.map((id) => { const f = nodes[id - 1], v = valueOf(f, id); return f.control === "select" ? { node: id, choice: Number(v) } : { node: id, text: String(v) }; }) });
  };
  const inside = (parent) => nodes.map((n, i) => [n, i + 1]).filter(([n]) => n.parent === parent);
  const draw = ([n, id]) => {
    const field = "p-" + id;
    switch (n.kind) {
      case "Section": return <section key={id} aria-label={n.aria} className="flex flex-col gap-4">{inside(id).map(draw)}</section>;
      case "Navigation": return <nav key={id} aria-label={n.aria} className="flex flex-wrap gap-2">{inside(id).map(draw)}</nav>;
      case "Form": return (
        <form key={id} aria-label={n.aria} className="grid gap-4" onSubmit={(e) => { e.preventDefault(); const main = inside(id).find(([c]) => c.kind === "Action" && c.type === "submit"); if (main) press(main[0]); }}>
          {inside(id).map(draw)}
        </form>
      );
      case "Heading": { const H = n.tag; return <H key={id} className={HEADING[n.tag]}>{n.text}</H>; }
      case "Text": return <p key={id} className="min-h-7 leading-7 text-muted-foreground">{n.text}</p>;
      case "Input": return (
        <div key={id} className="grid gap-2">
          <Label htmlFor={field}>{n.label}</Label>
          <Input id={field} type="text" value={valueOf(n, id)} maxLength={n.maximum} required={n.required} disabled={n.disabled} onChange={(e) => type(n, id, e.target.value)} />
        </div>
      );
      case "Multiline": return (
        <div key={id} className="grid gap-2">
          <Label htmlFor={field}>{n.label}</Label>
          <textarea id={field} className={AREA} value={valueOf(n, id)} maxLength={n.maximum} required={n.required} disabled={n.disabled} onChange={(e) => type(n, id, e.target.value)} />
        </div>
      );
      case "Select": case "TextSelect": return (
        <div key={id} className="grid gap-2">
          <Label htmlFor={field}>{n.label}</Label>
          <NativeSelect id={field} className="w-full" value={valueOf(n, id)} required={n.required} disabled={n.disabled} onChange={(e) => type(n, id, e.target.value)}>
            <NativeSelectOption value="0"></NativeSelectOption>
            {n.options.map(([value, words]) => <NativeSelectOption key={value} value={value}>{words}</NativeSelectOption>)}
          </NativeSelect>
        </div>
      );
      case "Action": return (
        <Button key={id} type={n.type} data-action={n.action} variant={n.type === "submit" ? "default" : "outline"} disabled={n.disabled || !interactive}
          className={cn(n.type === "submit" && "bg-brand text-brand-foreground hover:bg-brand/90")} onClick={n.type === "submit" ? undefined : () => press(n)}>{n.text}</Button>
      );
      case "Table": return (
        <div key={id} className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <caption className="caption-top px-4 py-2 text-left text-muted-foreground">{n.caption}</caption>
            <thead><tr>{n.columns.map((c, i) => <th key={i} scope="col" className="border-t px-4 py-2 text-left font-medium">{c}</th>)}</tr></thead>
            <tbody>{n.rows.map((row, r) => <tr key={r} className="animate-in fade-in-0 border-t duration-200">{row.map((cell, c) => <td key={c} className="px-4 py-2">{cell}</td>)}</tr>)}</tbody>
          </table>
        </div>
      );
      default: return <p key={id} className="text-sm text-destructive">This preview cannot draw “{n.kind}” yet.</p>;
    }
  };
  return <div className="flex flex-col gap-4 animate-in fade-in-0 duration-300" aria-live={["off", "polite", "assertive"][frame.live] || "off"}>{inside(0).map(draw)}</div>;
}
