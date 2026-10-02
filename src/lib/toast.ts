import { toast } from "sonner";

/** App-wide toast helpers. The <Toaster /> is mounted once in the root route. */
export const notify = {
  success: (message: string, description?: string) => toast.success(message, description ? { description } : undefined),
  error: (message: string, description?: string) => toast.error(message, description ? { description } : undefined),
  info: (message: string, description?: string) => toast(message, description ? { description } : undefined),
  fromError: (error: unknown, fallback = "Something went wrong") =>
    toast.error(error instanceof Error && error.message ? error.message : fallback),
};
