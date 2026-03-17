import { useState } from 'react';
import { gql } from '@/lib/gql';

interface Recipe {
  id: string;
  slug: string | null;
  title: string;
  cookTime: number | null;
  prepTime: number | null;
  servings: number | null;
  source: string;
  tags: string[];
  photoUrl: string | null;
  queued: boolean;
}

interface Props {
  recipe: Recipe;
  recipesBase?: string;
}

const TOGGLE_QUEUED = `mutation ToggleQueued($id: String!) { toggleRecipeQueued(id: $id) { id queued } }`;

export default function RecipeCard({ recipe, recipesBase = '/recipes' }: Props) {
  const [queued, setQueued] = useState(recipe.queued);
  const [toggling, setToggling] = useState(false);
  const totalTime = (recipe.prepTime ?? 0) + (recipe.cookTime ?? 0);

  async function handleToggle(e: React.MouseEvent) {
    e.preventDefault();
    if (toggling) return;
    setToggling(true);
    setQueued((q) => !q); // optimistic
    try {
      const data = await gql<{ toggleRecipeQueued: { queued: boolean } }>(TOGGLE_QUEUED, { id: recipe.id });
      setQueued(data.toggleRecipeQueued.queued);
    } catch {
      setQueued((q) => !q); // revert on error
    } finally {
      setToggling(false);
    }
  }

  return (
    <div className="card group relative overflow-hidden">
      {recipe.photoUrl && (
        <div className="aspect-[16/9] overflow-hidden bg-zinc-100 dark:bg-zinc-800">
          <a href={`${recipesBase}/${recipe.slug ?? recipe.id}#stage`} className="block w-full h-full" tabIndex={-1} aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={recipe.photoUrl}
              alt={recipe.title}
              className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform"
              loading="lazy"
            />
          </a>
        </div>
      )}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <a
            href={`${recipesBase}/${recipe.slug ?? recipe.id}#stage`}
            className="font-bold text-base leading-snug hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
          >
            {recipe.title}
          </a>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleToggle}
              disabled={toggling}
              aria-label={queued ? `Remove ${recipe.title} from list` : `Add ${recipe.title} to list`}
              aria-pressed={queued}
              className={`w-7 h-7 flex items-center justify-center transition-colors border ${
                queued
                  ? 'bg-amber-500 border-amber-500 text-white hover:bg-amber-600 hover:border-amber-600'
                  : 'border-zinc-300 dark:border-zinc-600 text-zinc-400 dark:text-zinc-500 hover:border-amber-500 hover:text-amber-500 dark:hover:border-amber-400 dark:hover:text-amber-400'
              }`}
            >
              <ListIcon aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3 text-sm text-zinc-500 dark:text-zinc-400">
          {totalTime > 0 && (
            <span>
              <time dateTime={`PT${totalTime}M`}>{totalTime} min</time>
            </span>
          )}
          {recipe.servings != null && (
            <span>{recipe.servings} servings</span>
          )}
        </div>

        {recipe.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {recipe.tags.slice(0, 4).map((t) => (
              <span key={t} className="tag">{t}</span>
            ))}
          </div>
        )}
        {recipe.source === 'ai-generated' && (
          <span className="absolute bottom-2 right-2 text-zinc-500 dark:text-zinc-600" title="AI-generated recipe">
            <RobotIcon aria-hidden="true" />
            <span className="sr-only">AI-generated</span>
          </span>
        )}
      </div>
    </div>
  );
}

function RobotIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 640 512" fill="currentColor">
      {/* Font Awesome Pro 5.15.4 - fa-robot (light) */}
      <path d="M192,416h64V384H192ZM576,224H544V192a95.99975,95.99975,0,0,0-96-96H336V16a16,16,0,0,0-32,0V96H192a95.99975,95.99975,0,0,0-96,96v32H64a31.99908,31.99908,0,0,0-32,32V384a32.00033,32.00033,0,0,0,32,32H96a95.99975,95.99975,0,0,0,96,96H448a95.99975,95.99975,0,0,0,96-96h32a32.00033,32.00033,0,0,0,32-32V256A31.99908,31.99908,0,0,0,576,224ZM96,384H64V256H96Zm416,32a64.18916,64.18916,0,0,1-64,64H192a64.18916,64.18916,0,0,1-64-64V192a63.99942,63.99942,0,0,1,64-64H448a63.99942,63.99942,0,0,1,64,64Zm64-32H544V256h32ZM416,192a64,64,0,1,0,64,64A64.07333,64.07333,0,0,0,416,192Zm0,96a32,32,0,1,1,32-32A31.97162,31.97162,0,0,1,416,288ZM384,416h64V384H384Zm-96,0h64V384H288ZM224,192a64,64,0,1,0,64,64A64.07333,64.07333,0,0,0,224,192Zm0,96a32,32,0,1,1,32-32A31.97162,31.97162,0,0,1,224,288Z" />
    </svg>
  );
}

function ListIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 576 512" fill="currentColor">
      {/* Font Awesome Pro 5.15.4 - fa-cart-plus (light) */}
      <path d="M551.991 64H129.28l-8.329-44.423C118.822 8.226 108.911 0 97.362 0H12C5.373 0 0 5.373 0 12v8c0 6.627 5.373 12 12 12h78.72l69.927 372.946C150.305 416.314 144 431.42 144 448c0 35.346 28.654 64 64 64s64-28.654 64-64a63.681 63.681 0 0 0-8.583-32h145.167a63.681 63.681 0 0 0-8.583 32c0 35.346 28.654 64 64 64 35.346 0 64-28.654 64-64 0-17.993-7.435-34.24-19.388-45.868C506.022 391.891 496.76 384 485.328 384H189.28l-12-64h331.381c11.368 0 21.177-7.976 23.496-19.105l43.331-208C578.592 77.991 567.215 64 551.991 64zM464 416c17.645 0 32 14.355 32 32s-14.355 32-32 32-32-14.355-32-32 14.355-32 32-32zm-256 0c17.645 0 32 14.355 32 32s-14.355 32-32 32-32-14.355-32-32 14.355-32 32-32zm294.156-128H171.28l-36-192h406.876l-40 192zM272 196v-8c0-6.627 5.373-12 12-12h36v-36c0-6.627 5.373-12 12-12h8c6.627 0 12 5.373 12 12v36h36c6.627 0 12 5.373 12 12v8c0 6.627-5.373 12-12 12h-36v36c0 6.627-5.373 12-12 12h-8c-6.627 0-12-5.373-12-12v-36h-36c-6.627 0-12-5.373-12-12z" />
    </svg>
  );
}
