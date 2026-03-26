import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Hero from './sections/Hero';
import Tiers from './sections/Tiers';
import Features from './sections/Features';
import Integrations from './sections/Integrations';
import Philosophy from './sections/Philosophy';
import Footer from '@pantry-host/shared/components/Footer';
import AccessibilityPreferences from '@pantry-host/shared/components/AccessibilityPreferences';
import { Plant } from '@phosphor-icons/react';

function Header() {
  return (
    <header className="px-4 sm:px-6 py-4 max-w-5xl mx-auto w-full">
      <a href="/" className="inline-flex items-center gap-2 text-[var(--color-accent)] hover:underline">
        <Plant size={24} weight="light" />
        <span
          className="text-xl font-bold text-[var(--color-text-primary)]"
          style={{ fontFamily: "Iowan Old Style, Apple Garamond, Baskerville, Times New Roman, Droid Serif, Times, Source Serif Pro, serif, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol" }}
        >
          Pantry Host
        </span>
      </a>
    </header>
  );
}

function Landing() {
  return (
    <>
      <div className="grid grid-rows-[auto_1fr] min-h-[100svh]">
        <Header />
        <Hero />
      </div>
      <main>
        <Tiers />
        <Features />
        <Integrations />
        <Philosophy />
      </main>
    </>
  );
}

function AccessibilityPage() {
  return (
    <>
      <Header />
      <main>
        <AccessibilityPreferences />
      </main>
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="bg-[var(--color-bg-body)] text-[var(--color-text-primary)] transition-colors">
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/accessibility" element={<AccessibilityPage />} />
        </Routes>
        <Footer />
      </div>
    </BrowserRouter>
  );
}
