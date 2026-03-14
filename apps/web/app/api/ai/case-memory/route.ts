import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { updateCaseOutcome, listCases } from "../../../../lib/ai/case-memory";

/**
 * PATCH /api/ai/case-memory
 *
 * Update a case record's outcome (e.g. user edited or reset the map).
 * Body: { id: string, outcome: "edited" | "reset" }
 */
export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { id, outcome } = body ?? {};

    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "Missing 'id'" }, { status: 400 });
    }

    if (!outcome || !["accepted", "edited", "reset"].includes(outcome)) {
      return NextResponse.json(
        { error: "Invalid 'outcome' — must be 'accepted', 'edited', or 'reset'" },
        { status: 400 },
      );
    }

    const updated = await updateCaseOutcome(id, outcome);
    if (!updated) {
      return NextResponse.json({ error: "Case not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to update case" }, { status: 500 });
  }
}

/**
 * GET /api/ai/case-memory?limit=50
 *
 * List recent case records, sorted newest first.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const limit = Number(request.nextUrl.searchParams.get("limit") ?? "50");
    const cases = await listCases(limit);
    return NextResponse.json({ cases, count: cases.length });
  } catch {
    return NextResponse.json({ error: "Failed to list cases" }, { status: 500 });
  }
}
