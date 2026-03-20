import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './Layout';
import HomePage from './pages/HomePage';
import RecipesPage from './pages/RecipesPage';
import RecipeDetailPage from './pages/RecipeDetailPage';
import RecipeNewPage from './pages/RecipeNewPage';
import IngredientsPage from './pages/IngredientsPage';
import GroceryListPage from './pages/GroceryListPage';
import CookwarePage from './pages/CookwarePage';
import MenusPage from './pages/MenusPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/recipes" element={<RecipesPage />} />
          <Route path="/recipes/new" element={<RecipeNewPage />} />
          <Route path="/recipes/:slug" element={<RecipeDetailPage />} />
          <Route path="/ingredients" element={<IngredientsPage />} />
          <Route path="/list" element={<GroceryListPage />} />
          <Route path="/cookware" element={<CookwarePage />} />
          <Route path="/menus" element={<MenusPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
