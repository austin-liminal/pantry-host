import { useRouter } from 'next/router';
import RecipeExportPage from '@/components/pages/RecipeExportPage';
export default function KitchenExportRecipes() {
  const { kitchen } = useRouter().query;
  return <RecipeExportPage kitchen={(kitchen as string) || ''} />;
}
