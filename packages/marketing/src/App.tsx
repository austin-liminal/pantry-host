import Hero from './sections/Hero';
import Tiers from './sections/Tiers';
import Features from './sections/Features';
import Integrations from './sections/Integrations';
import Philosophy from './sections/Philosophy';
import Footer from '@pantry-host/shared/components/Footer';
import { Plant } from '@phosphor-icons/react';

export default function App() {
  return (
    <div className="bg-[var(--color-bg-body)] text-[var(--color-text-primary)] transition-colors">
      <div className="grid grid-rows-[auto_1fr] min-h-[100svh]">
        <header className="px-4 sm:px-6 py-4 max-w-5xl mx-auto w-full">
          <a href="/" className="inline-flex items-center gap-2 text-[var(--color-accent)] hover:underline">
            <Plant size={24} weight="light" />
            <span
              className="text-xl font-bold text-[var(--color-text-primary)]"
              style={{ fontFamily: "'Crimson Pro', Georgia, serif" }}
            >
              Pantry Host
            </span>
          </a>
        </header>
        <Hero />
      </div>
      <main>
        <Tiers />
        <Features />
        <Integrations />
        <Philosophy />
      </main>
      <Footer />
    </div>
  );
}
