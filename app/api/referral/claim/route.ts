import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase";
import { withRateLimit } from "@/app/lib/rate-limit";
import {
    trackApiRequest,
    trackApiResponse,
    trackApiError,
    trackBusinessEvent,
} from "@/app/lib/server-analytics";
import { fetchKYCStatus } from "@/app/api/aggregator";
import { ethers } from "ethers"; // npm i ethers

// Minimal USDC ABI (for balanceOf and transfer)
const USDC_ABI = [
    "function balanceOf(address account) view returns (uint256)",
    "function transfer(address to, uint256 amount) public returns (bool)",
];

// Env vars (add to .env.local; use secrets in prod)
const FUNDING_ADDRESS = process.env.FUNDING_WALLET_ADDRESS!; // Hardcoded AA address, e.g., "0x..."
const FUNDING_PK = process.env.FUNDING_WALLET_PRIVATE_KEY; // PK for signing
const USDC_ADDR = process.env.USDC_CONTRACT_ADDRESS || "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"; // Mainnet USDC
const RPC_URL = process.env.RPC_URL || "https://mainnet.infura.io/v3/YOUR_KEY";
const DECIMALS = 6;

// Credit function (with balance check)
async function creditWallet(to: string, usd: number, refId: string): Promise<{ ok: boolean; txHash?: string; error?: string }> {
    if (!FUNDING_ADDRESS || !FUNDING_PK) return { ok: false, error: "Funding not configured (dev)" };

    try {
        const provider = new ethers.JsonRpcProvider(RPC_URL);
        const wallet = new ethers.Wallet(FUNDING_PK, provider);
        const contract = new ethers.Contract(USDC_ADDR, USDC_ABI, wallet);

        // Check balance first
        const required = ethers.parseUnits(usd.toFixed(DECIMALS), DECIMALS);
        const balance = await contract.balanceOf(FUNDING_ADDRESS);
        if (balance < required) {
            return { ok: false, error: `Insufficient funding balance: ${ethers.formatUnits(balance, DECIMALS)} USDC < $${usd}` };
        }

        // Transfer
        const tx = await contract.transfer(to, required, { gasLimit: 100_000 });
        const receipt = await tx.wait();

        console.log(`Credited $${usd} USDC from ${FUNDING_ADDRESS} to ${to} (ref ${refId}): ${receipt.hash}`);
        return { ok: true, txHash: receipt.hash };
    } catch (err) {
        console.error(`Credit failed for ${to}:`, err);
        return { ok: false, error: (err as Error).message };
    }
}

// POST handler (auto-credits on requirements)
export const POST = withRateLimit(async (request: NextRequest) => {
    const startTime = Date.now();

    try {
        const walletAddress = request.headers.get("x-wallet-address")?.toLowerCase();
        if (!walletAddress) {
            trackApiError(request, "/api/referral/claim", "POST", new Error("Unauthorized"), 401);
            return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
        }

        trackApiRequest(request, "/api/referral/claim", "POST", { wallet_address: walletAddress });

        // Find pending referral
        const { data: referral, error: refErr } = await supabaseAdmin
            .from("referrals")
            .select("*")
            .eq("referred_wallet_address", walletAddress)
            .eq("status", "pending")
            .single();

        if (refErr && refErr.code !== "PGRST116") throw refErr;
        if (!referral) {
            return NextResponse.json({ success: false, error: "No pending referral" }, { status: 404 });
        }

        // KYC check (both parties)
        const [refKyc, refdKyc] = await Promise.all([
            fetchKYCStatus(referral.referrer_wallet_address),
            fetchKYCStatus(walletAddress),
        ]);

        if (refKyc?.data?.status !== "verified" || refdKyc?.data?.status !== "verified") {
            return NextResponse.json({ success: false, error: "KYC required for referrer/referred" }, { status: 400 });
        }

        // Tx volume check ($100 total)
        const { data: txs, error: txErr } = await supabaseAdmin
            .from("transactions")
            .select("amount_usd, amount_received, status, created_at")
            .eq("wallet_address", walletAddress)
            .eq("status", "completed")
            .order("created_at");

        if (txErr) throw txErr;
        if (!txs?.length) {
            return NextResponse.json({ success: false, error: "No completed txs" }, { status: 400 });
        }

        const totalUsd = txs.reduce((sum, t) => sum + Number(t.amount_usd || t.amount_received || 0), 0);
        if (totalUsd < 100) {
            return NextResponse.json({ success: false, error: `Total tx volume $${totalUsd.toFixed(2)} < $100` }, { status: 400 });
        }

        // Lock: pending -> processing
        const { data: proc, error: procErr } = await supabaseAdmin
            .from("referrals")
            .update({ status: "processing" })
            .eq("id", referral.id)
            .eq("status", "pending")
            .select();

        if (procErr) throw procErr;
        if (!proc?.length) return NextResponse.json({ success: false, error: "Already processing" }, { status: 409 });

        // Auto-credit $1 each (with balance check)
        const reward = referral.reward_amount || 1.0;
        const [refCredit, refdCredit] = await Promise.all([
            creditWallet(referral.referrer_wallet_address, reward, referral.id),
            creditWallet(walletAddress, reward, referral.id),
        ]);

        if (!refCredit.ok || !refdCredit.ok) {
            // Rollback
            await supabaseAdmin.from("referrals").update({ status: "pending" }).eq("id", referral.id);
            return NextResponse.json({ success: false, error: "Credit failed—try later" }, { status: 500 });
        }

        // Finalize: earned
        await supabaseAdmin.from("referrals").update({ status: "earned", completed_at: new Date().toISOString() }).eq("id", referral.id);

        trackApiResponse("/api/referral/claim", "POST", 200, Date.now() - startTime, { wallet_address: walletAddress });
        trackBusinessEvent("Referral Claimed", { referral_id: referral.id, reward });

        return NextResponse.json({
            success: true,
            data: {
                message: "Rewards credited!",
                txHashes: { referrer: refCredit.txHash, referred: refdCredit.txHash }
            }
        });
    } catch (error) {
        console.error("Referral claim error:", error);
        trackApiError(request, "/api/referral/claim", "POST", error as Error, 500);
        return NextResponse.json({ success: false, error: "Claim failed" }, { status: 500 });
    }
});