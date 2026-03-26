import { Barcode, ClipboardText, FileArrowUp, Sparkle, Leaf, Palette, WifiSlash, ShieldCheck } from '@phosphor-icons/react';

const features = [
  {
    title: 'Barcode scanning',
    description: 'Scan grocery barcodes with your phone camera to add ingredients instantly via Open Food\u00a0Facts.',
    icon: Barcode,
  },
  {
    title: 'Grocery list',
    description: 'Queue recipes and get a consolidated, categorized grocery list. Check off items as you shop.',
    icon: ClipboardText,
  },
  {
    title: 'Import & Export',
    description: 'Import recipes from any URL or exported HTML file. Export individual recipes or your entire collection as shareable, re-importable HTML.',
    icon: FileArrowUp,
  },
  {
    title: 'AI generation',
    description: 'Generate recipes from what you have on hand. Powered by Claude, using your own API key.',
    icon: Sparkle,
  },
  {
    title: 'Zen mode',
    description: 'Distraction-free cooking view with large text, step-by-step navigation, and screen wake lock.',
    icon: Leaf,
  },
  {
    title: 'Themes',
    description: 'System, light, and dark modes. Multiple color palettes. High contrast mode for accessibility.',
    icon: Palette,
  },
  {
    title: 'Offline first',
    description: 'Service worker caching, offline queue, and cache-seeded state. Works without a network connection.',
    icon: WifiSlash,
  },
  {
    title: 'Privacy by design',
    description: 'No accounts, no tracking, no analytics. Your data never leaves your machine.',
    icon: ShieldCheck,
  },
];

export default function Features() {
  return (
    <section className="px-4 sm:px-6 py-16 sm:py-24 max-w-5xl mx-auto">
      <h2
        className="text-4xl sm:text-5xl font-bold text-center mb-12"
      >
        What Pantry Host&nbsp;does
      </h2>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {features.map((f) => (
          <div
            key={f.title}
            className="feature-card rounded-xl border border-[var(--color-border-card)] bg-[var(--color-bg-card)] p-5"
          >
            <div className="opacity-60 mb-3">
              <f.icon size={24} weight="light" />
            </div>
            <h3
              className="font-bold text-xl mb-2"
            >
              {f.title}
            </h3>
            <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed pretty">
              {f.description}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
