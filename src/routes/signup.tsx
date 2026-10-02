import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { MailCheck } from "lucide-react";
import { AuthCard, GoogleIcon } from "@/components/auth-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { signInWithGoogle } from "@/lib/google-sign-in";
import { notify } from "@/lib/toast";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "Create account — Unified AI Workspace" },
      { name: "description", content: "Create a Unified AI Workspace account to chat with multiple AI providers." },
      { property: "og:title", content: "Create account — Unified AI Workspace" },
      { property: "og:description", content: "Create a Unified AI Workspace account to chat with multiple AI providers." },
    ],
  }),
  component: SignupPage,
});

function SignupPage() {
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback`, data: { display_name: displayName } },
    });
    setBusy(false);
    if (error) return void notify.error("Sign-up failed", error.message);
    if (data.session) navigate({ to: "/chat", replace: true });
    else setSent(true);
  }

  async function onGoogle() {
    const { error, signedIn } = await signInWithGoogle("/chat");
    if (error) notify.error("Google sign-in failed", error);
    else if (signedIn) navigate({ to: "/auth/callback", replace: true });
  }

  if (sent) {
    return (
      <AuthCard title="Check your email" description={`We sent a confirmation link to ${email}.`}>
        <div className="flex flex-col items-center gap-4 text-center text-sm text-muted-foreground">
          <MailCheck className="size-8 text-primary" />
          <p>Open the link to activate your account, then sign in.</p>
          <Button asChild variant="outline" className="w-full"><Link to="/login">Back to sign in</Link></Button>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Create your account" description="One workspace for all your AI providers">
      <Button variant="outline" className="w-full" onClick={onGoogle}>
        <GoogleIcon />Continue with Google
      </Button>
      <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
        <div className="h-px flex-1 bg-border" />or<div className="h-px flex-1 bg-border" />
      </div>
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="name">Display name</Label>
          <Input id="name" autoComplete="name" required maxLength={80} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <Button type="submit" className="w-full" disabled={busy}>{busy ? "Creating…" : "Create account"}</Button>
      </form>
      <p className="mt-4 text-center text-sm text-muted-foreground">
        Already have an account? <Link to="/login" className="font-medium text-foreground underline-offset-4 hover:underline">Sign in</Link>
      </p>
    </AuthCard>
  );
}
