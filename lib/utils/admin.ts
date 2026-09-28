import { DecodedIdToken } from "@/lib/db-admin"

/**
 * Server-side check: verify that the Firebase ID token belongs to an admin.
 *
 * The token is sent from the client (via getIdToken) and verified server-side
 * using the Firebase Admin SDK. The user document in Firestore must have
 * `role === "admin"`.
 *
 * @returns the decoded token (with uid) if admin, otherwise throws.
 */
export async function verifyAdminToken(
  token: string
): Promise<DecodedIdToken> {
  // Dynamic import so this file can be imported in contexts where admin
  // may not be initialized (e.g. type-only imports).
  const admin = (await import("@/lib/db-admin")).default
  const decoded = await admin.auth().verifyIdToken(token)

  const userSnap = await admin
    .firestore()
    .collection("users")
    .doc(decoded.uid)
    .get()

  const role = userSnap.exists ? userSnap.data()?.role : undefined

  if (role !== "admin") {
    const err: any = new Error("Unauthorized: admin access required")
    err.status = 403
    throw err
  }

  return decoded
}
