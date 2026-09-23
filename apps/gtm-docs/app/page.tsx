import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col">
      <section className="border-b border-fd-border/40 bg-gradient-to-b from-fd-primary/10 to-transparent">
        <div className="mx-auto max-w-4xl px-6 py-24 text-center">
          <p className="mb-3 text-sm font-medium tracking-wide text-fd-primary uppercase">
            Open source · Deploy it yourself
          </p>
          <h1 className="text-4xl font-bold tracking-tight text-fd-foreground md:text-5xl">
            The documentation home for your go-to-market systems
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-fd-muted-foreground">
            paydirt <strong>gtm-docs</strong> centralizes your GTM workflows — HubSpot,
            Salesforce, Clay, and custom systems — as living design records: diagrams, data
            models, attribution, and governance, readable by the whole team.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/docs"
              className="rounded-lg bg-fd-primary px-5 py-2.5 font-medium text-fd-primary-foreground transition-opacity hover:opacity-90"
            >
              Read the docs
            </Link>
            <a
              href="https://github.com/nika-loki/paydirt"
              className="rounded-lg border border-fd-border px-5 py-2.5 font-medium text-fd-foreground transition-colors hover:bg-fd-accent"
            >
              Deploy your own
            </a>
          </div>
          <p className="mt-6 text-sm text-fd-muted-foreground">
            This instance is the flagship — it documents paydirt&apos;s own GTM systems.
          </p>
        </div>
      </section>

      <section className="mx-auto grid max-w-4xl gap-6 px-6 py-16 md:grid-cols-2">
        <Link
          href="/docs/systems"
          className="group rounded-xl border border-fd-border p-6 transition-colors hover:bg-fd-accent"
        >
          <h2 className="text-lg font-semibold text-fd-foreground">
            For operators and RevOps
          </h2>
          <p className="mt-2 text-sm text-fd-muted-foreground">
            Every workflow as a design record — what triggers it, what data moves, who
            approves, and how revenue gets credit. No code required to follow along.
          </p>
          <p className="mt-3 text-sm font-medium text-fd-primary group-hover:underline">
            Browse the systems directory →
          </p>
        </Link>
        <Link
          href="/docs/build"
          className="group rounded-xl border border-fd-border p-6 transition-colors hover:bg-fd-accent"
        >
          <h2 className="text-lg font-semibold text-fd-foreground">For GTM engineers</h2>
          <p className="mt-2 text-sm text-fd-muted-foreground">
            Connector contracts, workflow templates, deployment recipes, and the
            governance substrate — dry-runs, budgets, and approval gates by default.
          </p>
          <p className="mt-3 text-sm font-medium text-fd-primary group-hover:underline">
            Build &amp; run →
          </p>
        </Link>
      </section>
    </main>
  );
}
