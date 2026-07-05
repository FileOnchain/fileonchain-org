import { NextResponse } from "next/server";
import { requireUser, asRouteError } from "@/lib/auth";
import {
  getUserPreferences,
  updateUserPreferences,
  isUniqueViolation,
} from "@/lib/server/preferences";
import { logActivity } from "@/lib/server/activity";
import {
  USERNAME_RE,
  isDateFormatPreference,
  type UserPreferencesData,
} from "@/lib/preferences";

export async function GET() {
  try {
    const userId = await requireUser();
    const preferences = await getUserPreferences(userId);
    return NextResponse.json({ preferences });
  } catch (error) {
    return asRouteError(error);
  }
}

const BOOLEAN_KEYS = [
  "showTestnets",
  "analyticsEnabled",
  "uploadAdvisorEnabled",
  "notifyUploadComplete",
  "notifyLowCredit",
  "notifyPromotions",
  "notifyNewsletter",
] as const;

/**
 * Validate an untrusted partial body into a preferences patch. Returns an
 * error string on the first invalid field; unknown keys are ignored.
 */
const parsePatch = (
  body: Record<string, unknown>,
): { patch: Partial<UserPreferencesData> } | { error: string } => {
  const patch: Partial<UserPreferencesData> = {};

  if ("username" in body) {
    const raw = body.username;
    if (raw === null || raw === "") {
      patch.username = null;
    } else if (typeof raw === "string") {
      const username = raw.trim().toLowerCase();
      if (!USERNAME_RE.test(username)) {
        return {
          error:
            "Username must be 3–32 chars: lowercase letters, digits, - or _, starting with a letter or digit",
        };
      }
      patch.username = username;
    } else {
      return { error: "Expected username to be a string or null" };
    }
  }

  if ("dateFormat" in body) {
    if (!isDateFormatPreference(body.dateFormat)) {
      return { error: "Invalid dateFormat" };
    }
    patch.dateFormat = body.dateFormat;
  }

  for (const key of BOOLEAN_KEYS) {
    if (key in body) {
      if (typeof body[key] !== "boolean") {
        return { error: `Expected ${key} to be a boolean` };
      }
      patch[key] = body[key];
    }
  }

  return { patch };
};

export async function PATCH(request: Request) {
  try {
    const userId = await requireUser();
    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Expected a JSON object body" },
        { status: 400 },
      );
    }

    const parsed = parsePatch(body);
    if ("error" in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    if (Object.keys(parsed.patch).length === 0) {
      return NextResponse.json(
        { error: "No recognized preference fields in body" },
        { status: 400 },
      );
    }

    let preferences;
    try {
      preferences = await updateUserPreferences(userId, parsed.patch);
    } catch (error) {
      if (isUniqueViolation(error)) {
        return NextResponse.json(
          { error: "That username is already taken" },
          { status: 409 },
        );
      }
      throw error;
    }

    await logActivity(userId, "preferences_updated", {
      fields: Object.keys(parsed.patch).join(","),
    });
    return NextResponse.json({ preferences });
  } catch (error) {
    return asRouteError(error);
  }
}
