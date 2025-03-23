import { useEffect } from "react";

interface OutsideClickHandlerProps {
  ref: React.RefObject<HTMLElement | null>;
  handler: () => void;
}

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

export const currencyToCountryCode = (currency: string) => {
  const currencyOverrides: Record<string, string> = {
    EUR: "eu", // European Union
    CHF: "ch", // Switzerland
    XAF: "cm", // Central African CFA Franc (Cameroon)
    XOF: "sn", // West African CFA Franc (Senegal)
    XCD: "ag", // East Caribbean Dollar (Antigua & Barbuda)
    XPF: "nc", // CFP Franc (New Caledonia)
    XDR: "",   // No country (IMF Special Drawing Rights)
    GBP: "gb", // United Kingdom
    JPY: "jp", // Japan
    CNY: "cn", // China
  };

  return currencyOverrides[currency] || currency.slice(0, 2).toLowerCase();
};