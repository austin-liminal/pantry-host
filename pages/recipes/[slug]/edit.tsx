import { useRouter } from 'next/router';
import RecipeEditPage from '@/components/pages/RecipeEditPage';
export default function EditRecipePage() {
  const { slug } = useRouter().query;
  return <RecipeEditPage kitchen="home" recipeId={(slug as string) || ''} />;
}
