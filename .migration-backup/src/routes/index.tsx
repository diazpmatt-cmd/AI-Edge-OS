import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Sparkles } from "lucide-react";
import { loadProfile, saveProfile, type BusinessProfile } from "@/lib/business-data";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Business Profile · AI Edge Solutions" },
      { name: "description", content: "Set up your local business profile to activate SEO autopilot." },
    ],
  }),
  component: OnboardingPage,
});

function OnboardingPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState<BusinessProfile>(() => loadProfile());

  const set = <K extends keyof BusinessProfile>(k: K, v: BusinessProfile[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    saveProfile(form);
    navigate({ to: "/dashboard" });
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl">
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            Step 1 of 1 · Onboarding
          </div>
          <h1 className="mt-3 text-3xl font-bold text-foreground sm:text-4xl">
            Tell us about your business
          </h1>
          <p className="mt-2 text-muted-foreground">
            We'll generate keyword ideas, a 30-day content calendar, and competitor insights tailored to your local market.
          </p>
        </div>

        <Card className="border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl">Business Profile</CardTitle>
            <CardDescription>Pre-filled with demo data for Bed Bugs and Beyond.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="grid gap-5 sm:grid-cols-2">
              <Field label="Business Name" className="sm:col-span-2">
                <Input value={form.businessName} onChange={(e) => set("businessName", e.target.value)} required />
              </Field>
              <Field label="Website URL" className="sm:col-span-2">
                <Input type="url" value={form.websiteUrl} onChange={(e) => set("websiteUrl", e.target.value)} required />
              </Field>
              <Field label="Industry">
                <Input value={form.industry} onChange={(e) => set("industry", e.target.value)} required />
              </Field>
              <Field label="City">
                <Input value={form.city} onChange={(e) => set("city", e.target.value)} required />
              </Field>
              <Field label="State">
                <Input value={form.state} onChange={(e) => set("state", e.target.value)} required />
              </Field>
              <Field label="Main Services" className="sm:col-span-2">
                <Textarea rows={3} value={form.mainServices} onChange={(e) => set("mainServices", e.target.value)} required />
              </Field>
              <Field label="Target Customers" className="sm:col-span-2">
                <Textarea rows={3} value={form.targetCustomers} onChange={(e) => set("targetCustomers", e.target.value)} required />
              </Field>

              <div className="sm:col-span-2 flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={() => navigate({ to: "/dashboard" })}>
                  Skip for now
                </Button>
                <Button type="submit" className="bg-primary text-primary-foreground hover:bg-primary/90">
                  <Sparkles className="mr-2 h-4 w-4" />
                  Generate SEO Autopilot
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
