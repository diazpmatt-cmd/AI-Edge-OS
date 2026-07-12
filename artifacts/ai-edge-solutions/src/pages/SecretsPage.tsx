import { useMemo, useState } from "react";
import { Copy, Eye, EyeOff, KeyRound, MoreHorizontal, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useTheme } from "@/contexts/theme-context";

type PrototypeSecret = { id: string; name: string; value: string };

function makePrototypeValue() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return `prototype_${Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("")}`;
}

function makeInitialSecrets(): PrototypeSecret[] {
  return ["OPENAI_API_KEY", "GOOGLE_OAUTH_CLIENT_ID", "TELNYX_API_KEY"].map((name, index) => ({ id: `mock-${index}`, name, value: makePrototypeValue() }));
}

export function SecretsPrototypeContent() {
  const { colors: t, isDark } = useTheme();
  const [secrets, setSecrets] = useState<PrototypeSecret[]>(makeInitialSecrets);
  const [filter, setFilter] = useState("");
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<PrototypeSecret | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PrototypeSecret | null>(null);
  const [name, setName] = useState("");
  const [value, setValue] = useState("");

  const filteredSecrets = useMemo(() => {
    const query = filter.trim().toLowerCase();
    return query ? secrets.filter(secret => secret.name.toLowerCase().includes(query)) : secrets;
  }, [filter, secrets]);

  const openCreate = () => { setEditing(null); setName(""); setValue(""); setEditorOpen(true); };
  const openEdit = (secret: PrototypeSecret) => { setEditing(secret); setName(secret.name); setValue(secret.value); setEditorOpen(true); };

  const saveSecret = () => {
    const cleanName = name.trim();
    if (!cleanName || !value) return;
    if (editing) {
      setSecrets(current => current.map(secret => secret.id === editing.id ? { ...secret, name: cleanName, value } : secret));
      toast.success("Prototype secret updated");
    } else {
      setSecrets(current => [...current, { id: crypto.randomUUID(), name: cleanName, value }]);
      toast.success("Prototype secret added");
    }
    setEditorOpen(false);
  };

  const deleteSecret = () => {
    if (!pendingDelete) return;
    setSecrets(current => current.filter(secret => secret.id !== pendingDelete.id));
    setRevealed(current => { const next = new Set(current); next.delete(pendingDelete.id); return next; });
    setPendingDelete(null);
    toast.success("Prototype secret deleted");
  };

  const copyText = async (text: string, label: string) => {
    try { await navigator.clipboard.writeText(text); toast.success(`${label} copied`); }
    catch { toast.error(`Unable to copy ${label.toLowerCase()}`); }
  };

  return <>
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 20, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, display: "grid", placeItems: "center", background: "rgba(0,174,239,0.12)", border: "1px solid rgba(0,174,239,0.3)" }}><KeyRound style={{ width: 21, height: 21, color: "#00AEEF" }} /></div>
          <div><h1 style={{ margin: 0, color: t.text, fontSize: "clamp(28px, 4vw, 38px)", lineHeight: 1.1, fontWeight: 800 }}>Secrets</h1><p style={{ margin: "7px 0 0", color: t.text2, fontSize: 14 }}>Manage environment variables for your AI Edge workspace.</p></div>
        </div>
        <Button onClick={openCreate} style={{ background: "#00AEEF", color: "white", boxShadow: "0 8px 24px rgba(0,174,239,0.2)" }}><Plus className="h-4 w-4" /> New Secret</Button>
      </header>

      <div role="note" style={{ borderRadius: 12, padding: "12px 16px", display: "flex", gap: 10, alignItems: "flex-start", background: isDark ? "rgba(245,158,11,0.08)" : "#FFFBEB", border: "1px solid rgba(245,158,11,0.28)", color: isDark ? "#FCD34D" : "#92400E", fontSize: 13, lineHeight: 1.5 }}><span aria-hidden="true">⚠</span><span><strong>UI prototype:</strong> These are randomly generated mock values held in memory only. Refreshing the page resets everything. No credentials are connected or persisted.</span></div>

      <section style={{ background: t.card, border: `1px solid ${t.borderStrong}`, borderRadius: 16, boxShadow: t.shadow, overflow: "hidden" }}>
        <div style={{ padding: 16, borderBottom: `1px solid ${t.border}`, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ position: "relative", width: "min(100%, 430px)" }}><Search aria-hidden="true" style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", width: 17, height: 17, color: t.text3 }} /><Input aria-label="Filter secrets by name" placeholder="Filter secrets by name" value={filter} onChange={event => setFilter(event.target.value)} style={{ paddingLeft: 40, background: t.inputBg, borderColor: t.inputBorder, color: t.text }} /></div>
          <span style={{ marginLeft: "auto", color: t.text3, fontSize: 12, whiteSpace: "nowrap" }}>{filteredSecrets.length} secret{filteredSecrets.length === 1 ? "" : "s"}</span>
        </div>
        <Table>
          <TableHeader style={{ background: t.tableHead }}><TableRow style={{ borderColor: t.border }}><TableHead style={{ paddingLeft: 20, color: t.text2 }}>Name</TableHead><TableHead style={{ color: t.text2 }}>Value</TableHead><TableHead className="w-[140px]"><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader>
          <TableBody>{filteredSecrets.map(secret => {
            const isRevealed = revealed.has(secret.id);
            return <TableRow key={secret.id} style={{ borderColor: t.border }}>
              <TableCell style={{ padding: "18px 12px 18px 20px", minWidth: 220 }}><div style={{ display: "flex", alignItems: "center", gap: 8 }}><code style={{ color: t.text, fontWeight: 700, fontSize: 13 }}>{secret.name}</code><Button aria-label={`Copy name ${secret.name}`} title="Copy name" variant="ghost" size="icon" className="h-8 w-8" onClick={() => copyText(secret.name, "Name")}><Copy className="h-3.5 w-3.5" /></Button></div></TableCell>
              <TableCell style={{ minWidth: 260 }}><div style={{ display: "flex", alignItems: "center", gap: 8 }}><code aria-label={`Value for ${secret.name}`} style={{ color: isRevealed ? t.text : t.text2, letterSpacing: isRevealed ? 0 : 2, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 360 }}>{isRevealed ? secret.value : "••••••••••••••••••••"}</code><Button aria-label={`${isRevealed ? "Hide" : "Reveal"} value for ${secret.name}`} title={isRevealed ? "Hide value" : "Reveal value"} variant="ghost" size="icon" className="h-8 w-8" onClick={() => setRevealed(current => { const next = new Set(current); isRevealed ? next.delete(secret.id) : next.add(secret.id); return next; })}>{isRevealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</Button><Button aria-label={`Copy value for ${secret.name}`} title="Copy value" variant="ghost" size="icon" className="h-8 w-8" onClick={() => copyText(secret.value, "Value")}><Copy className="h-3.5 w-3.5" /></Button></div></TableCell>
              <TableCell style={{ textAlign: "right", paddingRight: 16 }}><DropdownMenu><DropdownMenuTrigger asChild><Button aria-label={`Actions for ${secret.name}`} variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => openEdit(secret)}>Edit</DropdownMenuItem><DropdownMenuItem onSelect={() => setPendingDelete(secret)} className="text-red-500 focus:text-red-500">Delete</DropdownMenuItem></DropdownMenuContent></DropdownMenu></TableCell>
            </TableRow>;
          })}</TableBody>
        </Table>
        {filteredSecrets.length === 0 && <div style={{ padding: "48px 20px", textAlign: "center", color: t.text2 }}>No secrets match “{filter}”.</div>}
      </section>
    </div>

    <Dialog open={editorOpen} onOpenChange={setEditorOpen}><DialogContent style={{ background: t.panel, borderColor: t.borderStrong, color: t.text }}><DialogHeader><DialogTitle>{editing ? "Edit Secret" : "New Secret"}</DialogTitle><DialogDescription>{editing ? "Update this in-memory prototype value." : "Add a mock value to this in-memory prototype."}</DialogDescription></DialogHeader><div style={{ display: "grid", gap: 18, padding: "8px 0" }}><div style={{ display: "grid", gap: 7 }}><Label htmlFor="secret-name">Name</Label><Input id="secret-name" value={name} onChange={event => setName(event.target.value)} placeholder="EXAMPLE_API_KEY" autoComplete="off" /></div><div style={{ display: "grid", gap: 7 }}><Label htmlFor="secret-value">Value</Label><Input id="secret-value" value={value} onChange={event => setValue(event.target.value)} placeholder="Enter a mock value" type="password" autoComplete="new-password" /></div></div><DialogFooter><Button variant="outline" onClick={() => setEditorOpen(false)}>Cancel</Button><Button onClick={saveSecret} disabled={!name.trim() || !value} style={{ background: "#00AEEF", color: "white" }}>{editing ? "Save Changes" : "Add Secret"}</Button></DialogFooter></DialogContent></Dialog>

    <AlertDialog open={Boolean(pendingDelete)} onOpenChange={open => { if (!open) setPendingDelete(null); }}><AlertDialogContent style={{ background: t.panel, borderColor: t.borderStrong, color: t.text }}><AlertDialogHeader><AlertDialogTitle>Delete prototype secret?</AlertDialogTitle><AlertDialogDescription>This removes <strong>{pendingDelete?.name}</strong> from the in-memory mock list. This action cannot be undone.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={deleteSecret} className="bg-red-600 text-white hover:bg-red-700">Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </>;
}

export default function SecretsPage({ developmentPreview = false }: { developmentPreview?: boolean }) {
  return <AppShell>
    {developmentPreview && (
      <div role="status" style={{ marginBottom: 20, padding: "10px 16px", borderRadius: 10, textAlign: "center", background: "rgba(0,174,239,0.12)", border: "1px solid rgba(0,174,239,0.35)", color: "#38BDF8", fontSize: 13, fontWeight: 800, letterSpacing: "0.35px" }}>
        Development Preview — Mock Data Only
      </div>
    )}
    <SecretsPrototypeContent />
  </AppShell>;
}
