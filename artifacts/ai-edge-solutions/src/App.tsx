import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ClerkProvider, SignIn, SignUp, Show } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Loader2 } from "lucide-react";
import { lazy, Suspense } from "react";

const queryClient = new QueryClient();

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

const IndexPage = lazy(() => import("./pages/IndexPage"));
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const ArticlePage = lazy(() => import("./pages/ArticlePage"));
const PublishingPage = lazy(() => import("./pages/PublishingPage"));
const RepurposePage = lazy(() => import("./pages/RepurposePage"));
const RepurposeDetailPage = lazy(() => import("./pages/RepurposeDetailPage"));
const DistributionPage = lazy(() => import("./pages/DistributionPage"));
const ConnectionsPage = lazy(() => import("./pages/ConnectionsPage"));

const PageLoader = () => (
  <div className="flex min-h-screen items-center justify-center bg-background">
    <Loader2 className="h-6 w-6 animate-spin text-primary" />
  </div>
);

function Authenticated({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Show when="signed-in"><Suspense fallback={<PageLoader />}>{children}</Suspense></Show>
      <Show when="signed-out"><Redirect to="/sign-in" /></Show>
    </>
  );
}

function HomeRoute() {
  return (
    <>
      <Show when="signed-in"><Suspense fallback={<PageLoader />}><IndexPage /></Suspense></Show>
      <Show when="signed-out"><Redirect to="/sign-in" /></Show>
    </>
  );
}

function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} fallbackRedirectUrl={`${basePath}/dashboard`} />
    </div>
  );
}
function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} fallbackRedirectUrl={`${basePath}/dashboard`} />
    </div>
  );
}

function AppRouter() {
  return (
    <Switch>
      <Route path="/sign-in/*?" component={SignInPage} />
      <Route path="/sign-up/*?" component={SignUpPage} />
      <Route path="/dashboard">
        <Authenticated><DashboardPage /></Authenticated>
      </Route>
      <Route path="/article/:id">
        <Authenticated><ArticlePage /></Authenticated>
      </Route>
      <Route path="/publishing">
        <Authenticated><PublishingPage /></Authenticated>
      </Route>
      <Route path="/repurpose/:id">
        <Authenticated><RepurposeDetailPage /></Authenticated>
      </Route>
      <Route path="/repurpose">
        <Authenticated><RepurposePage /></Authenticated>
      </Route>
      <Route path="/distribution">
        <Authenticated><DistributionPage /></Authenticated>
      </Route>
      <Route path="/connections">
        <Authenticated><ConnectionsPage /></Authenticated>
      </Route>
      <Route path="/" component={HomeRoute} />
    </Switch>
  );
}

function App() {
  return (
    <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl}>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={basePath}>
            <AppRouter />
            <Toaster />
          </WouterRouter>
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

export default App;
