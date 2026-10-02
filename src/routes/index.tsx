import { createFileRoute, Link } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState } from "react";
import { ArrowRight, CheckCircle2, KeyRound, Menu, MessageSquareText, Radio, ShieldCheck, X } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeToggle } from "@/components/theme-toggle";
import { supabase } from "@/integrations/supabase/client";

const HomeSections = lazy(() => import("@/components/home-sections").then((m) => ({ default: m.HomeSections })));

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Unified AI Workspace — Your AI models. One secure workspace." },
      { name: "description", content: "Connect your own AI providers, discover real models, and run secure streaming chats from one focused workspace." },
      { property: "og:title", content: "Unified AI Workspace — Your AI models. One secure workspace." },
      { property: "og:description", content: "Connect your own AI providers, discover real models, and run secure streaming chats from one focused workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HomePage,
});

const providers = ["OpenAI", "Anthropic", "Google Gemini", "OpenRouter", "OpenAI-compatible"];

function HomePage() {
  const [signedIn, setSignedIn] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSignedIn(Boolean(data.session)));
  }, []);
  const destination = signedIn ? "/chat" as const : "/signup" as const;
  const closeMenu = () => setMenuOpen(false);

  return (
    <main className="landing-page">
      <header className="landing-nav-wrap">
        <div className="landing-nav">
          <Link to="/" aria-label="Unified AI Workspace home"><BrandLogo /></Link>
          <nav className="landing-nav-links" aria-label="Primary navigation">
            <a href="#features">Features</a><a href="#how-it-works">How it works</a><a href="#security">Security</a>
          </nav>
          <div className="landing-nav-actions">
            <ThemeToggle />
            {!signedIn && <Button variant="ghost" asChild><Link to="/login">Sign in</Link></Button>}
            <Button asChild><Link to={destination}>{signedIn ? "Open workspace" : "Get started"}</Link></Button>
          </div>
          <Button className="landing-menu-button" variant="ghost" size="icon" onClick={() => setMenuOpen((v) => !v)} aria-label={menuOpen ? "Close navigation" : "Open navigation"} aria-expanded={menuOpen}>
            {menuOpen ? <X /> : <Menu />}
          </Button>
        </div>
        {menuOpen && (
          <nav className="landing-mobile-nav" aria-label="Mobile navigation">
            <a href="#features" onClick={closeMenu}>Features</a><a href="#how-it-works" onClick={closeMenu}>How it works</a><a href="#security" onClick={closeMenu}>Security</a>
            {!signedIn && <Link to="/login" onClick={closeMenu}>Sign in</Link>}
            <Link to={destination} onClick={closeMenu}>{signedIn ? "Open workspace" : "Get started"}</Link>
          </nav>
        )}
      </header>

      <section className="landing-hero">
        <div className="landing-hero-copy">
          <div className="landing-eyebrow"><span />Secure multi-provider AI workspace</div>
          <h1>Your AI models.<br /><em>One secure workspace.</em></h1>
          <p>Bring your own provider keys, discover available models, and stream conversations through one focused interface.</p>
          <div className="landing-hero-actions">
            <Button size="lg" asChild><Link to={destination}>{signedIn ? "Open workspace" : "Get started"}<ArrowRight /></Link></Button>
            {!signedIn && <Button size="lg" variant="outline" asChild><Link to="/login">Sign in</Link></Button>}
          </div>
          <div className="landing-trust"><ShieldCheck /><span>Encrypted keys</span><CheckCircle2 /><span>Row-level access</span><Radio /><span>Live streaming</span></div>
        </div>

        <div className="landing-product" aria-label="Unified AI Workspace interface preview">
          <aside>
            <BrandLogo compact />
            <div className="landing-preview-new"><span>+</span> New chat</div>
            <div className="landing-preview-search">Search conversations</div>
            <div className="landing-preview-label">Today</div>
            <div className="landing-preview-row active"><MessageSquareText />Provider architecture</div>
            <div className="landing-preview-row"><MessageSquareText />Model selection flow</div>
            <div className="landing-preview-foot"><KeyRound /> Connections</div>
          </aside>
          <div className="landing-product-main">
            <header><span className="landing-status"><i />Secure stream</span><span className="landing-model">Choose model</span></header>
            <div className="landing-product-empty">
              <div className="landing-product-mark"><BrandLogo compact /></div>
              <h2>One calm place for every model.</h2>
              <p>Connect a provider, fetch its real models, and start a private conversation.</p>
            </div>
            <div className="landing-product-composer"><span>Message your selected model…</span><b><ArrowRight /></b></div>
          </div>
        </div>
      </section>

      <section className="landing-providers" aria-label="Supported providers">
        <span>Works with</span>{providers.map((provider) => <strong key={provider}>{provider}</strong>)}
      </section>

      <Suspense fallback={<div className="landing-section"><div className="landing-inner space-y-4"><Skeleton className="h-8 w-56" /><Skeleton className="h-64 w-full" /></div></div>}>
        <HomeSections destination={destination} />
      </Suspense>
    </main>
  );
}