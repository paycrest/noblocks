import { useEffect } from "react";

interface OutsideClickHandlerProps {
  ref: React.RefObject<HTMLElement | null>;
  handler: () => void;
}

export const useOutsideClick = ({ ref, handler }: OutsideClickHandlerProps) => {
  useEffect(() => {
    // Use `click` (not `mousedown`): on touch devices, mousedown outside-handlers
    // often run before the target's click and unmount the control so selection
    // never applies — especially when menus/modals are portaled outside `ref`.
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        handler();
      }
    };

    document.addEventListener("click", handleClickOutside);

    return () => {
      document.removeEventListener("click", handleClickOutside);
    };
  }, [ref, handler]);
};
