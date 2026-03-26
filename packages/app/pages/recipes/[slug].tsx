import { useRouter } from 'next/router';
import Head from 'next/head';
import RecipeDetailPage from '@/components/pages/RecipeDetailPage';
import sql from '@/lib/db';

interface Props {
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
}

export async function getServerSideProps({ params }: { params: { slug: string } }) {
  try {
    const [row] = await sql`SELECT title, description, photo_url FROM recipes WHERE slug = ${params.slug} OR id::text = ${params.slug} LIMIT 1`;
    if (row) {
      return {
        props: {
          ogTitle: row.title ?? null,
          ogDescription: row.description ?? null,
          ogImage: row.photo_url ?? null,
        },
      };
    }
  } catch { /* DB unavailable — render without og tags */ }
  return { props: {} };
}

export default function RecipePage({ ogTitle, ogDescription, ogImage }: Props) {
  const { slug } = useRouter().query;
  const fallback = typeof window !== 'undefined' ? window.location.pathname.split('/').filter(Boolean).pop() || '' : '';
  const title = ogTitle ? `${ogTitle} — Pantry Host` : 'Pantry Host';
  return (
    <>
      <Head>
        <title>{title}</title>
        <meta property="og:title" content={title} />
        <meta property="og:type" content="article" />
        {ogDescription && <meta property="og:description" content={ogDescription} />}
        {ogDescription && <meta name="description" content={ogDescription} />}
        {ogImage && <meta property="og:image" content={ogImage} />}
        <meta name="twitter:card" content={ogImage ? 'summary_large_image' : 'summary'} />
      </Head>
      <RecipeDetailPage kitchen="home" recipeId={(slug as string) || fallback} />
    </>
  );
}
