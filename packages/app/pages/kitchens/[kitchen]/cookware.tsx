import { useRouter } from 'next/router';
import CookwarePage from '@/components/pages/CookwarePage';
export default function KitchenCookware() {
  const { kitchen } = useRouter().query;
  return <CookwarePage kitchen={(kitchen as string) || ''} />;
}
