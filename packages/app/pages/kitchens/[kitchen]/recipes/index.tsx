import { useRouter } from 'next/router';
import RecipesIndexPage from '@/components/pages/RecipesIndexPage';
export default function KitchenRecipes() {
  const { kitchen } = useRouter().query;
  return <RecipesIndexPage kitchen={(kitchen as string) || ''} />;
}
