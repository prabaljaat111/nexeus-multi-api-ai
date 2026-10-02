import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { MailCheck } from "lucide-react";
import { AuthCard } from "@/components/auth-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { notify } from "@/lib/toast";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [
      { title: "Reset password — Unified AI Workspace" },
      { name: "description", content: "Request a password reset link for your Unified AI Workspace account." },
      { property: "og:title", content: "Reset password — Unified AI Workspace" },
      { property: "og:description", content: "Request a password reset link for your Unified AI Workspace account." },
    ],
  }),
  component: ForgotPassword,
});

function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    if (error) return void notify.error("Couldn't send reset link", error.message);
    setSent(true);
  }

  if (sent) {
    return (
      <AuthCard title="Check your email" description={`If an account exists for ${email}, a reset link is on its way.`}>
        <div className="flex flex-col items-center gap-4">
          <MailCheck className="size-8 text-primary" />
          <Button asChild variant="outline" className="w-full"><Link to="/login">Back to sign in</Link></Button>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Forgot your password?" description="We'll email you a link to set a new one.">
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <Button type="submit" className="w-full" disabled={busy}>{busy ? "Sending…" : "Send reset link"}</Button>
      </form>
      <p className="mt-4 text-center text-sm text-muted-foreground">
        <Link to="/login" className="font-medium text-foreground underline-offset-4 hover:underline">Back to sign in</Link>
      </p>
    </AuthCard>
  );
}
