export default function Footer() {
  return (
    <footer className="no-print border-t border-zinc-200 dark:border-zinc-800 mt-16 pt-10 pb-8 px-4 sm:px-6 text-xs text-zinc-500 dark:text-zinc-400">
      <div className="max-w-5xl mx-auto">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 mb-8">
          <div>
            <h3 className="font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-3">Volume</h3>
            <dl className="space-y-1">
              <div><dt className="inline font-medium">1 cup</dt> <dd className="inline">= 16 tbsp</dd></div>
              <div><dt className="inline font-medium">1 tbsp</dt> <dd className="inline">= 3 tsp</dd></div>
              <div><dt className="inline font-medium">1 cup</dt> <dd className="inline">= 237 ml</dd></div>
              <div><dt className="inline font-medium">1 fl oz</dt> <dd className="inline">= 30 ml</dd></div>
              <div><dt className="inline font-medium">1 quart</dt> <dd className="inline">= 4 cups</dd></div>
              <div><dt className="inline font-medium">1 gallon</dt> <dd className="inline">= 4 quarts</dd></div>
            </dl>
          </div>
          <div>
            <h3 className="font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-3">Weight</h3>
            <dl className="space-y-1">
              <div><dt className="inline font-medium">1 oz</dt> <dd className="inline">= 28.35 g</dd></div>
              <div><dt className="inline font-medium">1 lb</dt> <dd className="inline">= 16 oz</dd></div>
              <div><dt className="inline font-medium">1 lb</dt> <dd className="inline">= 454 g</dd></div>
              <div><dt className="inline font-medium">1 kg</dt> <dd className="inline">= 2.2 lb</dd></div>
              <div><dt className="inline font-medium">1 stick butter</dt> <dd className="inline">= 113 g</dd></div>
            </dl>
          </div>
          <div>
            <h3 className="font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-3">Temperature</h3>
            <dl className="space-y-1">
              <div><dt className="inline font-medium">250 °F</dt> <dd className="inline">= 121 °C</dd></div>
              <div><dt className="inline font-medium">350 °F</dt> <dd className="inline">= 177 °C</dd></div>
              <div><dt className="inline font-medium">400 °F</dt> <dd className="inline">= 204 °C</dd></div>
              <div><dt className="inline font-medium">450 °F</dt> <dd className="inline">= 232 °C</dd></div>
              <div><dt className="inline font-medium">750 °F</dt> <dd className="inline">= 399 °C</dd></div>
            </dl>
          </div>
          <div>
            <h3 className="font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-3">Handy</h3>
            <dl className="space-y-1">
              <div><dt className="inline font-medium">1 clove garlic</dt> <dd className="inline">≈ 1 tsp</dd></div>
              <div><dt className="inline font-medium">1 lemon</dt> <dd className="inline">≈ 3 tbsp juice</dd></div>
              <div><dt className="inline font-medium">1 lime</dt> <dd className="inline">≈ 2 tbsp juice</dd></div>
              <div><dt className="inline font-medium">1 egg</dt> <dd className="inline">≈ 50 g</dd></div>
              <div><dt className="inline font-medium">Pinch</dt> <dd className="inline">≈ ⅛ tsp</dd></div>
            </dl>
          </div>
        </div>
        <div className="text-zinc-400 dark:text-zinc-500">
          <span className="font-serif font-bold">Pantry Host</span>
        </div>
      </div>
    </footer>
  );
}
