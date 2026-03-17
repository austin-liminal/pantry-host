import { useRouter } from 'next/router';
import IngredientsPage from '@/components/pages/IngredientsPage';
export default function KitchenIngredients() {
  const { kitchen } = useRouter().query;
  return <IngredientsPage kitchen={(kitchen as string) || ''} />;
}
