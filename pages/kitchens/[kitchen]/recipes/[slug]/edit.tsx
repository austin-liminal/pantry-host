import { useRouter } from 'next/router';
import RecipeEditPage from '@/components/pages/RecipeEditPage';
export default function KitchenEditRecipe() {
  const { kitchen, slug } = useRouter().query;
  return <RecipeEditPage kitchen={(kitchen as string) || ''} recipeId={(slug as string) || ''} />;
}
