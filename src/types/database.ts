/**
 * Hand-authored placeholder matching the Phase 0 migration.
 *
 * Once a Supabase project exists, regenerate this file from the real schema
 * and replace this file entirely:
 *
 *   npx supabase gen types typescript --project-id <ref> > src/types/database.ts
 */

export type AppRole = 'admin' | 'recruiter' | 'marketing' | 'viewer'

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          full_name: string
          role: AppRole
          active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          full_name: string
          role?: AppRole
          active?: boolean
        }
        Update: {
          full_name?: string
          role?: AppRole
          active?: boolean
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
  }
}
