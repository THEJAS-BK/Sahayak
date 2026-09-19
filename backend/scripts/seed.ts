import 'dotenv/config'
import { pool, withTransaction, type Queryable } from '../src/database/pool.js'
import { logger } from '../src/lib/logger.js'

const FRESH = process.argv.includes('--fresh')

const ALL_TABLES = [
  'emergency_events',
  'audit_logs',
  'help_requests',
  'refresh_tokens',
  'otp_codes',
  'otp_attempts',
  'user_verifications',
  'senior_profiles',
  'volunteer_profiles',
  'users',
]

const minAgo = (m: number) => new Date(Date.now() - m * 60_000)
const hrsAgo = (h: number) => minAgo(h * 60)
const daysAgo = (d: number) => hrsAgo(d * 24)

interface SeniorSeed {
  key: string
  email: string
  full_name: string
  phone_number: string
  home_latitude: number
  home_longitude: number
  preferred_language: 'kannada' | 'english' | 'tulu'
  aadhaar_number: string
  emergency_contact: { name: string; phone: string; relation: string }
  fcm_token: string
  registered_at: Date
}

interface VolunteerSeed {
  key: string
  email: string
  full_name: string
  phone_number: string
  organization: string
  skills: string[]
  id_proof_ref: string
  aadhaar_number: string
  club_id: string | null
  base_latitude: number
  base_longitude: number
  current_latitude: number | null
  current_longitude: number | null
  location_updated_at: Date | null
  is_available: boolean
}

interface PendingSeed {
  email: string
  role: 'senior' | 'volunteer'
  form_data: Record<string, unknown>
  fcm_token: string
  submitted_at: Date
}

interface RequestSeed {
  key: string
  senior: string
  category: string
  description: string
  details: Record<string, unknown> | null
  latitude: number
  longitude: number
  priority: 'normal' | 'urgent'
  source: 'voice_agent' | 'flutter_app'
  status: string
  volunteer?: string
  dispatch_attempt?: number
  dispatched_at?: Date
  dispatch_batch?: Array<{ volunteer: string; latitude: number; longitude: number; distance_m: number }>
  accepted_at?: Date
  completed_at?: Date
  cancelled_at?: Date
  created_at: Date
}

interface EmergencySeed {
  key: string
  senior: string
  trigger_type: 'semantic_llm' | 'acoustic_distress' | 'keyword_repetition'
  source: 'voice_agent' | 'flutter_app'
  help_request?: string
  detail: Record<string, unknown> | null
  latitude: number | null
  longitude: number | null
  escalated_to_112: boolean
  status: 'LOGGED' | 'REVIEWED'
  created_at: Date
}

const POLICE = {
  email: 'ashok.kini@example.com',
  full_name: 'Officer Ashok Kini',
}

const SENIORS: SeniorSeed[] = [
  {
    key: 'anitha',
    email: 'anitha.dev@example.com',
    full_name: 'Anitha Devi',
    phone_number: '+919876500001',
    home_latitude: 13.161,
    home_longitude: 74.883,
    preferred_language: 'kannada',
    aadhaar_number: '234567890123',
    emergency_contact: { name: 'Ramesh Devi', phone: '+919876500011', relation: 'son' },
    fcm_token: 'senior-fcm-token-anitha',
    registered_at: daysAgo(2),
  },
  {
    key: 'lakshmi',
    email: 'lakshmi.shetty@example.com',
    full_name: 'Lakshmi Shetty',
    phone_number: '+919876500002',
    home_latitude: 13.3409,
    home_longitude: 74.7421,
    preferred_language: 'tulu',
    aadhaar_number: '345678901234',
    emergency_contact: { name: 'Dinesh Shetty', phone: '+919876500012', relation: 'son-in-law' },
    fcm_token: 'senior-fcm-token-lakshmi',
    registered_at: daysAgo(47),
  },
  {
    key: 'ravi',
    email: 'ravi.kumar@example.com',
    full_name: 'Ravi Kumar',
    phone_number: '+919876500003',
    home_latitude: 13.3522,
    home_longitude: 74.7928,
    preferred_language: 'english',
    aadhaar_number: '456789012345',
    emergency_contact: { name: 'Priya Kumar', phone: '+919876500013', relation: 'daughter' },
    fcm_token: 'senior-fcm-token-ravi',
    registered_at: daysAgo(65),
  },
  {
    key: 'meenakshi',
    email: 'meenakshi.bhat@example.com',
    full_name: 'Meenakshi Bhat',
    phone_number: '+919876500004',
    home_latitude: 13.2222,
    home_longitude: 74.738,
    preferred_language: 'kannada',
    aadhaar_number: '567890123456',
    emergency_contact: { name: 'Suresh Bhat', phone: '+919876500014', relation: 'son' },
    fcm_token: 'senior-fcm-token-meenakshi',
    registered_at: daysAgo(60),
  },
  {
    key: 'ganesh',
    email: 'ganesh.rao@example.com',
    full_name: 'Ganesh Rao',
    phone_number: '+919876500005',
    home_latitude: 13.5276,
    home_longitude: 74.7406,
    preferred_language: 'kannada',
    aadhaar_number: '678901234567',
    emergency_contact: { name: 'Kavitha Rao', phone: '+919876500015', relation: 'wife' },
    fcm_token: 'senior-fcm-token-ganesh',
    registered_at: daysAgo(39),
  },
]

const VOLUNTEERS: VolunteerSeed[] = [
  {
    key: 'karthik',
    email: 'karthik.shetty@example.com',
    full_name: 'Karthik Shetty',
    phone_number: '+919876500021',
    organization: 'Udupi Red Cross',
    skills: ['nursing', 'first_aid'],
    id_proof_ref: 'KRL-2024-00452',
    aadhaar_number: '456712389045',
    club_id: 'CLUB-UD-001',
    base_latitude: 13.3522,
    base_longitude: 74.7928,
    current_latitude: 13.3486,
    current_longitude: 74.7859,
    location_updated_at: minAgo(20),
    is_available: true,
  },
  {
    key: 'sunitha',
    email: 'sunitha.rai@example.com',
    full_name: 'Sunitha Rai',
    phone_number: '+919876500022',
    organization: 'Manipal Rotary Club',
    skills: ['first_aid', 'driving'],
    id_proof_ref: 'MNP-2023-00981',
    aadhaar_number: '789012345678',
    club_id: null,
    base_latitude: 13.3368,
    base_longitude: 74.7466,
    current_latitude: null,
    current_longitude: null,
    location_updated_at: null,
    is_available: true,
  },
  {
    key: 'prashanth',
    email: 'prashanth.kamath@example.com',
    full_name: 'Prashanth Kamath',
    phone_number: '+919876500023',
    organization: 'St. Mary\'s Helping Hands',
    skills: ['medical', 'first_aid'],
    id_proof_ref: 'SMB-2023-01455',
    aadhaar_number: '890123456789',
    club_id: null,
    base_latitude: 13.3295,
    base_longitude: 74.7621,
    current_latitude: null,
    current_longitude: null,
    location_updated_at: null,
    is_available: true,
  },
  {
    key: 'divya',
    email: 'divya.poojary@example.com',
    full_name: 'Divya Poojary',
    phone_number: '+919876500024',
    organization: 'Kaup Youth Volunteers',
    skills: ['first_aid', 'medical'],
    id_proof_ref: 'KUP-2024-00773',
    aadhaar_number: '678945609812',
    club_id: null,
    base_latitude: 13.2222,
    base_longitude: 74.738,
    current_latitude: 13.2245,
    current_longitude: 74.7401,
    location_updated_at: minAgo(30),
    is_available: true,
  },
]

const PENDING: PendingSeed[] = [
  {
    email: 'pooja.hegde@example.com',
    role: 'senior',
    form_data: {
      full_name: 'Pooja Hegde',
      phone_number: '+919876500031',
      home_latitude: 13.2986,
      home_longitude: 74.711,
      preferred_language: 'kannada',
      aadhaar_number: '901234567890',
      emergency_contact: { name: 'Arun Hegde', phone: '+919876500041', relation: 'son' },
    },
    fcm_token: 'senior-fcm-token-pooja',
    submitted_at: hrsAgo(5),
  },
  {
    email: 'manjunath.salian@example.com',
    role: 'volunteer',
    form_data: {
      full_name: 'Manjunath Salian',
      phone_number: '+919876500032',
      organization: 'Kundapur Seva Trust',
      skills: ['first_aid'],
      base_latitude: 13.214,
      base_longitude: 74.69,
      id_proof_ref: 'KST-2024-02311',
      aadhaar_number: '012345678901',
    },
    fcm_token: 'volunteer-fcm-token-manjunath',
    submitted_at: hrsAgo(1),
  },
  {
    email: 'rekha.naik@example.com',
    role: 'senior',
    form_data: {
      full_name: 'Rekha Naik',
      phone_number: '+919876500033',
      home_latitude: 13.3661,
      home_longitude: 74.8166,
      preferred_language: 'kannada',
      aadhaar_number: '111213141516',
      emergency_contact: { name: 'Vijay Naik', phone: '+919876500043', relation: 'nephew' },
    },
    fcm_token: 'senior-fcm-token-rekha',
    submitted_at: daysAgo(2),
  },
]

const REQUESTS: RequestSeed[] = [
  {
    key: 'req-1024',
    senior: 'anitha',
    category: 'grocery_assistance',
    description: 'Need help buying groceries for the week',
    details: { items: ['milk', 'vegetables', 'rice', 'oil'] },
    latitude: 13.1625,
    longitude: 74.885,
    priority: 'normal',
    source: 'voice_agent',
    status: 'IN_PROGRESS',
    volunteer: 'karthik',
    dispatch_attempt: 1,
    dispatched_at: minAgo(94),
    accepted_at: minAgo(80),
    created_at: minAgo(95),
  },
  {
    key: 'req-1023',
    senior: 'lakshmi',
    category: 'medical_assistance',
    description: 'Sudden chest pain, needs a ride to KMC Hospital',
    details: { symptoms: ['chest pain', 'breathlessness'] },
    latitude: 13.3421,
    longitude: 74.745,
    priority: 'urgent',
    source: 'voice_agent',
    status: 'DISPATCHED',
    dispatch_attempt: 1,
    dispatched_at: minAgo(69),
    dispatch_batch: [
      { volunteer: 'karthik', latitude: 13.3486, longitude: 74.7859, distance_m: 820 },
      { volunteer: 'divya', latitude: 13.2245, longitude: 74.7401, distance_m: 2140 },
    ],
    created_at: minAgo(70),
  },
  {
    key: 'req-1022',
    senior: 'ravi',
    category: 'transport_assistance',
    description: 'Need transport to the bank in Udupi',
    details: { errand: 'visiting HDFC branch, Manipal' },
    latitude: 13.3531,
    longitude: 74.7912,
    priority: 'normal',
    source: 'flutter_app',
    status: 'DISPATCHED',
    dispatch_attempt: 1,
    dispatched_at: minAgo(119),
    dispatch_batch: [
      { volunteer: 'sunitha', latitude: 13.3368, longitude: 74.7466, distance_m: 2310 },
      { volunteer: 'prashanth', latitude: 13.3295, longitude: 74.7621, distance_m: 2850 },
    ],
    created_at: minAgo(120),
  },
  {
    key: 'req-1021',
    senior: 'meenakshi',
    category: 'medical_assistance',
    description: 'Fever since two days, needs checkup',
    details: null,
    latitude: 13.2241,
    longitude: 74.7362,
    priority: 'urgent',
    source: 'voice_agent',
    status: 'MATCHING',
    dispatch_attempt: 1,
    created_at: minAgo(180),
  },
  {
    key: 'req-1020',
    senior: 'ganesh',
    category: 'grocery_assistance',
    description: 'Weekly groceries, medicines from pharmacy',
    details: { items: ['lentils', 'onions', 'blood pressure tablets'] },
    latitude: 13.5288,
    longitude: 74.7418,
    priority: 'normal',
    source: 'flutter_app',
    status: 'PENDING',
    created_at: minAgo(210),
  },
  {
    key: 'req-1010',
    senior: 'anitha',
    category: 'medical_assistance',
    description: 'Need a ride to the clinic for a check-up',
    details: { facility: 'Shirva PHC' },
    latitude: 13.1618,
    longitude: 74.8827,
    priority: 'urgent',
    source: 'flutter_app',
    status: 'COMPLETED',
    volunteer: 'sunitha',
    created_at: daysAgo(6),
    completed_at: minAgo(6 * 24 * 60 - 85),
  },
  {
    key: 'req-0981',
    senior: 'ravi',
    category: 'transport_assistance',
    description: 'Ride to the temple for a family function',
    details: null,
    latitude: 13.3509,
    longitude: 74.7938,
    priority: 'normal',
    source: 'flutter_app',
    status: 'COMPLETED',
    volunteer: 'prashanth',
    created_at: daysAgo(10),
    completed_at: minAgo(10 * 24 * 60 - 55),
  },
  {
    key: 'req-0972',
    senior: 'meenakshi',
    category: 'grocery_assistance',
    description: 'Groceries and ration delivery',
    details: null,
    latitude: 13.223,
    longitude: 74.7375,
    priority: 'normal',
    source: 'voice_agent',
    status: 'COMPLETED',
    volunteer: 'divya',
    created_at: daysAgo(15),
    completed_at: minAgo(15 * 24 * 60 - 80),
  },
  {
    key: 'req-0965',
    senior: 'ganesh',
    category: 'transport_assistance',
    description: 'Ride to Brahmavar post office',
    details: null,
    latitude: 13.5292,
    longitude: 74.7426,
    priority: 'normal',
    source: 'flutter_app',
    status: 'COMPLETED',
    volunteer: 'karthik',
    created_at: daysAgo(21),
    completed_at: minAgo(21 * 24 * 60 - 45),
  },
  {
    key: 'req-0958',
    senior: 'lakshmi',
    category: 'grocery_assistance',
    description: 'Monthly grocery run',
    details: null,
    latitude: 13.3402,
    longitude: 74.7438,
    priority: 'normal',
    source: 'voice_agent',
    status: 'COMPLETED',
    volunteer: 'sunitha',
    created_at: daysAgo(28),
    completed_at: minAgo(28 * 24 * 60 - 90),
  },
  {
    key: 'req-0944',
    senior: 'anitha',
    category: 'medical_assistance',
    description: 'Routine blood pressure check',
    details: null,
    latitude: 13.1609,
    longitude: 74.8833,
    priority: 'normal',
    source: 'voice_agent',
    status: 'COMPLETED',
    volunteer: 'prashanth',
    created_at: daysAgo(37),
    completed_at: minAgo(37 * 24 * 60 - 45),
  },
  {
    key: 'req-0975',
    senior: 'meenakshi',
    category: 'grocery_assistance',
    description: 'Emergency groceries - no longer needed',
    details: null,
    latitude: 13.2237,
    longitude: 74.7361,
    priority: 'normal',
    source: 'flutter_app',
    status: 'CANCELLED',
    created_at: daysAgo(13),
    cancelled_at: minAgo(13 * 24 * 60 - 30),
  },
  {
    key: 'req-0968',
    senior: 'ganesh',
    category: 'transport_assistance',
    description: 'Ride to Udupi D.C. office, no volunteer found',
    details: null,
    latitude: 13.5266,
    longitude: 74.7402,
    priority: 'urgent',
    source: 'voice_agent',
    status: 'UNASSIGNED',
    dispatch_attempt: 3,
    created_at: daysAgo(19),
  },
]

const EMERGENCIES: EmergencySeed[] = [
  {
    key: 'evt-0001',
    senior: 'anitha',
    trigger_type: 'acoustic_distress',
    source: 'voice_agent',
    help_request: 'req-1024',
    detail: { keywords: ['help', 'pain', 'alone'] },
    latitude: 13.161,
    longitude: 74.883,
    escalated_to_112: true,
    status: 'LOGGED',
    created_at: minAgo(96),
  },
  {
    key: 'evt-0002',
    senior: 'ravi',
    trigger_type: 'semantic_llm',
    source: 'voice_agent',
    help_request: 'req-1010',
    detail: { intent: 'medical_emergency', confidence: 0.92 },
    latitude: 13.3522,
    longitude: 74.7928,
    escalated_to_112: true,
    status: 'REVIEWED',
    created_at: daysAgo(6),
  },
  {
    key: 'evt-0003',
    senior: 'meenakshi',
    trigger_type: 'keyword_repetition',
    source: 'flutter_app',
    help_request: undefined,
    detail: { repeat_phrase: 'please help' },
    latitude: null,
    longitude: null,
    escalated_to_112: true,
    status: 'LOGGED',
    created_at: daysAgo(3),
  },
]

type IdMap = Record<string, string>

async function insertUser(
  db: Queryable,
  email: string,
  role: 'senior' | 'volunteer' | 'police',
  createdAt: Date,
  fcmToken: string | null = null,
): Promise<{ id: string; verificationId?: string }> {
  const user = await db.query(
    `INSERT INTO users (email, role, is_active, fcm_token, created_at, updated_at)
     VALUES ($1, $2, true, $3, $4, $4)
     RETURNING id`,
    [email, role, fcmToken, createdAt],
  )
  return { id: user.rows[0].id }
}

async function seedPolice(db: Queryable): Promise<IdMap> {
  await db.query(
    `INSERT INTO users (email, role, is_active, created_at, updated_at)
     VALUES ($1, 'police', true, $2, $2)
     RETURNING id`,
    [POLICE.email, daysAgo(120)],
  )
  const res = await db.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [POLICE.email])
  return { police: res.rows[0].id }
}

async function seedSeniors(db: Queryable, policeId: string): Promise<IdMap> {
  const ids: IdMap = {}
  for (const s of SENIORS) {
    const user = await db.query(
      `INSERT INTO users (email, role, is_active, fcm_token, created_at, updated_at)
       VALUES ($1, 'senior', true, $2, $3, $3)
       RETURNING id`,
      [s.email, s.fcm_token, s.registered_at],
    )
    const userId = user.rows[0].id
    const verifiedAt = new Date(s.registered_at.getTime() + 15 * 60_000)
    const verification = await db.query(
      `INSERT INTO user_verifications (user_id, role, form_data, fcm_token, status, reviewed_by, reviewed_at, created_at, updated_at)
       VALUES ($1, 'senior', $2, $3, 'APPROVED', $4, $5, $6, $6)
       RETURNING id`,
      [
        userId,
        JSON.stringify({
          full_name: s.full_name,
          phone_number: s.phone_number,
          home_latitude: s.home_latitude,
          home_longitude: s.home_longitude,
          preferred_language: s.preferred_language,
          aadhaar_number: s.aadhaar_number,
          emergency_contact: s.emergency_contact,
        }),
        s.fcm_token,
        policeId,
        verifiedAt,
        s.registered_at,
      ],
    )
    await db.query(
      `INSERT INTO senior_profiles
        (user_id, full_name, phone_number, home_latitude, home_longitude, preferred_language, aadhaar_number, emergency_contact, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)`,
      [
        userId,
        s.full_name,
        s.phone_number,
        s.home_latitude,
        s.home_longitude,
        s.preferred_language,
        s.aadhaar_number,
        JSON.stringify(s.emergency_contact),
        s.registered_at,
      ],
    )
    ids[s.key] = userId
    ids[`ver:${s.key}`] = verification.rows[0].id
  }
  return ids
}

async function seedVolunteers(db: Queryable, policeId: string): Promise<IdMap> {
  const ids: IdMap = {}
  const registeredAt = daysAgo(90)
  for (const v of VOLUNTEERS) {
    const user = await db.query(
      `INSERT INTO users (email, role, is_active, fcm_token, created_at, updated_at)
       VALUES ($1, 'volunteer', true, $2, $3, $3)
       RETURNING id`,
      [v.email, `volunteer-fcm-token-${v.key}`, registeredAt],
    )
    const userId = user.rows[0].id
    const verifiedAt = new Date(registeredAt.getTime() + 10 * 60_000)
    const verification = await db.query(
      `INSERT INTO user_verifications (user_id, role, form_data, fcm_token, status, reviewed_by, reviewed_at, created_at, updated_at)
       VALUES ($1, 'volunteer', $2, $3, 'APPROVED', $4, $5, $6, $6)
       RETURNING id`,
      [
        userId,
        JSON.stringify({
          full_name: v.full_name,
          phone_number: v.phone_number,
          organization: v.organization,
          skills: v.skills,
          base_latitude: v.base_latitude,
          base_longitude: v.base_longitude,
          id_proof_ref: v.id_proof_ref,
          aadhaar_number: v.aadhaar_number,
          club_id: v.club_id,
        }),
        `volunteer-fcm-token-${v.key}`,
        policeId,
        verifiedAt,
        registeredAt,
      ],
    )
    await db.query(
      `INSERT INTO volunteer_profiles
        (user_id, full_name, phone_number, organization, skills, id_proof_ref, aadhaar_number, club_id,
         base_latitude, base_longitude, current_latitude, current_longitude, location_updated_at, is_available, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $15)`,
      [
        userId,
        v.full_name,
        v.phone_number,
        v.organization,
        JSON.stringify(v.skills),
        v.id_proof_ref,
        v.aadhaar_number,
        v.club_id,
        v.base_latitude,
        v.base_longitude,
        v.current_latitude,
        v.current_longitude,
        v.location_updated_at,
        v.is_available,
        registeredAt,
      ],
    )
    ids[v.key] = userId
    ids[`ver:${v.key}`] = verification.rows[0].id
  }
  return ids
}

async function seedPending(db: Queryable): Promise<IdMap> {
  const ids: IdMap = {}
  for (let i = 0; i < PENDING.length; i++) {
    const p = PENDING[i]
    const user = await db.query(
      `INSERT INTO users (email, role, is_active, fcm_token, created_at, updated_at)
       VALUES ($1, NULL, false, $2, $3, $3)
       RETURNING id`,
      [p.email, p.fcm_token, p.submitted_at],
    )
    const userId = user.rows[0].id
    const verification = await db.query(
      `INSERT INTO user_verifications (user_id, role, form_data, fcm_token, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'PENDING', $5, $5)
       RETURNING id`,
      [userId, p.role, JSON.stringify(p.form_data), p.fcm_token, p.submitted_at],
    )
    ids[`pending:${i}`] = userId
    ids[`ver:pending:${i}`] = verification.rows[0].id
  }
  return ids
}

async function seedRequests(db: Queryable, seniors: IdMap, volunteers: IdMap): Promise<IdMap> {
  const ids: IdMap = {}
  for (const r of REQUESTS) {
    const batch = r.dispatch_batch?.map((b) => ({
      id: volunteers[b.volunteer],
      latitude: b.latitude,
      longitude: b.longitude,
      distance_m: b.distance_m,
    }))
    const res = await db.query(
      `INSERT INTO help_requests
        (senior_id, category, description, details, latitude, longitude, priority, source, status,
         assigned_volunteer_id, dispatch_attempt, dispatched_at, dispatch_batch, accepted_at, completed_at, cancelled_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
       RETURNING id`,
      [
        seniors[r.senior],
        r.category,
        r.description,
        r.details === null ? null : JSON.stringify(r.details),
        r.latitude,
        r.longitude,
        r.priority,
        r.source,
        r.status,
        r.volunteer ? volunteers[r.volunteer] : null,
        r.dispatch_attempt ?? 0,
        r.dispatched_at ?? null,
        batch === undefined ? null : JSON.stringify(batch),
        r.accepted_at ?? null,
        r.completed_at ?? null,
        r.cancelled_at ?? null,
        r.created_at,
      ],
    )
    ids[r.key] = res.rows[0].id
  }
  return ids
}

async function seedEmergencies(db: Queryable, seniors: IdMap, requests: IdMap): Promise<IdMap> {
  const ids: IdMap = {}
  for (const e of EMERGENCIES) {
    const res = await db.query(
      `INSERT INTO emergency_events
        (senior_id, trigger_type, source, help_request_id, detail, latitude, longitude, escalated_to_112, escalated_at, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id`,
      [
        seniors[e.senior],
        e.trigger_type,
        e.source,
        e.help_request ? requests[e.help_request] : null,
        e.detail === null ? null : JSON.stringify(e.detail),
        e.latitude,
        e.longitude,
        e.escalated_to_112,
        e.created_at,
        e.status,
        e.created_at,
        e.created_at,
      ],
    )
    ids[e.key] = res.rows[0].id
  }
  return ids
}

async function seedAuditLogs(
  db: Queryable,
  ids: {
    police: string
    seniors: IdMap
    volunteers: IdMap
    verifications: IdMap
    requests: IdMap
    emergencies: IdMap
  },
): Promise<void> {
  const rows: Array<[string | null, string, string, string, Record<string, unknown> | null, Record<string, unknown> | null, Record<string, unknown> | null, Date]> = [
    [null, 'request.dispatched', 'help_request', ids.requests['req-1023'], null, null, { attempt: 1, batch_size: 2 }, minAgo(69)],
    [ids.police, 'verification.approved', 'user_verification', ids.verifications['ver:karthik'], null, null, { role: 'volunteer', reason: null }, minAgo(95)],
    [ids.volunteers['karthik'], 'request.accepted', 'help_request', ids.requests['req-1024'], { status: 'DISPATCHED' }, { status: 'ACCEPTED', assigned_volunteer_id: ids.volunteers['karthik'] }, null, minAgo(80)],
    [null, 'request.dispatched', 'help_request', ids.requests['req-1024'], null, null, { attempt: 1, batch_size: 2 }, minAgo(94)],
    [ids.seniors['anitha'], 'request.created', 'help_request', ids.requests['req-1024'], null, { status: 'PENDING', source: 'voice_agent' }, null, minAgo(95)],
    [ids.seniors['anitha'], 'emergency.logged', 'emergency_event', ids.emergencies['evt-0001'], null, { status: 'LOGGED', escalated_to_112: true }, null, minAgo(96)],
    [ids.seniors['anitha'], 'registration.senior.submitted', 'user_verification', ids.verifications['ver:anitha'], null, { role: 'senior', status: 'PENDING' }, null, daysAgo(2)],
    [ids.police, 'emergency.reviewed', 'emergency_event', ids.emergencies['evt-0002'], { status: 'LOGGED' }, { status: 'REVIEWED' }, null, daysAgo(6)],
    [ids.seniors['meenakshi'], 'request.cancelled', 'help_request', ids.requests['req-0975'], { status: 'PENDING' }, { status: 'CANCELLED' }, null, daysAgo(13)],
  ]

  for (const [actorId, action, entityType, entityId, before, after, metadata, createdAt] of rows) {
    await db.query(
      `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, before, after, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        actorId,
        action,
        entityType,
        entityId,
        before === null ? null : JSON.stringify(before),
        after === null ? null : JSON.stringify(after),
        metadata === null ? null : JSON.stringify(metadata),
        createdAt,
      ],
    )
  }
}

async function ensureSeeded(db: Queryable): Promise<void> {
  const res = await db.query('SELECT count(*)::int AS n FROM users')
  const rowCount = res.rows[0].n
  if (rowCount === 0) return
  if (FRESH) {
    await db.query(`TRUNCATE TABLE ${ALL_TABLES.join(', ')} CASCADE`)
    return
  }
  throw new Error(
    'Database already contains data. Re-run with `--fresh` to wipe existing tables and reseed.',
  )
}

async function main(): Promise<void> {
  await withTransaction(async (db) => {
    await ensureSeeded(db)

    const police = await seedPolice(db)
    const seniors = await seedSeniors(db, police.police)
    const volunteers = await seedVolunteers(db, police.police)
    const pending = await seedPending(db)
    const requests = await seedRequests(db, seniors, volunteers)
    const emergencies = await seedEmergencies(db, seniors, requests)

    const verificationIds: IdMap = {}
    for (const [k, v] of Object.entries(seniors)) if (k.startsWith('ver:')) verificationIds[k] = v
    for (const [k, v] of Object.entries(volunteers)) if (k.startsWith('ver:')) verificationIds[k] = v
    for (const [k, v] of Object.entries(pending)) if (k.startsWith('ver:')) verificationIds[k] = v

    await seedAuditLogs(db, {
      police: police.police,
      seniors,
      volunteers,
      verifications: verificationIds,
      requests,
      emergencies,
    })

    return { police, seniors, volunteers, pending, requests, emergencies }
  })

  const counts = await pool.query<{ users: string; seniors: string; volunteers: string; requests: string; emergencies: string; pending: string }>(
    `SELECT
       (SELECT count(*)::text FROM users) AS users,
       (SELECT count(*)::text FROM senior_profiles) AS seniors,
       (SELECT count(*)::text FROM volunteer_profiles) AS volunteers,
       (SELECT count(*)::text FROM help_requests) AS requests,
       (SELECT count(*)::text FROM emergency_events) AS emergencies,
       (SELECT count(*)::text FROM user_verifications WHERE status = 'PENDING') AS pending`,
  )
  logger.info('Seed complete:', counts.rows[0])
}

main().catch((err) => {
  logger.error('Seeding failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})