import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const ANON_COOKIE_NAME = "anon_id";

export type RequestActor = {
  userId: string | null;
  anonId: string | null;
  shouldSetAnonCookie: boolean;
};

export async function resolveRequestActor(request: NextRequest): Promise<RequestActor> {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (user) {
    return {
      userId: user.id,
      anonId: null,
      shouldSetAnonCookie: false
    };
  }

  const existingAnonId = request.cookies.get(ANON_COOKIE_NAME)?.value?.trim() ?? "";
  if (existingAnonId) {
    return {
      userId: null,
      anonId: existingAnonId,
      shouldSetAnonCookie: false
    };
  }

  return {
    userId: null,
    anonId: crypto.randomUUID(),
    shouldSetAnonCookie: true
  };
}
