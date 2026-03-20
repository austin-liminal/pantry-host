export default function Philosophy() {
  return (
    <section className="px-4 sm:px-6 py-16 sm:py-24 max-w-3xl mx-auto text-center">
      <h2
        className="text-3xl sm:text-4xl font-bold mb-8"
        style={{ fontFamily: "'Crimson Pro', Georgia, serif" }}
      >
        We ship code, not a&nbsp;subscription
      </h2>
      <p className="text-base sm:text-lg text-[var(--color-text-secondary)] leading-relaxed">
        Pantry Host is open source software you run yourself. There is no cloud service to sunset,
        no pricing tier to upsell, and no terms of service that claim rights to your recipes.
        Your data sits on your hardware, backed up however you choose, for as long as
        you&nbsp;want&nbsp;it.
      </p>
      <p className="mt-6 text-base sm:text-lg text-[var(--color-text-secondary)] leading-relaxed">
        AI features are entirely opt-in&nbsp;&mdash; bring your own API key and requests go directly
        to the provider. Nothing is stored, nothing is trained&nbsp;on.
      </p>
    </section>
  );
}
