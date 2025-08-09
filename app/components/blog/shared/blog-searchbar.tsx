import React from "react";

interface BlogSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

const BlogSearchBar: React.FC<BlogSearchBarProps> = ({
  value,
  onChange,
  placeholder,
}) => {
  return (
    <div className="relative w-full max-w-md mb-6">
      <label htmlFor="blog-search" className="sr-only">
        Search blog posts
      </label>
      <input
        id="blog-search"
        type="text"
        className="w-full pl-10 pr-4 py-2 rounded-lg bg-[#23262F] text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-600 transition"
        placeholder={placeholder || "Search"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
      />
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
        <svg
          width="18"
          height="18"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </span>
    </div>
  );
};

export default BlogSearchBar;
