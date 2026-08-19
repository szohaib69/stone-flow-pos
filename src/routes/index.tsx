// POS SYSTEM — ACTIVE. Entry point: this login screen is served at "/".
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Staff Sign In — City Tiles" },
      {
        name: "description",
        content: "Sign in to the City Tiles point-of-sale and inventory dashboard.",
      },
      { property: "og:title", content: "Staff Sign In — City Tiles" },
      { property: "og:description", content: "Point-of-sale and inventory dashboard access." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [loading, setLoading] = useState(false);
  const [adminExists, setAdminExists] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/admin", replace: true });
    });
    supabase.rpc("admin_exists").then(({ data }) => setAdminExists(data !== false));
  }, [navigate]);

  // Until the first admin exists, the sign-up form is the one-time owner setup.
  const isAdminSetup = mode === "signup" && adminExists === false;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin + "/admin",
            data: { full_name: fullName, phone, employee_id: employeeId },
          },
        });
        if (error) throw error;
        if (!isAdminSetup) {
          toast.success(
            "Your cashier registration request has been submitted. Please wait for Admin approval.",
          );
        }
        if (!data.session) {
          toast.success("Check your email to confirm your account.");
          return;
        }
        if (isAdminSetup) navigate({ to: "/admin", replace: true });
        else navigate({ to: "/admin", replace: true });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/admin", replace: true });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin + "/",
    });
    if (result.error) {
      toast.error("Google sign-in failed");
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/admin", replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[--marble-black] px-5 py-16">
      <div className="w-full max-w-md border border-border/40 bg-card p-8 md:p-10 shadow-stone">
        <Link to="/website" className="eyebrow text-brass">
          City Tiles
        </Link>
        <h1 className="mt-5 text-3xl">
          {mode === "signin"
            ? "Staff sign in"
            : isAdminSetup
              ? "First-time admin setup"
              : "Register as cashier"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {mode === "signin"
            ? "Access to the point-of-sale, inventory and sales reports."
            : isAdminSetup
              ? "No admin account exists yet. This one-time setup creates the single owner account."
              : "Submit a cashier request. The admin must approve it before you can use the POS."}
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          {mode === "signup" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="fullName">Full name</Label>
                <Input
                  id="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  maxLength={100}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone (optional)</Label>
                <Input
                  id="phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  maxLength={30}
                />
              </div>
              {!isAdminSetup && (
                <div className="space-y-2">
                  <Label htmlFor="employeeId">Employee ID (optional)</Label>
                  <Input
                    id="employeeId"
                    value={employeeId}
                    onChange={(e) => setEmployeeId(e.target.value)}
                    maxLength={50}
                  />
                </div>
              )}
            </>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              maxLength={255}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>
          <Button type="submit" variant="brass" size="xl" className="w-full" disabled={loading}>
            {loading
              ? "Please wait…"
              : mode === "signin"
                ? "Sign in"
                : isAdminSetup
                  ? "Create admin account"
                  : "Submit cashier request"}
          </Button>
        </form>

        <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
        </div>

        <Button variant="stone" size="xl" className="w-full" onClick={handleGoogle}>
          Continue with Google
        </Button>

        <button
          type="button"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="mt-6 w-full text-sm text-muted-foreground hover:text-brass"
        >
          {mode === "signin"
            ? adminExists === false
              ? "No admin yet? Run first-time admin setup"
              : "No account yet? Register as cashier"
            : "Already have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}
