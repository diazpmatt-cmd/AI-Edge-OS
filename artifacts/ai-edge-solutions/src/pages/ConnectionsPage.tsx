import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Plug } from "lucide-react";

export default function ConnectionsPage() {
  return (
    <AppShell>
      <div className="mb-6">
        <div className="text-xs font-semibold uppercase tracking-wide text-primary">Integrations</div>
        <h1 className="mt-1 text-2xl font-bold text-foreground sm:text-3xl">Connected Accounts</h1>
        <p className="mt-1 text-sm text-muted-foreground">Connect your social media and publishing platforms.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg"><Plug className="h-5 w-5 text-primary" /> Platform Connections</CardTitle>
          <CardDescription>OAuth social connections will be available in a future update.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid place-items-center gap-3 rounded-xl border border-dashed border-border bg-muted/20 p-10 text-center">
            <div className="grid h-12 w-12 place-items-center rounded-full bg-primary/10">
              <Plug className="h-6 w-6 text-primary" />
            </div>
            <div className="font-display text-sm font-semibold text-foreground">Social connections coming soon</div>
            <p className="max-w-sm text-xs text-muted-foreground">
              Connect Google Business Profile, Facebook, Instagram, LinkedIn, and YouTube to publish your AI-generated content directly.
            </p>
          </div>
        </CardContent>
      </Card>
    </AppShell>
  );
}
