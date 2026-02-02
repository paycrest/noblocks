import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase";

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const userId = searchParams.get("userId");

        if (!userId) {
            return NextResponse.json({ error: "User ID required" }, { status: 400 });
        }

        // Check if user has completed migration
        const { data, error } = await supabaseAdmin
            .from("wallets")
            .select("migration_completed, status, wallet_type")
            .eq("user_id", userId)
            .eq("wallet_type", "smart_contract")
            .single();

        if (error && error.code !== "PGRST116") { // PGRST116 = no rows found
            throw error;
        }

        return NextResponse.json({
            migrationCompleted: data?.migration_completed ?? false,
            status: data?.status ?? "unknown",
            hasSmartWallet: !!data
        });
    } catch (error) {
        console.error("Error checking migration status:", error);
        return NextResponse.json({
            error: "Internal server error",
            migrationCompleted: false,
            status: "unknown",
            hasSmartWallet: false
        }, { status: 500 });
    }
}