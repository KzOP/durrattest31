import { createServerFn } from "@tanstack/react-start";

// The Firebase web API key is publishable; it is stored as a project secret only for convenience.
export const getFirebaseWebKey = createServerFn({ method: "GET" }).handler(async () => {
  return { apiKey: (process.env.GOOGLE_API_KEY || "").trim() };
});
