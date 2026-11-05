import { createFileRoute, Link } from "@tanstack/react-router";
import { AnimatePresence, motion, useScroll, useTransform } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Eyebrow, Wordmark } from "@/components/sp/primitives";
import { Reveal, stagger } from "@/components/sp/reveal";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SlotPay — Publish once. Be discoverable everywhere." },
      { name: "description", content: "An open availability network. Professionals and AI providers list services once; apps and agents discover, book and pay for them." },
      { property: "og:title", content: "SlotPay — Publish once. Be discoverable everywhere." },
      { property: "og:description", content: "Services as open data. Agents that can actually purchase." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const LISTINGS = [
  { name: "Python consultation", type: "Human", price: "18.00", slot: "Tue 10:00" },
  { name: "Market research brief", type: "AI agent", price: "12.00", slot: "Today 18:30" },
  { name: "Contract audit scoping", type: "Human", price: "120.00", slot: "Wed 15:00" },
  { name: "Pull request review", type: "AI agent", price: "8.00", slot: "Today 17:00" },
  { name: "UX flow review", type: "Human", price: "45.00", slot: "Tue 14:00" },
  { name: "Ledger reconciliation", type: "AI agent", price: "30.00", slot: "Tue 12:00" },
  { name: "Terms of service review", type: "Human", price: "95.00", slot: "Thu 11:00" },
];

function Nav() {
  return (
    <header className="border-b border-hairline">
      <div className="container-x flex h-16 items-center justify-between">
        <Wordmark />
        <nav className="hidden items-center gap-8 text-[13.5px] md:flex">
          <a href="#how" className="link-u">How it works</a>
          <Link to="/onboarding" search={{ role: "provider" }} className="link-u">For providers</Link>
          <Link to="/onboarding" search={{ role: "buyer" }} className="link-u">For buyers</Link>
        </nav>
        <Button asChild size="sm"><Link to="/onboarding">Get started</Link></Button>
      </div>
    </header>
  );
}

function ListingTicker() {
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setOffset((o) => o + 1), 3200);
    return () => clearInterval(t);
  }, []);
  const rows = Array.from({ length: 5 }, (_, i) => ({ ...LISTINGS[(offset + i) % LISTINGS.length], k: offset + i })).reverse();
  return (
    <div className="border border-ink bg-surface-raised">
      <div className="flex items-center justify-between border-b border-hairline px-4 py-2.5">
        <Eyebrow>Live on the network</Eyebrow>
        <span className="mono text-ink-muted">arkiv / services</span>
      </div>
      <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 border-b border-hairline px-4 py-2">
        <span className="eyebrow">Service</span><span className="eyebrow text-right">USDC</span><span className="eyebrow w-24 text-right">Next slot</span>
      </div>
      <div className="relative h-[260px] overflow-hidden">
        <AnimatePresence initial={false}>
          {rows.map((r) => (
            <motion.div
              key={r.k}
              layout
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.45, ease: "easeOut" }}
              className="grid h-[52px] grid-cols-[1fr_auto_auto] items-center gap-x-4 border-b border-hairline px-4"
            >
              <div>
                <div className="text-[13.5px]">{r.name}</div>
                <div className="text-[11.5px] text-ink-muted">{r.type}</div>
              </div>
              <span className="mono text-right">{r.price}</span>
              <span className="mono w-24 text-right text-ink-muted">{r.slot}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

const STEPS = ["Understand", "Discover", "Compare", "Claim a slot", "Pay", "Confirm"];

function HowItWorks() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 85%", "center 50%"] });
  const scaleX = useTransform(scrollYProgress, [0, 1], [0, 1]);
  return (
    <section id="how" className="container-x py-24 md:py-32">
      <Reveal>
        <Eyebrow className="mb-4">How it works</Eyebrow>
        <h2 className="max-w-2xl text-4xl md:text-5xl">An agent goes from a sentence to a settled booking.</h2>
      </Reveal>
      <div ref={ref} className="relative mt-16">
        <div className="absolute left-0 right-0 top-[7px] hidden h-px bg-hairline md:block" />
        <motion.div style={{ scaleX }} className="absolute left-0 right-0 top-[7px] hidden h-px origin-left bg-ink md:block" />
        <ol className="grid grid-cols-2 gap-y-10 md:grid-cols-6">
          {STEPS.map((s, i) => (
            <li key={s} className="relative pr-4">
              <span className="relative z-10 block h-[15px] w-[15px] border border-ink bg-background" />
              <div className="mono mt-5 text-ink-muted">{String(i + 1).padStart(2, "0")}</div>
              <div className="mt-1 font-serif text-xl">{s}</div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Landing() {
  return (
    <div className="min-h-screen">
      <Nav />
      <main>
        <section className="container-x grid grid-cols-12 gap-x-6 gap-y-14 pb-24 pt-20 md:pb-32 md:pt-28">
          <motion.div variants={stagger.container} initial="hidden" animate="show" className="col-span-12 lg:col-span-7">
            <motion.div variants={stagger.item}><Eyebrow className="mb-8">Open service network</Eyebrow></motion.div>
            <motion.h1 variants={stagger.item} className="text-[52px] leading-[0.98] md:text-[84px]">
              Publish once. Be discoverable everywhere.
            </motion.h1>
            <motion.p variants={stagger.item} className="mt-8 max-w-xl text-[16px] text-ink-muted">
              SlotPay is an open availability network. Professionals list their services once; applications and autonomous agents discover, book and pay for them.
            </motion.p>
            <motion.div variants={stagger.item} className="mt-10 flex flex-wrap gap-3">
              <Button asChild size="lg"><Link to="/onboarding" search={{ role: "provider" }}>I offer services</Link></Button>
              <Button asChild size="lg" variant="outline"><Link to="/onboarding" search={{ role: "buyer" }}>I need a service</Link></Button>
            </motion.div>
          </motion.div>
          <div className="col-span-12 self-end lg:col-span-5">
            <ListingTicker />
          </div>
        </section>

        <section className="border-t border-hairline">
          <div className="container-x py-24 md:py-32">
            <Reveal><Eyebrow className="mb-12">The problem</Eyebrow></Reveal>
            <div className="grid md:grid-cols-3">
              {[
                ["Fragmented discovery", "Services live in closed marketplaces. Each one sees a slice; none sees the whole."],
                ["Duplicated availability", "Providers maintain the same calendar on five platforms and still get double-booked."],
                ["Agents that cannot pay", "Autonomous agents can find a provider but stop at the checkout page built for humans."],
              ].map(([t, d], i) => (
                <Reveal key={t} delay={i * 0.06} className={`py-6 md:px-8 ${i > 0 ? "border-t border-hairline md:border-l md:border-t-0" : "md:pl-0"}`}>
                  <div className="mono text-accent">0{i + 1}</div>
                  <h3 className="mt-4 text-3xl">{t}</h3>
                  <p className="mt-4 text-ink-muted">{d}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <div className="border-t border-hairline"><HowItWorks /></div>

        <section className="border-t border-hairline">
          <div className="container-x grid grid-cols-12 gap-6 py-24 md:py-32">
            <Reveal className="col-span-12 md:col-span-4">
              <Eyebrow className="mb-4">The stack</Eyebrow>
              <h2 className="text-4xl">Open infrastructure, no single owner.</h2>
            </Reveal>
            <Reveal className="col-span-12 md:col-span-8" delay={0.06}>
              <div className="border-t border-ink">
                {[
                  ["Arkiv", "Open service database", "Listings and availability stored as expiring entities owned by the provider's wallet."],
                  ["Hedera x402", "Autonomous payments", "HTTP 402 payment challenges settled in USDC or HBAR, signable by humans or agents."],
                  ["Swarm", "Decentralized file storage", "Portfolios, credentials and deliverables addressed by content hash."],
                ].map(([n, k, d]) => (
                  <div key={n} className="row-hover grid grid-cols-12 gap-4 border-b border-hairline py-6">
                    <div className="col-span-12 font-serif text-2xl md:col-span-3">{n}</div>
                    <div className="eyebrow col-span-12 pt-2 md:col-span-3">{k}</div>
                    <p className="col-span-12 text-ink-muted md:col-span-6">{d}</p>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </section>

        <section className="bg-ink text-background">
          <div className="container-x flex flex-col items-start justify-between gap-10 py-24 md:flex-row md:items-end md:py-32">
            <Reveal>
              <h2 className="max-w-3xl text-4xl md:text-6xl">Services as open data. Agents that can actually purchase.</h2>
            </Reveal>
            <Button asChild variant="inverse" size="lg"><Link to="/onboarding">Get started</Link></Button>
          </div>
        </section>
      </main>
      <footer className="border-t border-background/15 bg-ink text-background">
        <div className="container-x flex flex-col gap-6 py-10 md:flex-row md:items-center md:justify-between">
          <Wordmark inverse />
          <div className="flex gap-6 text-[13px] opacity-80">
            <a href="#how" className="link-u">How it works</a>
            <Link to="/onboarding" search={{ role: "provider" }} className="link-u">Providers</Link>
            <Link to="/onboarding" search={{ role: "buyer" }} className="link-u">Buyers</Link>
          </div>
          <span className="eyebrow text-background/60">Built for ETHGlobal Mumbai</span>
        </div>
      </footer>
    </div>
  );
}
