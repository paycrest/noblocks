import { useState, useEffect } from "react";
import { fetchRate } from "@/app/api/aggregator";

export const useCNGNRate = () => {
  const [rate, setRate] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const getCNGNRate = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const rateResponse = await fetchRate({
          token: "USDT",
          amount: 1,
          currency: "NGN",
        });

        if (rateResponse?.data && typeof rateResponse.data === "string") {
          setRate(Number(rateResponse.data));
        }
      } catch (error) {
        console.error("Error fetching CNGN rate:", error);
        setError("Failed to fetch CNGN rate");
      } finally {
        setIsLoading(false);
      }
    };

    getCNGNRate();
  }, []);

  return { rate, isLoading, error };
};
