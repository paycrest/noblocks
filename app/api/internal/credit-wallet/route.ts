import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase";
import * as ethers from "ethers";

/**
 * Minimal, idempotent internal credit endpoint (stubbed).
 * Protect with x-internal-auth = process.env.INTERNAL_API_KEY
 * Expected body:
 * {
 *   idempotency_key: string,
 *   wallet_address: string,
 *   amount: number, // integer, micro-units (USDC = 6dp)
 *   currency: string,
 *   referral_id?: string | number,
 *   reason?: string,
 *   metadata?: Record<string, any>
 * }
 */
export const POST = async (request: NextRequest) => {
    const internalAuth = process.env.INTERNAL_API_KEY;
    const headerAuth = request.headers.get("x-internal-auth");

    if (!internalAuth || headerAuth !== internalAuth) {
        return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    let body: any;
    try {
        body = await request.json();
    } catch (err) {
        return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
    }

    const {
        idempotency_key,
        wallet_address,
        amount,
        currency = "USDC",
        referral_id,
        reason,
        metadata,
    } = body || {};

    if (!idempotency_key || !wallet_address || typeof amount !== "number") {
        return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 });
    }

    try {
        // Check for existing credit by idempotency_key
        const { data: existing } = await supabaseAdmin
            .from("credits")
            .select("*")
            .eq("idempotency_key", idempotency_key)
            .limit(1)
            .single();

        if (existing) {
            return NextResponse.json({ success: true, data: existing });
        }

        const now = new Date().toISOString();
        const basePayload: any = {
            referral_id: referral_id || null,
            idempotency_key,
            wallet_address: wallet_address.toLowerCase(),
            amount_micro: amount,
            currency,
            status: "pending",
            external_tx: null,
            reason: reason || "credit",
            metadata: metadata || null,
            created_at: now,
            updated_at: now,
        };

        // Insert pending record (idempotency_key is UNIQUE in migration). Handle race with select on conflict.
        let created: any = null;
        try {
            const insertRes = await supabaseAdmin
                .from("credits")
                .insert(basePayload)
                .select()
                .single();

            if (insertRes.error) throw insertRes.error;
            created = insertRes.data;
        } catch (insErr) {
            // If insertion failed due to unique constraint, try to fetch existing row
            console.warn("Insert error for credit row, attempting to fetch existing:", (insErr as any)?.message || insErr);
            const { data: existing2 } = await supabaseAdmin
                .from("credits")
                .select("*")
                .eq("idempotency_key", idempotency_key)
                .limit(1)
                .single();

            if (existing2) {
                return NextResponse.json({ success: true, data: existing2 });
            }

            console.error("Failed to insert or retrieve existing credit row:", insErr);
            return NextResponse.json({ success: false, error: "Failed to create credit record" }, { status: 500 });
        }

        // If hot wallet config present, perform on-chain ERC20 transfer
        const HOT_KEY = process.env.HOT_WALLET_PRIVATE_KEY;
        const RPC_URL = process.env.RPC_URL;
        const TOKEN_ADDRESS = process.env.TOKEN_CONTRACT_ADDRESS;
        const TOKEN_DECIMALS = Number(process.env.TOKEN_DECIMALS ?? 6);

        if (HOT_KEY && RPC_URL && TOKEN_ADDRESS) {
            try {
                const provider = new (ethers as any).providers.JsonRpcProvider(RPC_URL);
                const wallet = new (ethers as any).Wallet(HOT_KEY, provider);
                const erc20Abi = ["function transfer(address to, uint256 amount) public returns (bool)"];
                const contract = new (ethers as any).Contract(TOKEN_ADDRESS, erc20Abi, wallet);

                // amount is already in micro-units, convert to BigNumber
                const bnAmount = (ethers as any).BigNumber.from(amount.toString());
                const tx = await contract.transfer(wallet_address, bnAmount);
                const receipt = await tx.wait();

                // Update credits row as sent with tx hash
                const { error: updateErr } = await supabaseAdmin
                    .from("credits")
                    .update({ status: "sent", external_tx: receipt.transactionHash, updated_at: new Date().toISOString() })
                    .eq("id", created.id);

                if (updateErr) {
                    console.error("Failed to update credit row after transfer:", updateErr);
                }

                const { data: finalRow } = await supabaseAdmin.from("credits").select("*").eq("id", created.id).single();
                return NextResponse.json({ success: true, data: finalRow });
            } catch (txErr) {
                console.error("Transfer failed:", txErr);
                // mark row as failed
                try {
                    await supabaseAdmin
                        .from("credits")
                        .update({ status: "failed", error: String((txErr as any)?.message || txErr), updated_at: new Date().toISOString() })
                        .eq("id", created.id);
                } catch (markErr) {
                    console.error("Failed to mark credit as failed:", markErr);
                }
                return NextResponse.json({ success: false, error: "Transfer failed" }, { status: 500 });
            }
        }

        // No hot-wallet configured: mark as sent (stub)
        try {
            const { error: finalErr } = await supabaseAdmin
                .from("credits")
                .update({ status: "sent", external_tx: "stubbed-credit", updated_at: new Date().toISOString() })
                .eq("id", created.id);

            if (finalErr) {
                console.error("Failed to finalize stub credit row:", finalErr);
            }
            const { data: finalRow } = await supabaseAdmin.from("credits").select("*").eq("id", created.id).single();
            return NextResponse.json({ success: true, data: finalRow });
        } catch (finalizeErr) {
            console.error("Error finalizing stub credit:", finalizeErr);
            return NextResponse.json({ success: false, error: "Internal error finalizing credit" }, { status: 500 });
        }
    } catch (error) {
        console.error("Error in internal credit-wallet:", error);
        return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
    }
};
