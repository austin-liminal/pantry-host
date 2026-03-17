import { useRouter } from 'next/router';
import RecipeDetailPage from '@/components/pages/RecipeDetailPage';
export default function KitchenRecipeDetail() {
  const { kitchen, slug } = useRouter().query;
  return <RecipeDetailPage kitchen={(kitchen as string) || ''} recipeId={(slug as string) || ''} />;
}
