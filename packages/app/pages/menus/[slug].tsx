import { useRouter } from 'next/router';
import MenuDetailPage from '@/components/pages/MenuDetailPage';
export default function MenuPage() {
  const { slug } = useRouter().query;
  const fallback = typeof window !== 'undefined' ? window.location.pathname.split('/').filter(Boolean).pop() || '' : '';
  return <MenuDetailPage kitchen="home" menuId={(slug as string) || fallback} />;
}
