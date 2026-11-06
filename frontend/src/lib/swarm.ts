/**
 * Swarm Decentralized Storage Client.
 * Connects directly to the live Ethereum Swarm public gateway (https://api.gateway.ethswarm.org/bzz)
 * and synchronizes with SlotPay backend storage for local verification.
 */

import { API_BASE_URL } from "./api";

export const SWARM_API_GATEWAY = "https://api.gateway.ethswarm.org";
export const SWARM_WEB_GATEWAY = "https://gateway.ethswarm.org";

export interface SwarmUploadResult {
  reference: string;
  swarmRef: string;
  gatewayUrl: string;
  webPreviewUrl: string;
  isLiveNetwork: boolean;
}

/**
 * Upload actual file bytes to Swarm:
 * 1. Pushes the real raw payload directly to live Swarm Bee gateway (POST /bzz).
 * 2. Backs it up to the local SlotPay storage router so you can read and verify it.
 */
export async function uploadToSwarm(fileOrData: File | string): Promise<SwarmUploadResult> {
  let liveReference: string | null = null;
  let isLive = false;

  const filename = typeof fileOrData === "string" ? "document.txt" : fileOrData.name;
  const contentType = typeof fileOrData === "string" ? "text/plain" : (fileOrData.type || "application/octet-stream");

  // 1. Direct upload to live Swarm Bee network gateway
  try {
    const swarmRes = await fetch(`${SWARM_API_GATEWAY}/bzz`, {
      method: "POST",
      headers: {
        "Content-Type": contentType,
      },
      body: fileOrData,
    });

    if (swarmRes.ok || swarmRes.status === 201) {
      const data = await swarmRes.json();
      if (data.reference) {
        liveReference = data.reference;
        isLive = true;
        console.log("[SlotPay] Real Swarm Network upload successful! Hash:", liveReference);
      }
    }
  } catch (err) {
    console.warn("[SlotPay] Swarm public gateway network notice:", err);
  }

  // 2. Sync file with local backend storage (and persist with live reference)
  let localReference = liveReference;
  try {
    const headers: Record<string, string> = {
      "x-filename": filename,
      "content-type": contentType,
    };
    if (liveReference) {
      headers["x-swarm-ref"] = liveReference;
    }
    const backendRes = await fetch(`${API_BASE_URL}/api/swarm/upload`, {
      method: "POST",
      headers,
      body: fileOrData,
    });

    if (backendRes.ok) {
      const backendJson = await backendRes.json();
      if (!localReference) {
        localReference = backendJson.reference;
      }
    }
  } catch (err) {
    console.warn("[SlotPay] Backend upload sync notice:", err);
  }

  // If both live network and backend were contacted, use the live reference
  const finalRef = (liveReference || localReference || "").replace(/^0x/, "");

  if (!finalRef) {
    throw new Error("Failed to store file on Swarm");
  }

  return {
    reference: finalRef,
    swarmRef: `bzz://${finalRef}`,
    gatewayUrl: `${SWARM_API_GATEWAY}/bzz/${finalRef}`,
    webPreviewUrl: `${SWARM_WEB_GATEWAY}/bzz/${finalRef}`,
    isLiveNetwork: isLive,
  };
}

/**
 * Download or read raw document content by Swarm hash.
 */
export async function downloadFromSwarm(reference: string): Promise<string> {
  const cleanRef = reference.replace(/^0x/, "").replace(/^bzz:\/\//, "");

  // 1. Try local cache first for instant retrieval
  try {
    const localRes = await fetch(`${API_BASE_URL}/api/swarm/${cleanRef}`);
    if (localRes.ok) return await localRes.text();
  } catch {}

  // 2. Fetch from Swarm public gateway
  const swarmRes = await fetch(`${SWARM_API_GATEWAY}/bzz/${cleanRef}`);
  if (swarmRes.ok) return await swarmRes.text();

  throw new Error(`Unable to download Swarm reference ${cleanRef}`);
}
