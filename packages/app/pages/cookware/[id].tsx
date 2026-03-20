import { useRouter } from 'next/router';
import CookwareDetailPage from '@/components/pages/CookwareDetailPage';

export default function CookwareDetail() {
  const { id } = useRouter().query;
  return <CookwareDetailPage id={(id as string) || ''} kitchen="home" />;
}
