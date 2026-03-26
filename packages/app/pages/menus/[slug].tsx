import { useRouter } from 'next/router';
import Head from 'next/head';
import MenuDetailPage from '@/components/pages/MenuDetailPage';
import sql from '@/lib/db';

interface Props {
  ogTitle?: string;
  ogDescription?: string;
}

export async function getServerSideProps({ params }: { params: { slug: string } }) {
  try {
    const [row] = await sql`SELECT title, description FROM menus WHERE slug = ${params.slug} OR id::text = ${params.slug} LIMIT 1`;
    if (row) {
      return {
        props: {
          ogTitle: row.title ?? null,
          ogDescription: row.description ?? null,
        },
      };
    }
  } catch { /* DB unavailable — render without og tags */ }
  return { props: {} };
}

export default function MenuPage({ ogTitle, ogDescription }: Props) {
  const { slug } = useRouter().query;
  const fallback = typeof window !== 'undefined' ? window.location.pathname.split('/').filter(Boolean).pop() || '' : '';
  const title = ogTitle ? `${ogTitle} — Pantry Host` : 'Menus — Pantry Host';
  return (
    <>
      <Head>
        <title>{title}</title>
        <meta property="og:title" content={title} />
        <meta property="og:type" content="website" />
        {ogDescription && <meta property="og:description" content={ogDescription} />}
        {ogDescription && <meta name="description" content={ogDescription} />}
        <meta name="twitter:card" content="summary" />
      </Head>
      <MenuDetailPage kitchen="home" menuId={(slug as string) || fallback} />
    </>
  );
}
