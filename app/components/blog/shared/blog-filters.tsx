import type { SanityCategory } from "@/app/blog/types";
import React from "react";
import { useRouter, useSearchParams } from "next/navigation";

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
    <div className="flex gap-2 mb-6 overflow-x-auto">
      <button
        type="button"
        className={`px-4 py-2 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
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
          className={`px-4 py-2 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
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
