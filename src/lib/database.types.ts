export type Database = {
  public: {
    Tables: {
      personalized_baselines: {
        Row: {
          id:string; patient_id:string; device_id:string
          metric:'heart_rate'|'spo2'|'temperature'; readiness:'learning'|'ready'
          sample_count:number; required_sample_count:number
          distinct_day_count:number; required_day_count:number
          coverage_hours:number; required_coverage_hours:number
          baseline_median:number|null; median_absolute_deviation:number|null
          robust_scale:number|null; baseline_window_start:string|null
          baseline_window_end:string|null; baseline_excluded_before:string
          latest_evaluation_state:'learning'|'usual'|'unusual'|'insufficient_recent_data'|null
          latest_recent_sample_count:number|null; latest_evaluated_at:string|null
          algorithm_version:string; calculated_at:string; updated_at:string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      personalized_insights: {
        Row: {
          id:string; patient_id:string; device_id:string
          metric:'heart_rate'|'spo2'|'temperature'; direction:'higher'|'lower'
          status:'active'|'resolved'; confidence:'low'|'moderate'|'high'
          evaluation_window_start:string; evaluation_window_end:string
          baseline_sample_count:number; recent_sample_count:number
          baseline_median:number; recent_median:number; deviation:number
          robust_score:number; direction_consistency:number
          first_observed_at:string; last_observed_at:string; occurrence_count:number
          first_source_measurement_id:number; last_source_measurement_id:number
          first_evaluation_id:string; last_evaluation_id:string
          resolved_at:string|null; algorithm_version:string
          created_at:string; updated_at:string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          id:string; caregiver_id:string; endpoint:string; p256dh:string; auth_key:string
          device_label:string|null; active:boolean; last_successful_delivery_at:string|null
          failure_count:number; revoked_at:string|null; created_at:string; updated_at:string
        }
        Insert: never
        Update: never
        Relationships: []
      }
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
