import { useEffect } from "react";

interface OutsideClickHandlerProps {
  ref: React.RefObject<HTMLElement | null>;
  handler: () => void;
}

/**
 * Custom hook for detecting clicks outside of a specified element.
 * 
 * This hook adds a mousedown event listener to the document and triggers
 * the provided handler function when a click occurs outside the referenced element.
 *
 * @param ref - React ref object pointing to the element to monitor
 * @param handler - Function to call when a click outside the element is detected
 */
export const useOutsideClick = ({ ref, handler }: OutsideClickHandlerProps) => {
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        handler();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [ref, handler]);
};
