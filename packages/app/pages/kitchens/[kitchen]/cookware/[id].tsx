import { useRouter } from 'next/router';
import CookwareDetailPage from '@/components/pages/CookwareDetailPage';

export default function KitchenCookwareDetail() {
  const { kitchen, id } = useRouter().query;
  return <CookwareDetailPage id={(id as string) || ''} kitchen={(kitchen as string) || ''} />;
}
