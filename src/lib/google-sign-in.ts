import { lovable } from "@/integrations/lovable/index";
import { REDIRECT_STORAGE_KEY, safeRedirect } from "@/lib/auth";

/** Starts Google sign-in. Returns an error message, or null on success/redirect. */
export async function signInWithGoogle(next: string | undefined): Promise<{ error: string | null; signedIn: boolean }> {
  sessionStorage.setItem(REDIRECT_STORAGE_KEY, safeRedirect(next));
  const result = await lovable.auth.signInWithOAuth("google", {
    redirect_uri: `${window.location.origin}/auth/callback`,
  });
  if (result.error) return { error: result.error.message ?? "Google sign-in failed", signedIn: false };
  if (result.redirected) return { error: null, signedIn: false };
  return { error: null, signedIn: true };
}
