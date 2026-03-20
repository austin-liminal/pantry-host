import { useRouter } from 'next/router';
import RecipeImportPage from '@/components/pages/RecipeImportPage';
export default function KitchenImportRecipes() {
  const { kitchen } = useRouter().query;
  return <RecipeImportPage kitchen={(kitchen as string) || ''} />;
}
