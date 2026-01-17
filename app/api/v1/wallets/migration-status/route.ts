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

        // Handle specific error codes
        if (error) {
            // PGRST116 = no rows found (user has no smart wallet) - this is OK
            if (error.code === "PGRST116") {
                return NextResponse.json({
                    migrationCompleted: false,
                    status: "unknown",
                    hasSmartWallet: false
                });
            }

            // PGRST205 = table not found in schema cache (migration not run yet)
            if (error.code === "PGRST205") {
                console.warn("⚠️ Wallets table not found in schema cache. Migration may not be applied yet.");
                return NextResponse.json({
                    migrationCompleted: false,
                    status: "unknown",
                    hasSmartWallet: true, // Assume true to show banner
                    error: "Database schema not ready"
                }, { status: 200 }); // Return 200 so frontend doesn't break
            }

            // For other errors, log and return safe fallback
            console.error("Database query error:", error);
            return NextResponse.json({
                migrationCompleted: false,
                status: "unknown",
                hasSmartWallet: true, // Assume true to show banner on error
                error: error.message
            }, { status: 200 }); // Return 200 so frontend doesn't break
        }

        return NextResponse.json({
            migrationCompleted: data?.migration_completed ?? false,
            status: data?.status ?? "unknown",
            hasSmartWallet: !!data
        });
    } catch (error: any) {
        // Handle connection errors (DNS, network, etc.)
        const errorMessage = error?.message || String(error);
        const isConnectionError =
            errorMessage.includes("ENOTFOUND") ||
            errorMessage.includes("fetch failed") ||
            errorMessage.includes("ECONNREFUSED") ||
            errorMessage.includes("ETIMEDOUT");

        if (isConnectionError) {
            console.warn("⚠️ Database connection error, returning fallback response:", errorMessage);
            return NextResponse.json({
                migrationCompleted: false,
                status: "unknown",
                hasSmartWallet: true, // Assume true to show banner if DB is down
                error: "Database temporarily unavailable"
            }, { status: 200 }); // Return 200 so frontend doesn't break
        }

        console.error("Error checking migration status:", error);
        return NextResponse.json({
            error: error instanceof Error ? error.message : "Internal server error",
            migrationCompleted: false,
            status: "error",
            hasSmartWallet: true // Assume true to show banner on error
        }, { status: 200 }); // Return 200 so frontend doesn't break
    }
}