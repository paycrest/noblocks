import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase";
import { getPrivyClient } from "@/app/lib/privy";

export async function GET(request: NextRequest) {
    try {
        const authHeader = request.headers.get("Authorization");
        const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

        if (!token) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        let authenticatedUserId: string;
        try {
            const privy = getPrivyClient();
            const claims = await privy.verifyAuthToken(token);
            authenticatedUserId = claims.userId;
        } catch {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const userId = searchParams.get("userId");

        if (!userId) {
            return NextResponse.json({ error: "User ID required" }, { status: 400 });
        }

        if (userId !== authenticatedUserId) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const { data, error } = await supabaseAdmin
            .from("wallets")
            .select("migration_completed, status, wallet_type")
            .eq("user_id", userId)
            .eq("wallet_type", "smart_contract")
            .single();

        if (error) {
            // PGRST116 = no rows found — user has no smart wallet, not an error
            if (error.code === "PGRST116") {
                return NextResponse.json({
                    migrationCompleted: false,
                    status: "unknown",
                    hasSmartWallet: false,
                });
            }

            // PGRST205 = table not found in schema cache — migration not applied yet
            if (error.code === "PGRST205") {
                console.warn(
                    "⚠️ Wallets table not found in schema cache. Migration may not be applied yet."
                );

                return NextResponse.json({
                    migrationCompleted: false,
                    status: "schema_unavailable",
                    hasSmartWallet: false,
                    error: "Database schema not ready",
                });
            }

            console.error("Database query error:", error);
            return NextResponse.json({
                migrationCompleted: false,
                status: "error",
                hasSmartWallet: false,
                error: error.message,
            });
        }

        return NextResponse.json({
            migrationCompleted: data?.migration_completed ?? false,
            status: data?.status ?? "unknown",
            hasSmartWallet: !!data,
        });

    } catch (error: unknown) {
        const errorMessage =
            error instanceof Error ? error.message : String(error);

        const isConnectionError =
            errorMessage.includes("ENOTFOUND") ||
            errorMessage.includes("fetch failed") ||
            errorMessage.includes("ECONNREFUSED") ||
            errorMessage.includes("ETIMEDOUT");

        if (isConnectionError) {
            console.warn(
                "⚠️ Database connection error, returning fallback response:",
                errorMessage
            );
            return NextResponse.json({
                migrationCompleted: false,
                status: "db_unavailable",
                hasSmartWallet: false,
                error: "Database temporarily unavailable",
            });
        }

        console.error("Unexpected error in migration-status route:", error);
        return NextResponse.json({
            migrationCompleted: false,
            status: "error",
            hasSmartWallet: false,
            error: errorMessage || "Internal server error",
        }, { status: 500 });
    }
}