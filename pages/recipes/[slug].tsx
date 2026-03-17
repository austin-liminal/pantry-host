import { useRouter } from 'next/router';
import RecipeDetailPage from '@/components/pages/RecipeDetailPage';
export default function RecipePage() {
  const { slug } = useRouter().query;
  return <RecipeDetailPage kitchen="home" recipeId={(slug as string) || ''} />;
}
