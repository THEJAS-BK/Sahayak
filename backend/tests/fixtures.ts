import crypto from 'node:crypto'
import { pool } from '../src/database/pool.js'
import { sentEmails } from '../src/modules/notifications/email.js'

export interface CreatedUser {
  id: string
  email: string
  role: 'senior' | 'volunteer' | 'police' | null
  is_active: boolean
}

/**
 * Inserts a user directly (used to provision police accounts, approved
 * seniors/volunteers, etc.). A non-null role implies an active account.
 */
export async function createUser(
  overrides: { email?: string; role?: 'senior' | 'volunteer' | 'police'; isActive?: boolean } = {},
): Promise<CreatedUser> {
  const email = overrides.email ?? `user-${crypto.randomUUID()}@example.com`
  const role = overrides.role ?? null
  const isActive = overrides.isActive ?? role !== null
  const res = await pool.query(
    'INSERT INTO users (email, role, is_active) VALUES ($1, $2, $3) RETURNING id, email, role, is_active',
    [email, role, isActive],
  )
  const r = res.rows[0]
  return { id: r.id, email: r.email, role: r.role, is_active: r.is_active }
}

export function clearSentEmails(): void {
  sentEmails.length = 0
}

/** Returns the 6-digit OTP from the most recently "sent" email. */
export function lastOtpCode(): string {
  const last = sentEmails[sentEmails.length - 1]
  if (!last) throw new Error('No OTP email captured')
  const match = last.text.match(/\d{6}/)
  if (!match) throw new Error(`No 6-digit code in email text: ${last.text}`)
  return match[0]
}

export async function otpCount(email: string): Promise<number> {
  const res = await pool.query<{ n: number }>('SELECT count(*)::int AS n FROM otp_codes WHERE email = $1', [email])
  return res.rows[0].n
}

export async function createApprovedSenior(overrides: { email?: string; full_name?: string; phone_number?: string } = {}): Promise<CreatedUser> {
  const user = await createUser({ email: overrides.email, role: 'senior', isActive: true })
  await pool.query(
    `INSERT INTO user_verifications (user_id, role, form_data, status) VALUES ($1, 'senior', '{}', 'APPROVED')`,
    [user.id],
  )
  await pool.query(
    `INSERT INTO senior_profiles (user_id, full_name, phone_number, home_latitude, home_longitude)
     VALUES ($1, $2, $3, 12.97, 77.59)`,
    [user.id, overrides.full_name ?? 'Test Senior', overrides.phone_number ?? '+919999900001'],
  )
  return user
}

export async function createApprovedVolunteer(overrides: {
  email?: string
  full_name?: string
  is_available?: boolean
  base_latitude?: number
  base_longitude?: number
  current_latitude?: number | null
  current_longitude?: number | null
  skills?: string[]
} = {}): Promise<CreatedUser> {
  const user = await createUser({ email: overrides.email, role: 'volunteer', isActive: true })
  await pool.query(
    `INSERT INTO user_verifications (user_id, role, form_data, status) VALUES ($1, 'volunteer', '{}', 'APPROVED')`,
    [user.id],
  )
  await pool.query(
    `INSERT INTO volunteer_profiles
      (user_id, full_name, phone_number, base_latitude, base_longitude, current_latitude, current_longitude, is_available, skills)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      user.id,
      overrides.full_name ?? 'Vol ' + user.id.slice(0, 4),
      '+919800000000',
      overrides.base_latitude ?? 12.97,
      overrides.base_longitude ?? 77.59,
      overrides.current_latitude ?? null,
      overrides.current_longitude ?? null,
      overrides.is_available ?? true,
      JSON.stringify(overrides.skills ?? []),
    ],
  )
  return user
}