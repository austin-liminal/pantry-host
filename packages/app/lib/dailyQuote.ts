import quotes from '@/lib/quotes.json';

/** Returns the same quote for the entire day (seeded by date). */
export function getDailyQuote(): { text: string; author: string } {
  const day = new Date();
  const seed = day.getFullYear() * 10000 + (day.getMonth() + 1) * 100 + day.getDate();
  return quotes[seed % quotes.length];
}
