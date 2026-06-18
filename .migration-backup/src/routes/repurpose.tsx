import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, Package, Sparkles, Trash2 } from "lucide-react";
import { generateContentPackage } from "@/lib/repurpose.functions";
import {
  createPackage,
  deletePackage,
  fetchPackages,
  upsertAssets,
} from "@/lib/content-packages";
import { loadProfile } from "@/lib/business-data";
import { toast } from "sonner";

export const Route = createFileRoute("/repurpose")({
  head: () => ({
    meta: [
      { title: "Content Repurposing Engine · AI Edge Solutions" },
      { name: "description", content: "Turn one topic into 10 channel-ready assets in seconds." },
    ],
  }),
  component: RepurposePage,
});

function RepurposePage() {
  const profile = loadProfile();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const generate = useServerFn(generateContentPackage);

  const [form, setForm] = useState({
    businessName: profile.businessName,
    service: profile.mainServices.split(",")[0]?.trim() || "",
    city: profile.city,
    state: profile.state,
    keyword: "",
  });
  const [busy, setBusy] = useState(false);

  const { data: packages = [] } = useQuery({
    queryKey: ["content_packages"],
    queryFn: fetchPackages,
  });

  const del = useMutation({
    mutationFn: (id: string) => deletePackage(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["content_packages"] }),
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.keyword.trim()) return;
    setBusy(true);
    try {
      const result = await generate({ data: form });
      const pkg = await createPackage({
        ...form,
        title: form.keyword,
      });
      await upsertAssets(pkg.id, result.assets as any);
      qc.invalidateQueries({ queryKey: ["content_packages"] });
      toast.success("Content package generated");
      navigate({ to: "/repurpose/$id", params: { id: pkg.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-8">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
            <Sparkles className="h-3.5 w-3.5" /> Content Repurposing Engine
          </div>
          <h1 className="mt-3 text-3xl font-bold sm:text-4xl">One topic → 10 channels</h1>
          <p className="mt-2 text-muted-foreground">
            Enter the business, service, city, and keyword. We generate an SEO article, social posts,
            email, video scripts, and an image prompt — all in one content package.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>New content package</CardTitle>
            <CardDescription>All 10 assets are generated together as drafts.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
              <Field label="Business">
                <Input value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} required />
              </Field>
              <Field label="Service">
                <Input value={form.service} onChange={(e) => setForm({ ...form, service: e.target.value })} required />
              </Field>
              <Field label="City">
                <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} required />
              </Field>
              <Field label="State">
                <Input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
              </Field>
              <Field label="Keyword / topic" className="sm:col-span-2">
                <Input
                  value={form.keyword}
                  onChange={(e) => setForm({ ...form, keyword: e.target.value })}
                  placeholder="e.g. bed bug heat treatment cost"
                  required
                />
              </Field>
              <div className="sm:col-span-2">
                <Button type="submit" disabled={busy} className="w-full sm:w-auto">
                  {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating 10 assets…</> : <>Generate Content Package</>}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <div>
          <h2 className="mb-3 text-lg font-semibold">Your packages</h2>
          {packages.length === 0 ? (
            <p className="text-sm text-muted-foreground">No packages yet. Generate one above.</p>
          ) : (
            <div className="grid gap-3">
              {packages.map((p) => (
                <Card key={p.id}>
                  <CardContent className="flex items-center justify-between p-4">
                    <Link to="/repurpose/$id" params={{ id: p.id }} className="flex items-center gap-3 hover:opacity-80">
                      <Package className="h-5 w-5 text-primary" />
                      <div>
                        <div className="font-medium">{p.title || p.keyword}</div>
                        <div className="text-xs text-muted-foreground">
                          {p.service} · {p.city}{p.state ? `, ${p.state}` : ""} · {new Date(p.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                    </Link>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        if (confirm("Delete this package and all its assets?")) del.mutate(p.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
