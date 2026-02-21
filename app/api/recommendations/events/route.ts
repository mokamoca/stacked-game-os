import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ANON_COOKIE_NAME, resolveRequestActor } from "@/lib/request-actor";
import { EVENT_ACTIONS, type EventAction } from "@/lib/mvp-constants";

type Body = {
  game_id?: string;
  action?: EventAction;
  shown_event_id?: string;
  reason_code?: string;
  reason_note?: string;
};

const ALLOWED_ACTIONS = new Set<EventAction>(EVENT_ACTIONS);

function withAnonCookie(response: NextResponse, anonId: string | null, shouldSet: boolean) {
  if (shouldSet && anonId) {
    response.cookies.set({
      name: ANON_COOKIE_NAME,
      value: anonId,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 365 * 2,
      path: "/"
    });
  }
  return response;
}

export async function POST(request: NextRequest) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const gameId = typeof body.game_id === "string" ? body.game_id.trim() : "";
  const action = body.action;
  const shownEventId = typeof body.shown_event_id === "string" ? body.shown_event_id.trim() : null;
  const reasonCode = typeof body.reason_code === "string" ? body.reason_code.trim() : null;
  const reasonNote = typeof body.reason_note === "string" ? body.reason_note.trim() : null;

  if (!gameId) return NextResponse.json({ error: "game_id_required" }, { status: 400 });
  if (!action || !ALLOWED_ACTIONS.has(action)) return NextResponse.json({ error: "invalid_action" }, { status: 400 });
  if (action === "shown") return NextResponse.json({ error: "shown_not_allowed" }, { status: 400 });
  if (action === "dismiss" && !reasonCode) {
    return NextResponse.json({ error: "dismiss_requires_reason_code" }, { status: 400 });
  }

  try {
    const actor = await resolveRequestActor(request);
    const admin = createAdminClient();

    const payload = {
      user_id: actor.userId,
      anon_id: actor.anonId,
      game_id: gameId,
      shown_event_id: shownEventId,
      action,
      reason_code: reasonCode,
      reason_note: reasonNote
    };

    const { error } = await admin.from("recommendation_events").insert(payload);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const response = NextResponse.json({ ok: true });
    return withAnonCookie(response, actor.anonId, actor.shouldSetAnonCookie);
  } catch (error) {
    const message = error instanceof Error ? error.message : "failed_to_save_event";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
