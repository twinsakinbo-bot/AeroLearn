/**
 * The Firebase-Storage-shaped API, backed by Supabase Storage.
 *
 * One call site: the receipt upload on /app/upgrade. Everything lands in the
 * private `receipts` bucket, where policy allows a student to write only under
 * their own uid prefix (see supabase/migrations/0001_init.sql).
 */
import { getSupabase } from "@/lib/supabase/client"

const BUCKET = "receipts"

/** How long a returned receipt link stays valid. Admins re-open these from the
 *  verification queue, so it has to outlast a review sitting in a tab. */
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7

export const storage = { __aerolearn: "supabase-storage" } as const

export function getStorage(): typeof storage {
  return storage
}

export interface StorageReference {
  readonly bucket: string
  readonly path: string
  readonly fullPath: string
  readonly name: string
}

/**
 * `ref(storage, "receipts/<uid>/file.png")`. A leading bucket name is tolerated
 * so the existing path strings keep working unchanged.
 */
export function ref(_storage: unknown, path: string): StorageReference {
  const clean = path.replace(/^\/+/, "")
  const inBucket = clean.startsWith(`${BUCKET}/`) ? clean.slice(BUCKET.length + 1) : clean
  return {
    bucket: BUCKET,
    path: inBucket,
    fullPath: `${BUCKET}/${inBucket}`,
    name: inBucket.split("/").pop() ?? inBucket,
  }
}

export async function uploadBytes(
  target: StorageReference,
  data: Blob | File | ArrayBuffer | Uint8Array,
  metadata: { contentType?: string } = {},
): Promise<{ ref: StorageReference }> {
  const { error } = await getSupabase()
    .storage.from(target.bucket)
    .upload(target.path, data, {
      contentType: metadata.contentType || "application/octet-stream",
      upsert: false,
    })

  if (error) throw new Error(`Could not upload ${target.name}: ${error.message}`)
  return { ref: target }
}

/**
 * The bucket is private, so this is a signed URL rather than Firebase's
 * permanent download token. Anyone without a policy match cannot read the object
 * even with the path.
 */
export async function getDownloadURL(target: StorageReference): Promise<string> {
  const { data, error } = await getSupabase()
    .storage.from(target.bucket)
    .createSignedUrl(target.path, SIGNED_URL_TTL_SECONDS)

  if (error || !data?.signedUrl) {
    throw new Error(`Could not link to ${target.name}: ${error?.message ?? "no URL returned"}`)
  }
  return data.signedUrl
}

export async function deleteObject(target: StorageReference): Promise<void> {
  const { error } = await getSupabase().storage.from(target.bucket).remove([target.path])
  if (error) throw new Error(`Could not delete ${target.name}: ${error.message}`)
}
