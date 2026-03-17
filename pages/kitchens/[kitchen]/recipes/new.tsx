import { useRouter } from 'next/router';
import RecipeNewPage from '@/components/pages/RecipeNewPage';
export default function KitchenNewRecipe() {
  const { kitchen } = useRouter().query;
  return <RecipeNewPage kitchen={(kitchen as string) || ''} />;
}
