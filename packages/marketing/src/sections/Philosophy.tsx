export default function Philosophy() {
  return (
    <section className="px-4 sm:px-6 py-16 sm:py-24 max-w-3xl mx-auto text-center">
      <h2
        className="text-3xl sm:text-4xl font-bold mb-8"
        style={{ fontFamily: "'Crimson Pro', Georgia, serif" }}
      >
        No subscription&nbsp;needed
      </h2>
      <p className="text-base sm:text-lg text-[var(--color-text-secondary)] leading-relaxed">
        Pantry Host is open source software you run yourself. There is no cloud service to sunset,
        no pricing tier to upsell, and no terms of service that claim rights to your recipes.
        Your data sits on your hardware, backed up however you choose, for as long as
        you&nbsp;want&nbsp;it.
      </p>
      <p className="mt-6 text-base sm:text-lg text-[var(--color-text-secondary)] leading-relaxed italic">
        If you feel the need to pay for something, consider donating to your local food&nbsp;bank.
      </p>
      <p className="mt-6 text-base sm:text-lg text-[var(--color-text-secondary)] leading-relaxed">
        AI features are entirely opt-in. Bring your own API key and requests go directly
        to the&nbsp;provider.
      </p>
    </section>
  );
}
