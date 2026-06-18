import { Link, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Copy, Check } from "lucide-react";
import { fetchPackages } from "@/lib/content-packages";
import { useState } from "react";

export default function RepurposeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: packages = [] } = useQuery({ queryKey: ["content_packages"], queryFn: fetchPackages });
  const pkg = packages.find((p) => p.id === id);
  const [copied, setCopied] = useState<string | null>(null);

  const copyText = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  if (!pkg) return <AppShell><div className="py-20 text-center"><p className="text-muted-foreground">Package not found.</p><Button asChild className="mt-4" variant="outline"><Link to="/repurpose">← Back</Link></Button></div></AppShell>;

  return (
    <AppShell>
      <div className="mb-6">
        <Button asChild variant="ghost" size="sm"><Link to="/repurpose"><ArrowLeft className="mr-1.5 h-4 w-4" /> Back to Repurpose</Link></Button>
      </div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">{pkg.keyword}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{pkg.service} · {pkg.city}, {pkg.state}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {pkg.assets.map((a) => (
          <Card key={a.channel}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm">{a.label}</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => copyText(a.channel, a.body)}>
                {copied === a.channel ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
            </CardHeader>
            <CardContent><pre className="whitespace-pre-wrap text-xs text-foreground max-h-48 overflow-y-auto">{a.body}</pre></CardContent>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}
