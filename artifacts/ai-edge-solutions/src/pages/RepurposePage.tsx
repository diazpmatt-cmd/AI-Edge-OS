import { Link } from "wouter";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, Package, Sparkles, Trash2 } from "lucide-react";
import { generateContentPackage } from "@/lib/repurpose.functions";
import { createPackage, deletePackage, fetchPackages } from "@/lib/content-packages";
import { loadProfile } from "@/lib/business-data";
import { toast } from "sonner";

export default function RepurposePage() {
  const profile = loadProfile();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    businessName: profile.businessName,
    service: profile.mainServices.split(",")[0]?.trim() || "",
    city: profile.city,
    state: profile.state,
    keyword: "",
  });
  const [busy, setBusy] = useState(false);

  const { data: packages = [] } = useQuery({ queryKey: ["content_packages"], queryFn: fetchPackages });
  const del = useMutation({ mutationFn: (id: string) => deletePackage(id), onSuccess: () => qc.invalidateQueries({ queryKey: ["content_packages"] }) });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.keyword.trim()) return;
    setBusy(true);
    try {
      const { assets } = await generateContentPackage({
        businessName: form.businessName, service: form.service,
        city: form.city, state: form.state, keyword: form.keyword,
      });
      await createPackage({ ...form, assets });
      qc.invalidateQueries({ queryKey: ["content_packages"] });
      toast.success(`Created content package with ${assets.length} assets`);
      setForm((f) => ({ ...f, keyword: "" }));
    } catch (err) { toast.error(err instanceof Error ? err.message : "Failed"); }
    finally { setBusy(false); }
  };

  return (
    <AppShell>
      <div className="mb-6">
        <div className="text-xs font-semibold uppercase tracking-wide text-primary">AI Tools</div>
        <h1 className="mt-1 text-2xl font-bold text-foreground sm:text-3xl">Content Repurposing Engine</h1>
        <p className="mt-1 text-sm text-muted-foreground">Turn one topic into 10 channel-ready assets in seconds.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg"><Sparkles className="h-5 w-5 text-primary" /> Generate Package</CardTitle>
            <CardDescription>Enter a keyword or topic to create multi-channel content.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-3">
              {([
                { k: "businessName", label: "Business Name" },
                { k: "service", label: "Service / Topic" },
                { k: "city", label: "City" },
                { k: "state", label: "State" },
              ] as const).map(({ k, label }) => (
                <div key={k} className="space-y-1.5">
                  <Label htmlFor={k}>{label}</Label>
                  <Input id={k} value={form[k]} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} required />
                </div>
              ))}
              <div className="space-y-1.5">
                <Label htmlFor="keyword">Target Keyword <span className="text-destructive">*</span></Label>
                <Input id="keyword" value={form.keyword} onChange={(e) => setForm((f) => ({ ...f, keyword: e.target.value }))} placeholder="bed bug exterminator foley al" required />
              </div>
              <Button type="submit" className="w-full" disabled={busy || !form.keyword.trim()}>
                {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating…</> : <><Sparkles className="mr-2 h-4 w-4" /> Generate Package</>}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="lg:col-span-2 space-y-4">
          {packages.length === 0
            ? <Card><CardContent className="grid place-items-center gap-2 py-16 text-center">
                <Package className="h-8 w-8 text-primary/40" />
                <p className="font-display text-sm font-semibold">No packages yet</p>
                <p className="text-xs text-muted-foreground">Generate your first content package using the form.</p>
              </CardContent></Card>
            : packages.map((pkg) => (
                <Card key={pkg.id}>
                  <CardHeader className="flex flex-row items-start justify-between space-y-0">
                    <div>
                      <CardTitle className="text-base">{pkg.keyword}</CardTitle>
                      <CardDescription>{pkg.service} · {pkg.city}, {pkg.state}</CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Button asChild size="sm" variant="outline"><Link to={`/repurpose/${pkg.id}`}>View</Link></Button>
                      <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => del.mutate(pkg.id)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {pkg.assets.slice(0, 5).map((a) => (
                        <span key={a.channel} className="rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[10px] text-muted-foreground">{a.label}</span>
                      ))}
                      {pkg.assets.length > 5 && <span className="text-xs text-muted-foreground">+{pkg.assets.length - 5} more</span>}
                    </div>
                  </CardContent>
                </Card>
              ))
          }
        </div>
      </div>
    </AppShell>
  );
}
