import { pinata } from "@/app/lib/pinata-config";
import { NextResponse, type NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const data = await request.formData();
    const file: File | null = data.get("file") as unknown as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const { cid } = await pinata.upload.public.file(file);
    const url = await pinata.gateways.public.convert(cid);

    return NextResponse.json({ url, cid }, { status: 200 });
  } catch (e) {
    console.error("Pinata upload error:", e);
    return NextResponse.json(
      { error: "Failed to upload file to IPFS" },
      { status: 500 },
    );
  }
}
