import React from "react";

interface BlogPaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

const BlogPagination: React.FC<BlogPaginationProps> = ({
  currentPage,
  totalPages,
  onPageChange,
}) => {
  if (totalPages <= 1) return null;

  const getPages = () => {
    const pages = [];
    for (let i = 1; i <= totalPages; i++) {
      pages.push(i);
    }
    return pages;
  };

  return (
    <nav
      className="flex justify-center items-center gap-2 mt-8"
      aria-label="Pagination"
    >
      <button
        type="button"
        className="px-3 py-1 rounded bg-[#23262F] text-gray-200 hover:bg-blue-700 disabled:opacity-50"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        aria-label="Previous page"
      >
        &larr;
      </button>
      {getPages().map((page) => (
        <button
          key={page}
          type="button"
          className={`px-3 py-1 rounded font-medium transition-colors ${
            page === currentPage
              ? "bg-blue-600 text-white"
              : "bg-[#23262F] text-gray-200 hover:bg-blue-700"
          }`}
          onClick={() => onPageChange(page)}
          aria-current={page === currentPage ? "page" : undefined}
        >
          {page}
        </button>
      ))}
      <button
        type="button"
        className="px-3 py-1 rounded bg-[#23262F] text-gray-200 hover:bg-blue-700 disabled:opacity-50"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        aria-label="Next page"
      >
        &rarr;
      </button>
    </nav>
  );
};

export default BlogPagination;
