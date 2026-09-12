// Columns from the officers table that are safe to hand back to API
// clients. Deliberately omits `password_hash` (a credential) and the
// Face++ matching internals (`face_token`, `face_confidence`), which no
// client needs. Keep this list in sync when adding officer columns.
export const OFFICER_PUBLIC_COLUMNS = [
  "id",
  "officer_id",
  "full_name",
  "email",
  "role",
  "department",
  "position",
  "phone_number",
  "is_active",
  "face_image_path",
  "face_image_url",
  "created_at",
  "updated_at",
  "last_login",
].join(",")

type OfficerLite = { officer_id: string; full_name: string | null; department: string | null }

/**
 * Look up officers by a mixed list of identifiers and return a map that
 * resolves EITHER the business `officer_id` (e.g. "P/012/2025") OR the
 * internal `id` (uuid) to the officer. Older attendance rows stored the
 * uuid in their `officer_id` column, so views that join on it must
 * tolerate both.
 */
export async function resolveOfficers(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  ids: string[]
): Promise<Record<string, OfficerLite>> {
  const unique = Array.from(new Set(ids.filter(Boolean)))
  if (unique.length === 0) return {}

  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const uuids = unique.filter((v) => uuidRe.test(v))
  const filters = [`officer_id.in.(${unique.join(",")})`]
  if (uuids.length > 0) filters.push(`id.in.(${uuids.join(",")})`)

  const { data } = await supabase
    .from("officers")
    .select("id, officer_id, full_name, department")
    .or(filters.join(","))

  const map: Record<string, OfficerLite> = {}
  for (const o of data ?? []) {
    const lite: OfficerLite = {
      officer_id: o.officer_id,
      full_name: o.full_name ?? null,
      department: o.department ?? null,
    }
    if (o.officer_id) map[o.officer_id] = lite
    if (o.id) map[o.id] = lite
  }
  return map
}
