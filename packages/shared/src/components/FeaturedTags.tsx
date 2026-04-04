/**
 * FeaturedTags — checkbox shortcuts for commonly used tags.
 * Toggles tags in/out of a comma-separated tag string.
 */

const FEATURED_TAGS = [
  { value: 'gluten-free', label: 'Gluten-free' },
  { value: 'vegetarian', label: 'Vegetarian' },
  { value: 'vegan', label: 'Vegan' },
  { value: 'pregnancy-safe', label: 'Pregnancy safe' },
  { value: 'breastfeeding-safe', label: 'Breastfeeding safe' },
  { value: 'lactation', label: 'Supports lactation' },
  { value: 'breastfeeding-alert', label: 'Breastfeeding alert' },
];

interface Props {
  tags: string;
  onChange: (tags: string) => void;
}

export default function FeaturedTags({ tags, onChange }: Props) {
  const tagList = tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);

  function toggle(tag: string, checked: boolean) {
    const current = tags.split(',').map((t) => t.trim()).filter(Boolean);
    if (checked) {
      if (!current.some((t) => t.toLowerCase() === tag)) {
        onChange([...current, tag].join(', '));
      }
    } else {
      onChange(current.filter((t) => t.toLowerCase() !== tag).join(', '));
    }
  }

  return (
    <div className="mt-2 space-y-1">
      {FEATURED_TAGS.map(({ value, label }) => (
        <label key={value} className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={tagList.includes(value)}
            onChange={(e) => toggle(value, e.target.checked)}
            className="w-4 h-4 accent-[var(--color-accent)]"
          />
          <span className="text-sm">{label}</span>
        </label>
      ))}
    </div>
  );
}
