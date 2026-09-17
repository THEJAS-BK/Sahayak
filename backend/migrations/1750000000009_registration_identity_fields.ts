import type { MigrationBuilder } from 'node-pg-migrate'

export const up = (pgm: MigrationBuilder): void => {
  pgm.addColumn('senior_profiles', {
    aadhaar_number: { type: 'text', notNull: true, default: '' },
  })
  pgm.addColumn('volunteer_profiles', {
    aadhaar_number: { type: 'text', notNull: true, default: '' },
    club_id: { type: 'text' },
  })
}

export const down = (pgm: MigrationBuilder): void => {
  pgm.dropColumn('volunteer_profiles', 'club_id')
  pgm.dropColumn('volunteer_profiles', 'aadhaar_number')
  pgm.dropColumn('senior_profiles', 'aadhaar_number')
}