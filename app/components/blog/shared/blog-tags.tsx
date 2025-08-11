import React from "react";

interface BlogTagsProps {
  tags?: ReadonlyArray<string>;
}

const BlogTags: React.FC<BlogTagsProps> = ({ tags }) => {
  if (!tags?.length) return null;

  return (
    <div className="mt-4 flex flex-wrap gap-2" aria-label="Tags">
      {tags.map((tag, i) => (
        <span
          key={`${tag}-${i}`}
          className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/80"
        >
          {tag}
        </span>
      ))}
    </div>
  );
};

export default BlogTags;
