"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useStorage } from "../context/StorageContext";
import { usePrivy } from "@privy-io/react-auth";

type UploadedFile = {
  name: string;
  url: string;
  type: string;
  cid: string;
};

export default function Home() {
  const storage = useStorage();
  const { ready, authenticated, login } = usePrivy();
  const [uploads, setUploads] = useState<UploadedFile[]>([]);
  const [file, setFile] = useState<File>();
  const [uploading, setUploading] = useState(false);
  const [testingTransaction, setTestingTransaction] = useState(false);
  const [lastTransactionCid, setLastTransactionCid] = useState<string>("");

  // Load uploads from localStorage on mount
  useEffect(() => {
    const savedUploads = localStorage.getItem("pinata-uploads");
    if (savedUploads) {
      setUploads(JSON.parse(savedUploads));
    }
  }, []);

  // Save uploads to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem("pinata-uploads", JSON.stringify(uploads));
  }, [uploads]);

  const uploadFile = async () => {
    try {
      if (!file) {
        toast.error("Please select a file first");
        return;
      }

      setUploading(true);
      const data = new FormData();
      data.set("file", file);

      const uploadRequest = await fetch("/api/files", {
        method: "POST",
        body: data,
      });

      if (!uploadRequest.ok) {
        const error = await uploadRequest.json();
        throw new Error(error.message || "Upload failed");
      }

      const response = await uploadRequest.json();

      // Add to uploads history
      setUploads((prev) => [
        {
          name: file.name,
          url: response.url || response,
          type: file.type,
          cid: response.cid || "Unknown",
        },
        ...prev,
      ]);

      toast.success("File uploaded successfully!");
      setFile(undefined);

      // Reset the file input
      const fileInput = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;
      if (fileInput) fileInput.value = "";
    } catch (e) {
      console.error("Upload error:", e);
      toast.error(e instanceof Error ? e.message : "Failed to upload file");
    } finally {
      setUploading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target?.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
    }
  };

  const renderPreview = (file: File | undefined) => {
    if (!file) return null;

    if (file.type.startsWith("image/")) {
      return (
        <div className="mt-4 rounded-lg border border-gray-200 p-4">
          <p className="mb-2 text-sm text-gray-600">Preview:</p>
          <img
            src={URL.createObjectURL(file)}
            alt="Preview"
            className="max-h-48 rounded-lg object-contain"
          />
        </div>
      );
    }

    return (
      <div className="mt-4 rounded-lg border border-gray-200 p-4">
        <p className="text-sm text-gray-600">Selected file:</p>
        <p className="mt-1 font-medium">{file.name}</p>
        <p className="text-sm text-gray-500">
          {(file.size / 1024 / 1024).toFixed(2)} MB
        </p>
      </div>
    );
  };

  const renderUploadedFile = (upload: UploadedFile) => {
    if (upload.type.startsWith("image/")) {
      return (
        <div
          key={upload.cid}
          className="overflow-hidden rounded-lg border border-gray-200 bg-white p-4"
        >
          <img
            src={upload.url}
            alt={upload.name}
            className="mb-2 max-h-48 w-full rounded-lg object-cover"
          />
          <p className="truncate font-medium">{upload.name}</p>
          <p className="mt-1 truncate text-sm text-gray-500">
            CID: {upload.cid}
          </p>
          <a
            href={upload.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block text-sm text-blue-500 hover:text-blue-700"
          >
            View full size
          </a>
        </div>
      );
    }

    return (
      <div
        key={upload.cid}
        className="rounded-lg border border-gray-200 bg-white p-4"
      >
        <p className="font-medium">{upload.name}</p>
        <p className="mt-1 text-sm text-gray-500">CID: {upload.cid}</p>
        <a
          href={upload.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-block text-sm text-blue-500 hover:text-blue-700"
        >
          Download file
        </a>
      </div>
    );
  };

  const testTransactionData = async () => {
    if (!ready || !authenticated) {
      toast.error("Please connect your wallet first");
      return;
    }

    if (!storage?.save || !storage.isInitialized) {
      toast.error("Storage not initialized");
      return;
    }

    try {
      setTestingTransaction(true);

      // Create a test transaction
      const testData = {
        id: Math.random().toString(36).substring(7),
        timestamp: new Date().toISOString(),
        amount: (Math.random() * 1000).toFixed(2),
        currency: "USDC",
        recipient:
          "0x" +
          Array(40)
            .fill(0)
            .map(() => Math.floor(Math.random() * 16).toString(16))
            .join(""),
      };

      // Save the test transaction
      const cid = await storage.save("test-transaction", testData);
      setLastTransactionCid(cid);
      toast.success("Test transaction saved successfully!");

      // Try to retrieve it
      const retrieved = await storage.retrieve("test-transaction");
      console.log("Retrieved test transaction:", retrieved);

      if (JSON.stringify(retrieved) === JSON.stringify(testData)) {
        toast.success("✅ Transaction retrieval successful and data matches!");
      } else {
        toast.error("❌ Retrieved data doesn't match original!");
      }
    } catch (error) {
      console.error("Transaction test error:", error);
      toast.error(error instanceof Error ? error.message : "Test failed");
    } finally {
      setTestingTransaction(false);
    }
  };

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-t-4 border-gray-200 border-t-blue-500"></div>
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="mb-6 text-2xl font-bold">IPFS Testing Dashboard</h1>

      {/* File Upload Section */}
      <div className="mb-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-xl font-semibold">File Upload Test</h2>
        <div className="mb-4">
          <label
            htmlFor="file-upload"
            className="mb-2 block text-sm font-medium text-gray-700"
          >
            Choose a file to upload
          </label>
          <input
            id="file-upload"
            name="file-upload"
            type="file"
            onChange={handleChange}
            disabled={uploading}
            aria-label="File upload input"
            title="Select a file to upload to IPFS"
            className="block w-full cursor-pointer rounded-lg border border-gray-200 text-sm focus:outline-none"
          />
        </div>

        {renderPreview(file)}

        <button
          type="button"
          onClick={uploadFile}
          disabled={uploading || !file}
          className="mt-4 rounded-lg bg-blue-500 px-4 py-2 font-medium text-white transition-colors hover:bg-blue-600 disabled:opacity-50"
        >
          {uploading ? (
            <span className="flex items-center gap-2">
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Uploading...
            </span>
          ) : (
            "Upload to IPFS"
          )}
        </button>
      </div>

      {/* Transaction Data Test Section */}
      <div className="mb-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-xl font-semibold">Transaction Data Test</h2>
        {!authenticated ? (
          <div className="text-center">
            <p className="mb-4 text-gray-600">
              Connect your wallet to test encrypted transaction storage
            </p>
            <button
              onClick={login}
              className="rounded-lg bg-blue-500 px-4 py-2 font-medium text-white transition-colors hover:bg-blue-600"
            >
              Connect Wallet
            </button>
          </div>
        ) : (
          <div>
            <button
              onClick={testTransactionData}
              disabled={testingTransaction || storage?.isLoading}
              className="rounded-lg bg-green-500 px-4 py-2 font-medium text-white transition-colors hover:bg-green-600 disabled:opacity-50"
            >
              {testingTransaction ? (
                <span className="flex items-center gap-2">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Testing Transaction...
                </span>
              ) : (
                "Test Transaction Data"
              )}
            </button>
            {lastTransactionCid && (
              <div className="mt-4 rounded-lg border border-gray-100 bg-gray-50 p-4">
                <p className="text-sm text-gray-600">Last Transaction CID:</p>
                <p className="mt-1 break-all font-mono text-sm">
                  {lastTransactionCid}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Uploaded Files Section */}
      {uploads.length > 0 && (
        <div>
          <h2 className="mb-4 text-xl font-semibold">Uploaded Files</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {uploads.map(renderUploadedFile)}
          </div>
        </div>
      )}
    </main>
  );
}
