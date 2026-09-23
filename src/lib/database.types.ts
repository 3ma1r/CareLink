export type Database = {
  public: {
    Tables: {
      devices: {
        Row: { id:string; device_identifier:string; display_name:string|null; device_model:string; provisioned_at:string; paired_patient_id:string|null; paired_at:string|null; last_contact_at:string|null; firmware_version:string|null; status:string; created_at:string; updated_at:string }
        Insert: never; Update: never; Relationships: []
      }
      device_measurements: {
        Row: { id:number; device_id:string; message_id:string; measured_at:string; received_at:string; heart_rate:number|null; spo2:number|null; sensor_temperature:number|null; movement:number|null; latitude:number|null; longitude:number|null; gps_fix_at:string|null; quality:string; heart_rate_quality:string|null; spo2_quality:string|null; temperature_quality:string|null; confirmed_fall:boolean; battery_percent:number|null; created_at:string }
        Insert: never; Update: never; Relationships: []
      }
      care_alerts: {
        Row: {
          id:string; patient_id:string; device_id:string; source_measurement_id:number
          rule_id:string; rule_version:number; alert_type:'vital'|'fall'
          metric:'heart_rate'|'spo2'|'temperature'|'fall'
          severity:'moderate'|'high'|'critical'; title:string; message:string
          observed_value:number|null; unit:string|null; measurement_quality:'good'|'not_applicable'
          threshold_metadata:Record<string,unknown>; measurement_at:string
          first_triggered_at:string; last_seen_at:string; occurrence_count:number
          status:'active'|'acknowledged'|'resolved'; acknowledged_at:string|null
          acknowledged_by:string|null; resolved_at:string|null; created_at:string; updated_at:string
        }
        Insert: never
        Update: { status?: 'acknowledged'|'resolved' }
        Relationships: []
      }
      profiles: {
        Row: { id: string; full_name: string; phone: string | null; created_at: string; updated_at: string }
        Insert: { id: string; full_name: string; phone?: string | null }
        Update: { full_name?: string; phone?: string | null }
        Relationships: []
      }
      patients: {
        Row: {
          id: string; caregiver_id: string; full_name: string; date_of_birth: string
          gender: string | null; emergency_contact_name: string | null
          emergency_contact_phone: string | null; health_notes: string | null
          avatar_path: string | null; created_at: string; updated_at: string
        }
        Insert: {
          id?: string; caregiver_id: string; full_name: string; date_of_birth: string
          gender?: string | null; emergency_contact_name?: string | null
          emergency_contact_phone?: string | null; health_notes?: string | null
          avatar_path?: string | null
        }
        Update: {
          full_name?: string; date_of_birth?: string; gender?: string | null
          emergency_contact_name?: string | null; emergency_contact_phone?: string | null
          health_notes?: string | null; avatar_path?: string | null
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
