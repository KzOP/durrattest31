import { createFileRoute } from "@tanstack/react-router";
import { handleTelegramNotify } from "@/durrat/server/telegram-notify";

// Public path; the handler requires the staff member's Firebase sign-in token.
export const Route = createFileRoute("/api/public/telegram-notify")({
  server: {
    handlers: {
      POST: ({ request }) => handleTelegramNotify(request),
    },
  },
});
