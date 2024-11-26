import { toast } from "react-toastify";
import { useForm } from "react-hook-form";
import { InputError } from "./InputError";
import axios from "axios";
import { trackEvent, triggerHotjarEvent } from "../hooks/analytics";
import { useEffect, useState } from "react";

export const buttonStyles =
  "min-w-fit rounded-full bg-primary px-5 py-2.5 font-medium text-white transition-colors hover:bg-opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-white active:scale-95 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-white dark:focus-visible:ring-offset-neutral-900 dark:disabled:bg-zinc-800 dark:disabled:text-white/50";

const useFormAbandonment = (isSubmitting: boolean) => {
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isSubmitting) {
        trackEvent("waitlist_form_abandoned");
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isSubmitting]);
};

const useTimeToJoinWaitlist = () => {
  const [startTime] = useState(Date.now());

  const trackTimeToJoin = () => {
    const endTime = Date.now();
    const timeTaken = endTime - startTime;
    trackEvent("time_to_join_waitlist", { timeTaken });
  };

  return trackTimeToJoin;
};

export const WaitlistForm = ({ onSuccess }: { onSuccess: () => void }) => {
  const {
    watch,
    reset,
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<{ email: string }>({ mode: "onChange" });

  const onEmailInput = () => {
    trackEvent("email_input_started");
  };

  useFormAbandonment(isSubmitting);

  const trackTimeToJoin = useTimeToJoinWaitlist();

  const onSubmit = async () => {
    const email = watch("email");

    trackTimeToJoin();
    triggerHotjarEvent("newsletter_signup");

    try {
      const response = await axios.post("/api/waitlist", { email });

      if (response.status === 200) {
        trackEvent("waitlist_joined", { email });
        onSuccess();
        reset();
      } else {
        toast.error("Failed to add to waitlist. Please try again later.");
      }
    } catch (error) {
      toast.error(
        "Failed to add to waitlist. Please contact support for help."
      );
    }
  };

  return (
    <form
      action=""
      method="post"
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      className="flex gap-4 items-start flex-wrap"
    >
      <div className="space-y-2 flex-grow">
        <input
          type="email"
          {...register("email", {
            required: "Email is required",
            pattern: {
              value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,4}$/i,
              message: "Invalid email address",
            },
            onChange: onEmailInput,
          })}
          placeholder="Enter email"
          className="w-full rounded-full border border-gray-300 bg-transparent bg-white py-2.5 px-4 text-sm text-neutral-900 transition-colors placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-white/20 dark:bg-neutral-900 dark:text-white/80 dark:placeholder:text-white/30 dark:focus-visible:ring-offset-neutral-900 disabled:cursor-not-allowed"
        />

        {errors.email?.message && <InputError message={errors.email.message} />}
      </div>

      <button type="submit" disabled={isSubmitting} className={buttonStyles}>
        {isSubmitting ? "Submitting..." : "Join waitlist"}
      </button>
    </form>
  );
};
