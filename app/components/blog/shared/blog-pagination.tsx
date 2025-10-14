"use client";
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
    const windowSize = 2;
    const pages = Array.from({ length: totalPages }, (_, i) => i + 1).filter(
      (p) =>
        p === 1 || p === totalPages || Math.abs(p - currentPage) <= windowSize,
    );
    return pages;
  };

  return (
    <nav
      className="mt-8 flex items-center justify-center gap-2"
      aria-label="Pagination"
    >
      <button
        type="button"
        className="rounded-sm bg-[#23262F] px-3 py-1 text-gray-200 hover:bg-blue-700 disabled:opacity-50"
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
          className={`rounded px-3 py-1 font-medium transition-colors ${
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
        className="rounded-sm bg-[#23262F] px-3 py-1 text-gray-200 hover:bg-blue-700 disabled:opacity-50"
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
