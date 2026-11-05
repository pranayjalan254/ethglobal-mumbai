import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Eyebrow, Field, inputCls, Mono, ProgressLine, Segmented, Wordmark } from "@/components/sp/primitives";
import { useAuth, type Role } from "@/lib/auth";
import { CATEGORIES } from "@/lib/api";
import { cn } from "@/lib/utils";

type Search = { role?: Role | undefined };

export const Route = createFileRoute("/onboarding")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    role: s["role"] === "provider" || s["role"] === "buyer" ? s["role"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Get started — SlotPay" },
      { name: "description", content: "Choose a role and sign in with Google to create your SlotPay wallet." },
      { property: "og:title", content: "Get started — SlotPay" },
      { property: "og:description", content: "Choose a role and sign in to the open service network." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Onboarding,
});

type Step = "role" | "signin" | "confirm" | "profile";

function Onboarding() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const auth = useAuth();
  const [role, setRole] = useState<Role | null>(search.role ?? null);
  const [step, setStep] = useState<Step>(search.role ? "signin" : "role");
  const [pending, setPending] = useState(false);

  // When a wallet appears after login, move to confirmation.
  useEffect(() => {
    if (auth.walletAddress && (step === "signin")) {
      setPending(false);
      if (role) auth.setRole(role);
      setStep("confirm");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.walletAddress, step]);

  useEffect(() => {
    if (step !== "confirm") return;
    const t = setTimeout(() => {
      if (role === "provider" && !auth.profile) setStep("profile");
      else navigate({ to: role === "provider" ? "/provider" : "/buyer" });
    }, 2200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const idx = step === "role" ? 1 : step === "signin" ? 2 : 3;

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <aside className="flex flex-col justify-between border-b border-hairline bg-surface p-8 md:p-14 lg:border-b-0 lg:border-r">
        <Wordmark />
        <div className="my-16 lg:my-0">
          <h1 className="max-w-md text-4xl md:text-6xl">Your wallet is your identity on the network.</h1>
          <ol className="mt-12 max-w-md border-t border-hairline">
            {[
              "Choose whether you offer or buy services.",
              "Sign in with Google. An embedded wallet is created for you.",
              "Providers publish listings owned by that wallet. Buyers can delegate payment to an agent.",
            ].map((t, i) => (
              <li key={i} className="flex gap-5 border-b border-hairline py-4">
                <Mono className="text-accent">0{i + 1}</Mono>
                <span className="text-ink-muted">{t}</span>
              </li>
            ))}
          </ol>
        </div>
        <span className="eyebrow">No seed phrase required</span>
      </aside>

      <main className="flex items-center p-8 md:p-14">
        <motion.div key={step} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="w-full max-w-lg">
          <Mono className="text-ink-muted">0{idx} / 03</Mono>

          {step === "role" && (
            <>
              <h2 className="mb-8 mt-4 text-4xl">How will you use SlotPay?</h2>
              <div className="space-y-3">
                {([
                  ["provider", "Service provider", "Publish services and availability to the open network. You keep ownership through your wallet."],
                  ["buyer", "Buyer", "Discover and purchase services yourself, or delegate to an autonomous agent."],
                ] as const).map(([v, t, d]) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={role === v}
                    onClick={() => setRole(v)}
                    className={cn(
                      "relative block w-full border bg-surface-raised p-6 text-left transition-colors duration-150",
                      role === v ? "border-ink" : "border-hairline hover:border-ink-muted",
                    )}
                  >
                    {role === v && <span className="absolute inset-y-0 left-0 w-1 bg-ink" />}
                    <div className="font-serif text-2xl">{t}</div>
                    <p className="mt-2 text-ink-muted">{d}</p>
                  </button>
                ))}
              </div>
              <Button className="mt-8 w-full" size="lg" disabled={!role} onClick={() => setStep("signin")}>Continue</Button>
            </>
          )}

          {step === "signin" && (
            <>
              <h2 className="mb-3 mt-4 text-4xl">Sign in</h2>
              <p className="mb-8 text-ink-muted">
                Continuing as <span className="text-ink">{role === "provider" ? "service provider" : "buyer"}</span>.{" "}
                <button className="link-u text-accent" onClick={() => setStep("role")}>Change</button>
              </p>
              <Button
                size="lg"
                className="w-full"
                disabled={pending || !auth.isReady}
                onClick={() => {
                  setPending(true);
                  auth.login("google");
                  if (auth.usingPrivy) setTimeout(() => setPending(false), 4000);
                }}
              >
                Continue with Google
              </Button>
              {pending && <ProgressLine className="mt-4" />}
              <div className="mt-6">
                <button className="link-u text-[13.5px] text-accent" onClick={() => { setPending(true); auth.login("wallet"); }}>
                  Use an existing wallet
                </button>
              </div>
              {!auth.usingPrivy && (
                <p className="mt-10 border-t border-hairline pt-4 text-[12.5px] text-ink-muted">
                  Demo mode: no Privy app ID is configured, so a sample wallet is generated locally.
                </p>
              )}
            </>
          )}

          {step === "confirm" && (
            <>
              <h2 className="mb-6 mt-4 text-4xl">Wallet ready.</h2>
              <div className="border border-hairline bg-surface-raised p-5">
                <Eyebrow>Embedded wallet</Eyebrow>
                <div className="mono mt-2 break-all text-[14px]">{auth.walletAddress}</div>
              </div>
              <p className="mt-6 text-ink-muted">Redirecting to your {role === "provider" ? "provider" : "buyer"} dashboard.</p>
              <ProgressLine className="mt-4" />
            </>
          )}

          {step === "profile" && <ProfileSetup onDone={() => navigate({ to: "/provider" })} />}
        </motion.div>
      </main>
    </div>
  );
}

function ProfileSetup({ onDone }: { onDone: () => void }) {
  const { setProfile, walletAddress } = useAuth();
  const [f, setF] = useState({ displayName: "", providerType: "human" as "human" | "ai", headline: "", bio: "", category: CATEGORIES[0]! });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setProfile(f);
        onDone();
      }}
    >
      <h2 className="mb-2 mt-4 text-4xl">Provider profile</h2>
      <p className="mb-8 text-ink-muted">Owned by <Mono>{walletAddress}</Mono></p>
      <div className="space-y-5">
        <Field label="Display name" htmlFor="dn"><input id="dn" required className={inputCls} value={f.displayName} onChange={(e) => setF({ ...f, displayName: e.target.value })} /></Field>
        <Field label="Provider type">
          <Segmented label="Provider type" value={f.providerType} onChange={(v) => setF({ ...f, providerType: v })} options={[{ value: "human", label: "Human" }, { value: "ai", label: "AI agent" }]} />
        </Field>
        <Field label="Headline" htmlFor="hl"><input id="hl" className={inputCls} placeholder="Senior Python engineer" value={f.headline} onChange={(e) => setF({ ...f, headline: e.target.value })} /></Field>
        <Field label="Bio" htmlFor="bio"><textarea id="bio" rows={3} className={inputCls} value={f.bio} onChange={(e) => setF({ ...f, bio: e.target.value })} /></Field>
        <Field label="Category" htmlFor="cat">
          <select id="cat" className={inputCls} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
      </div>
      <div className="mt-8 flex items-center gap-6">
        <Button type="submit" size="lg">Save and continue</Button>
        <button type="button" className="link-u text-[13.5px] text-ink-muted" onClick={onDone}>Skip for now</button>
      </div>
    </form>
  );
}
