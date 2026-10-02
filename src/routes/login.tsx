import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { z } from "zod";
import { AuthCard, GoogleIcon } from "@/components/auth-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { safeRedirect } from "@/lib/auth";
import { signInWithGoogle } from "@/lib/google-sign-in";
import { notify } from "@/lib/toast";

const searchSchema = z.object({ redirect: z.string().optional() });

export const Route = createFileRoute("/login")({
  validateSearch: (search) => searchSchema.parse(search),
  head: () => ({
    meta: [
      { title: "Sign in — Unified AI Workspace" },
      { name: "description", content: "Sign in to your Unified AI Workspace account." },
      { property: "og:title", content: "Sign in — Unified AI Workspace" },
      { property: "og:description", content: "Sign in to your Unified AI Workspace account." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const { redirect } = Route.useSearch();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return void notify.error("Sign-in failed", error.message);
    navigate({ to: safeRedirect(redirect), replace: true });
  }

  async function onGoogle() {
    const { error, signedIn } = await signInWithGoogle(redirect);
    if (error) notify.error("Google sign-in failed", error);
    else if (signedIn) navigate({ to: "/auth/callback", replace: true });
  }

  return (
    <AuthCard title="Welcome back" description="Sign in to continue to your workspace">
      <Button variant="outline" className="w-full" onClick={onGoogle}>
        <GoogleIcon />Continue with Google
      </Button>
      <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
        <div className="h-px flex-1 bg-border" />or<div className="h-px flex-1 bg-border" />
      </div>
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link to="/forgot-password" className="text-xs text-muted-foreground underline-offset-4 hover:underline">Forgot password?</Link>
          </div>
          <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <Button type="submit" className="w-full" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</Button>
      </form>
      <p className="mt-4 text-center text-sm text-muted-foreground">
        No account? <Link to="/signup" className="font-medium text-foreground underline-offset-4 hover:underline">Create one</Link>
      </p>
    </AuthCard>
  );
}
