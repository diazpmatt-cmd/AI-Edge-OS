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

// ── OAuth popup close page (public — no auth, used by popup OAuth flows) ────
const OAuthClosePage  = lazy(() => import("./pages/OAuthClosePage"));

// ── Public marketing pages ──────────────────────────────────────────────────
const HomePage        = lazy(() => import("./pages/marketing/HomePage"));
const ServicesPage    = lazy(() => import("./pages/marketing/ServicesPage"));
const ProductsPage    = lazy(() => import("./pages/marketing/ProductsPage"));
const CaseStudiesPage = lazy(() => import("./pages/marketing/CaseStudiesPage"));
const PricingPage     = lazy(() => import("./pages/marketing/PricingPage"));
const ContactPage     = lazy(() => import("./pages/marketing/ContactPage"));
const PrivacyPage     = lazy(() => import("./pages/marketing/PrivacyPage"));
const TermsPage       = lazy(() => import("./pages/marketing/TermsPage"));

// ── Admin / Command Center pages (auth-gated) ───────────────────────────────
const AdminAccessPage     = lazy(() => import("./pages/AdminAccessPage"));
const AdminLoginPage      = lazy(() => import("./pages/AdminLoginPage"));
const DashboardPage       = lazy(() => import("./pages/DashboardPage"));
const ArticlePage         = lazy(() => import("./pages/ArticlePage"));
const PublishingPage      = lazy(() => import("./pages/PublishingPage"));
const RepurposePage       = lazy(() => import("./pages/RepurposePage"));
const RepurposeDetailPage = lazy(() => import("./pages/RepurposeDetailPage"));
const DistributionPage    = lazy(() => import("./pages/DistributionPage"));
const ConnectionsPage     = lazy(() => import("./pages/ConnectionsPage"));
const LeadRecoveryPage        = lazy(() => import("./pages/LeadRecoveryPage"));
const SocialPublishingPage    = lazy(() => import("./pages/SocialPublishingPage"));
const AutoContentEnginePage      = lazy(() => import("./pages/AutoContentEnginePage"));
const ImageAssetManagerPage      = lazy(() => import("./pages/ImageAssetManagerPage"));
const SystemDiagnosticsPage      = lazy(() => import("./pages/SystemDiagnosticsPage"));

const PageLoader = () => (
  <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", background: "#030612" }}>
    <Loader2 style={{ width: 24, height: 24, color: "#00AEEF", animation: "spin 1s linear infinite" }} />
  </div>
);

function Authenticated({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Show when="signed-in"><Suspense fallback={<PageLoader />}>{children}</Suspense></Show>
      <Show when="signed-out"><Redirect to="/admin/login" /></Show>
    </>
  );
}

function SignInPage() {
  return (
    <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", background: "#030612", padding: 16 }}>
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} fallbackRedirectUrl={`${basePath}/admin/dashboard`} />
    </div>
  );
}
function SignUpPage() {
  return (
    <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", background: "#030612", padding: 16 }}>
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/admin/login`} fallbackRedirectUrl={`${basePath}/admin/dashboard`} />
    </div>
  );
}

function AppRouter() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        {/* ── Clerk auth routes (keep for OAuth callbacks) ── */}
        <Route path="/sign-in/*?" component={SignInPage} />
        <Route path="/sign-up/*?" component={SignUpPage} />
        <Route path="/oauth-close" component={() => <Suspense fallback={<PageLoader />}><OAuthClosePage /></Suspense>} />

        {/* ── Admin access gate (passcode) + login ── */}
        <Route path="/admin-access" component={() => <Suspense fallback={<PageLoader />}><AdminAccessPage /></Suspense>} />
        <Route path="/admin/login/*?" component={() => <Suspense fallback={<PageLoader />}><AdminLoginPage /></Suspense>} />

        {/* ── Protected admin / Command Center routes ── */}
        <Route path="/admin/dashboard">
          <Authenticated><DashboardPage /></Authenticated>
        </Route>
        <Route path="/admin/article/:id">
          <Authenticated><ArticlePage /></Authenticated>
        </Route>
        <Route path="/admin/publishing">
          <Authenticated><PublishingPage /></Authenticated>
        </Route>
        <Route path="/admin/repurpose/:id">
          <Authenticated><RepurposeDetailPage /></Authenticated>
        </Route>
        <Route path="/admin/repurpose">
          <Authenticated><RepurposePage /></Authenticated>
        </Route>
        <Route path="/admin/distribution">
          <Authenticated><DistributionPage /></Authenticated>
        </Route>
        <Route path="/admin/connections">
          <Authenticated><ConnectionsPage /></Authenticated>
        </Route>
        <Route path="/admin/lead-recovery">
          <Authenticated><LeadRecoveryPage /></Authenticated>
        </Route>
        <Route path="/admin/social-publishing">
          <Authenticated><SocialPublishingPage /></Authenticated>
        </Route>
        <Route path="/admin/auto-content">
          <Authenticated><AutoContentEnginePage /></Authenticated>
        </Route>
        <Route path="/admin/image-assets">
          <Authenticated><ImageAssetManagerPage /></Authenticated>
        </Route>
        <Route path="/admin/diagnostics">
          <Authenticated><SystemDiagnosticsPage /></Authenticated>
        </Route>

        {/* /admin root → redirect to dashboard */}
        <Route path="/admin">
          <Authenticated><Redirect to="/admin/dashboard" /></Authenticated>
        </Route>

        {/* ── Public marketing pages ── */}
        <Route path="/services"     component={ServicesPage} />
        <Route path="/products"     component={ProductsPage} />
        <Route path="/case-studies" component={CaseStudiesPage} />
        <Route path="/pricing"      component={PricingPage} />
        <Route path="/contact"      component={ContactPage} />
        <Route path="/privacy"        component={PrivacyPage} />
        <Route path="/privacy-policy" component={PrivacyPage} />
        <Route path="/terms"          component={TermsPage} />
        <Route path="/terms-of-service" component={TermsPage} />
        <Route path="/"             component={HomePage} />
      </Switch>
    </Suspense>
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
