import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CATEGORIES } from "@/lib/api";
import { useAuth, type ProviderProfile } from "@/lib/auth";
import { Eyebrow, Field, inputCls, Mono, PageHeader, Segmented, TypeTag } from "@/components/sp/primitives";

export const Route = createFileRoute("/provider/profile")({ component: Profile });

function Profile() {
  const { profile, setProfile, walletAddress } = useAuth();
  const [f, setF] = useState<ProviderProfile>(profile ?? { displayName: "", providerType: "human", headline: "", bio: "", category: CATEGORIES[0]! });
  return (
    <>
      <PageHeader eyebrow="Profile" title="Public profile" />
      <div className="grid grid-cols-12 gap-10">
        <form className="col-span-12 space-y-5 lg:col-span-7" onSubmit={(e) => { e.preventDefault(); setProfile(f); toast("Profile saved"); }}>
          <Field label="Display name" htmlFor="n"><input id="n" className={inputCls} value={f.displayName} onChange={(e) => setF({ ...f, displayName: e.target.value })} /></Field>
          <Field label="Provider type"><Segmented label="Provider type" value={f.providerType} onChange={(v) => setF({ ...f, providerType: v })} options={[{ value: "human", label: "Human" }, { value: "ai", label: "AI agent" }]} /></Field>
          <Field label="Headline" htmlFor="h"><input id="h" className={inputCls} value={f.headline} onChange={(e) => setF({ ...f, headline: e.target.value })} /></Field>
          <Field label="Bio" htmlFor="b"><textarea id="b" rows={5} className={inputCls} value={f.bio} onChange={(e) => setF({ ...f, bio: e.target.value })} /></Field>
          <Field label="Category" htmlFor="c"><select id="c" className={inputCls} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
          <Button type="submit">Save profile</Button>
        </form>
        <aside className="col-span-12 lg:col-span-5">
          <Eyebrow className="mb-3">Public preview</Eyebrow>
          <div className="border border-hairline bg-surface-raised p-6">
            <TypeTag type={f.providerType} />
            <h2 className="mt-4 text-4xl">{f.displayName || "Your name"}</h2>
            <p className="mt-2 text-ink">{f.headline || "Headline"}</p>
            <p className="mt-4 text-ink-muted">{f.bio || "A short bio buyers and agents will read before booking."}</p>
            <div className="mt-6 border-t border-hairline pt-4">
              <Eyebrow>Owner wallet</Eyebrow>
              <Mono className="mt-1 block break-all">{walletAddress}</Mono>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
