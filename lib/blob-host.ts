// The public host of a Vercel Blob store, from its read-write token
// "vercel_blob_rw_<storeId>_<secret>". No imports, so next.config.ts can use
// it.
export function blobHostForToken(token: string): string | null {
  const storeId = token.split("_")[3];
  return storeId && /^[A-Za-z0-9]+$/.test(storeId)
    ? `${storeId.toLowerCase()}.public.blob.vercel-storage.com`
    : null;
}
