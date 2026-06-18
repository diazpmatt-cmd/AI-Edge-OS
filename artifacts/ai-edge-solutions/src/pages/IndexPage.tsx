import { useState } from "react";
import { useLocation } from "wouter";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Sparkles } from "lucide-react";
import { loadProfile, saveProfile, type BusinessProfile } from "@/lib/business-data";

export default function IndexPage() {
  const [, navigate] = useLocation();
  const [form, setForm] = useState<BusinessProfile>(() => loadProfile());

  const set = <K extends keyof BusinessProfile>(k: K, v: BusinessProfile[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    saveProfile(form);
    navigate("/dashboard");
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl">
        <div className="mb-6">
          <div className="text-xs font-semibold uppercase tracking-wide text-primary">Setup</div>
          <h1 className="mt-1 text-2xl font-bold text-foreground sm:text-3xl">Business Profile</h1>
          <p className="mt-1 text-sm text-muted-foreground">Tell us about your business so we can generate targeted SEO content.</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" /> Your Business</CardTitle>
            <CardDescription>This information drives all keyword research and content generation.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              {([
                { k: "businessName", label: "Business Name", placeholder: "Bed Bugs and Beyond", type: "input" },
                { k: "websiteUrl", label: "Website URL", placeholder: "https://yourbusiness.com", type: "input" },
                { k: "industry", label: "Industry", placeholder: "Pest Control", type: "input" },
                { k: "city", label: "City", placeholder: "Foley", type: "input" },
                { k: "state", label: "State", placeholder: "Alabama", type: "input" },
              ] as Array<{ k: keyof BusinessProfile; label: string; placeholder: string; type: string }>).map(({ k, label, placeholder }) => (
                <div key={k} className="space-y-1.5">
                  <Label htmlFor={k}>{label}</Label>
                  <Input id={k} value={form[k]} onChange={(e) => set(k, e.target.value)} placeholder={placeholder} required />
                </div>
              ))}
              <div className="space-y-1.5">
                <Label htmlFor="mainServices">Main Services</Label>
                <Textarea id="mainServices" value={form.mainServices} onChange={(e) => set("mainServices", e.target.value)}
                  placeholder="Bed bug extermination, mosquito treatment, rodent removal..." required rows={3} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="targetCustomers">Target Customers</Label>
                <Textarea id="targetCustomers" value={form.targetCustomers} onChange={(e) => set("targetCustomers", e.target.value)}
                  placeholder="Homeowners, landlords, hotels, restaurants..." rows={2} />
              </div>
              <Button type="submit" className="w-full">Save & Go to Dashboard</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
