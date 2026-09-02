import { toast } from "sonner";

type GetToken = () => Promise<string | null>;

/** Returns a real Clerk JWT, or null after toasting when the user is signed out. */
export async function requireAuthToken(
  getToken: GetToken,
  options?: { silent?: boolean }
): Promise<string | null> {
  const token = await getToken();
  if (!token || token === "null" || token === "undefined") {
    if (!options?.silent) {
      toast.error("Please sign in to continue");
    }
    return null;
  }
  return token;
}

export function authHeaders(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}
