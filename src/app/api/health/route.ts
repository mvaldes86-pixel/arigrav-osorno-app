import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  try {
    const hasUrl = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
    const hasKey = Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    );

    // Tomamos 1 id de ejemplo
    const { data: sample, error } = await supabase
      .from("guias")
      .select("id")
      .limit(1);

    return NextResponse.json({
      ok: true,
      hasUrl,
      hasKey,
      supabaseError: error
        ? { message: error.message, details: error.details, hint: error.hint, code: error.code }
        : null,
      sample: sample ?? [],
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, message: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}