import { useRouter } from 'next/router';
import GroceryListPage from '@/components/pages/GroceryListPage';
export default function KitchenList() {
  const { kitchen } = useRouter().query;
  return <GroceryListPage kitchen={(kitchen as string) || ''} />;
}
