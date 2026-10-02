import { Link } from "@tanstack/react-router";
import { ArrowRight, Check, KeyRound, LockKeyhole, MessagesSquare, Radio, Search, ShieldCheck, UsersRound } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";

const features = [
  { icon: MessagesSquare, title: "Multi-provider workspace", text: "Use supported providers from one focused conversation interface." },
  { icon: KeyRound, title: "Bring your own keys", text: "Connect personal credentials without placing them in browser storage." },
  { icon: LockKeyhole, title: "Encrypted key storage", text: "Provider keys are encrypted before storage and unlocked only for protected requests." },
  { icon: Radio, title: "Streaming responses", text: "Read responses as they arrive, stop generation, and preserve partial output." },
  { icon: UsersRound, title: "Personal and shared access", text: "Keep providers personal or let administrators manage shared connections." },
  { icon: Search, title: "Real model discovery", text: "Fetch live model lists, choose enabled models, and save preferences per chat." },
];

export function HomeSections({ destination }: { destination: "/chat" | "/signup" }) {
  return (
    <>
      <section id="features" className="landing-section border-t border-border/70">
        <div className="landing-inner">
          <div className="landing-kicker">Capabilities</div>
          <div className="landing-heading-row">
            <h2>Everything needed for secure, focused AI work.</h2>
            <p>Built around the workflows already available today—without the noise of an overloaded platform.</p>
          </div>
          <div className="landing-feature-grid">
            {features.map(({ icon: Icon, title, text }) => (
              <article key={title} className="landing-feature">
                <div className="landing-feature-icon"><Icon /></div>
                <h3>{title}</h3><p>{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="landing-section landing-band">
        <div className="landing-inner">
          <div className="landing-kicker">How it works</div>
          <div className="landing-heading-row"><h2>From provider key to conversation in three steps.</h2></div>
          <ol className="landing-steps">
            {["Connect your AI provider", "Fetch and choose a model", "Start secure streaming chats"].map((step, index) => (
              <li key={step}><span>0{index + 1}</span><h3>{step}</h3><Check aria-hidden /></li>
            ))}
          </ol>
        </div>
      </section>

      <section id="security" className="landing-section border-y border-border/70">
        <div className="landing-inner landing-security">
          <div>
            <div className="landing-kicker">Security architecture</div>
            <h2>Your provider keys stay out of the browser.</h2>
            <p>Access is verified on protected server paths, while row-level rules isolate workspace data for each account.</p>
          </div>
          <ul>
            <li><ShieldCheck /><span><strong>Encrypted before storage</strong> with authenticated AES-256-GCM encryption.</span></li>
            <li><LockKeyhole /><span><strong>Decrypted only for provider requests</strong> inside protected server handlers.</span></li>
            <li><KeyRound /><span><strong>Never stored in browser storage</strong> or returned through client queries.</span></li>
            <li><UsersRound /><span><strong>Row-level access controls</strong> protect chats, messages, models, and connections.</span></li>
          </ul>
        </div>
      </section>

      <section className="landing-cta-section">
        <div className="landing-inner landing-cta-inner">
          <BrandLogo />
          <h2>Bring your models into one secure workspace.</h2>
          <Button size="lg" asChild><Link to={destination}>{destination === "/chat" ? "Open workspace" : "Get started"}<ArrowRight /></Link></Button>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="landing-inner landing-footer-grid">
          <div><BrandLogo /><p>Secure multi-provider AI chat with your own provider keys.</p></div>
          <nav aria-label="Footer navigation"><a href="#features">Features</a><a href="#how-it-works">How it works</a><a href="#security">Security</a></nav>
          <nav aria-label="Account links"><Link to="/login">Sign in</Link><Link to={destination}>{destination === "/chat" ? "Workspace" : "Get started"}</Link></nav>
        </div>
        <div className="landing-inner landing-footer-bottom"><span>© {new Date().getFullYear()} Unified AI Workspace</span><span>Built for secure multi-model AI workflows</span></div>
      </footer>
    </>
  );
}