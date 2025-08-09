import React from "react";

interface BlogTagsProps {
  tags: string[];
}

const BlogTags: React.FC<BlogTagsProps> = ({ tags }) => {
  if (!tags || tags.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 mt-4">
      {tags.map((tag) => (
        <span
          key={tag}
          className="px-3 py-1 rounded-full bg-white/10 text-xs text-white/80 font-medium"
        >
          {tag}
        </span>
      ))}
    </div>
  );
};

export default BlogTags;
