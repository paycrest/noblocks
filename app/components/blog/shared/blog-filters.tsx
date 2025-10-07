import type { SanityCategory } from "@/app/blog/types";
import React from "react";

interface BlogFiltersProps {
  categories: SanityCategory[];
  selectedCategoryId: string | null;
  onSelectCategory: (categoryId: string | null) => void;
}

const BlogFilters: React.FC<BlogFiltersProps> = ({
  categories,
  selectedCategoryId,
  onSelectCategory,
}) => {
  return (
    <div className="mb-6 flex gap-2 overflow-x-auto">
      <button
        type="button"
        className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-colors ${
          selectedCategoryId === null
            ? "bg-blue-600 text-white"
            : "bg-[#23262F] text-gray-200 hover:bg-blue-700"
        }`}
        onClick={() => onSelectCategory(null)}
      >
        All posts
      </button>
      {categories.map((cat) => (
        <button
          type="button"
          key={cat._id}
          className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-colors ${
            selectedCategoryId === cat._id
              ? "bg-blue-600 text-white"
              : "bg-[#23262F] text-gray-200 hover:bg-blue-700"
          }`}
          onClick={() => onSelectCategory(cat._id)}
        >
          {cat.title}
        </button>
      ))}
    </div>
  );
};

export default BlogFilters;
