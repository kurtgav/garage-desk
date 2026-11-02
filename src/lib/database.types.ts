
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "customers": {
                  Row: {
                    "created_at": string,"email": string | null,"full_name": string,"id": string,"phone": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"email"?: string | null,"full_name": string,"id"?: string,"phone": string
                  }
                  Update: {
                    "created_at"?: string,"email"?: string | null,"full_name"?: string,"id"?: string,"phone"?: string
                  }
                  Relationships: [
                    
                  ]
                },"job_events": {
                  Row: {
                    "actor_id": string | null,"actor_name": string,"actor_type": Database["public"]['Enums']["actor_type"],"channel": Database["public"]['Enums']["approval_channel"] | null,"created_at": string,"from_status": Database["public"]['Enums']["job_status"] | null,"id": number,"job_id": string,"note": string | null,"quote_version": number | null,"to_status": Database["public"]['Enums']["job_status"],"total_cents": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id"?: string | null,"actor_name": string,"actor_type": Database["public"]['Enums']["actor_type"],"channel"?: Database["public"]['Enums']["approval_channel"] | null,"created_at"?: string,"from_status"?: Database["public"]['Enums']["job_status"] | null,"id"?: never,"job_id": string,"note"?: string | null,"quote_version"?: number | null,"to_status": Database["public"]['Enums']["job_status"],"total_cents"?: number | null
                  }
                  Update: {
                    "actor_id"?: string | null,"actor_name"?: string,"actor_type"?: Database["public"]['Enums']["actor_type"],"channel"?: Database["public"]['Enums']["approval_channel"] | null,"created_at"?: string,"from_status"?: Database["public"]['Enums']["job_status"] | null,"id"?: never,"job_id"?: string,"note"?: string | null,"quote_version"?: number | null,"to_status"?: Database["public"]['Enums']["job_status"],"total_cents"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "job_events_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "job_events_job_id_fkey"
      columns: ["job_id"]
isOneToOne: false
      referencedRelation: "job_totals"
      referencedColumns: ["job_id"]
    },{
      foreignKeyName: "job_events_job_id_fkey"
      columns: ["job_id"]
isOneToOne: false
      referencedRelation: "jobs"
      referencedColumns: ["id"]
    }
                  ]
                },"job_line_items": {
                  Row: {
                    "created_at": string,"description": string,"id": string,"job_id": string,"kind": Database["public"]['Enums']["line_kind"],"line_total_cents": number | null,"quantity": number,"unit_price_cents": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"description": string,"id"?: string,"job_id": string,"kind": Database["public"]['Enums']["line_kind"],"line_total_cents"?: never,"quantity": number,"unit_price_cents": number
                  }
                  Update: {
                    "created_at"?: string,"description"?: string,"id"?: string,"job_id"?: string,"kind"?: Database["public"]['Enums']["line_kind"],"line_total_cents"?: never,"quantity"?: number,"unit_price_cents"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "job_line_items_job_id_fkey"
      columns: ["job_id"]
isOneToOne: false
      referencedRelation: "job_totals"
      referencedColumns: ["job_id"]
    },{
      foreignKeyName: "job_line_items_job_id_fkey"
      columns: ["job_id"]
isOneToOne: false
      referencedRelation: "jobs"
      referencedColumns: ["id"]
    }
                  ]
                },"job_links": {
                  Row: {
                    "created_at": string,"created_by": string,"id": string,"job_id": string,"last_viewed_at": string | null,"revoked_at": string | null,"token_hash": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by": string,"id"?: string,"job_id": string,"last_viewed_at"?: string | null,"revoked_at"?: string | null,"token_hash": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string,"id"?: string,"job_id"?: string,"last_viewed_at"?: string | null,"revoked_at"?: string | null,"token_hash"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "job_links_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "job_links_job_id_fkey"
      columns: ["job_id"]
isOneToOne: false
      referencedRelation: "job_totals"
      referencedColumns: ["job_id"]
    },{
      foreignKeyName: "job_links_job_id_fkey"
      columns: ["job_id"]
isOneToOne: false
      referencedRelation: "jobs"
      referencedColumns: ["id"]
    }
                  ]
                },"job_quotes": {
                  Row: {
                    "created_at": string,"created_by": string,"id": number,"job_id": string,"lines": NonNullable<Json>,"subtotal_cents": number,"total_cents": number,"vat_bps": number,"vat_cents": number,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by": string,"id"?: never,"job_id": string,"lines": NonNullable<Json>,"subtotal_cents": number,"total_cents": number,"vat_bps": number,"vat_cents": number,"version": number
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string,"id"?: never,"job_id"?: string,"lines"?: NonNullable<Json>,"subtotal_cents"?: number,"total_cents"?: number,"vat_bps"?: number,"vat_cents"?: number,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "job_quotes_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "job_quotes_job_id_fkey"
      columns: ["job_id"]
isOneToOne: false
      referencedRelation: "job_totals"
      referencedColumns: ["job_id"]
    },{
      foreignKeyName: "job_quotes_job_id_fkey"
      columns: ["job_id"]
isOneToOne: false
      referencedRelation: "jobs"
      referencedColumns: ["id"]
    }
                  ]
                },"jobs": {
                  Row: {
                    "approved_at": string | null,"approved_quote_version": number | null,"approved_subtotal_cents": number | null,"approved_total_cents": number | null,"approved_vat_cents": number | null,"assigned_mechanic_id": string,"collected_at": string | null,"created_at": string,"created_by": string,"description": string,"id": string,"quote_version": number | null,"quoted_at": string | null,"quoted_subtotal_cents": number | null,"quoted_total_cents": number | null,"quoted_vat_cents": number | null,"ref": string,"status": Database["public"]['Enums']["job_status"],"vat_bps": number,"vehicle_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "approved_at"?: string | null,"approved_quote_version"?: number | null,"approved_subtotal_cents"?: number | null,"approved_total_cents"?: number | null,"approved_vat_cents"?: number | null,"assigned_mechanic_id": string,"collected_at"?: string | null,"created_at"?: string,"created_by"?: string,"description": string,"id"?: string,"quote_version"?: number | null,"quoted_at"?: string | null,"quoted_subtotal_cents"?: number | null,"quoted_total_cents"?: number | null,"quoted_vat_cents"?: number | null,"ref"?: string,"status"?: Database["public"]['Enums']["job_status"],"vat_bps"?: number,"vehicle_id": string
                  }
                  Update: {
                    "approved_at"?: string | null,"approved_quote_version"?: number | null,"approved_subtotal_cents"?: number | null,"approved_total_cents"?: number | null,"approved_vat_cents"?: number | null,"assigned_mechanic_id"?: string,"collected_at"?: string | null,"created_at"?: string,"created_by"?: string,"description"?: string,"id"?: string,"quote_version"?: number | null,"quoted_at"?: string | null,"quoted_subtotal_cents"?: number | null,"quoted_total_cents"?: number | null,"quoted_vat_cents"?: number | null,"ref"?: string,"status"?: Database["public"]['Enums']["job_status"],"vat_bps"?: number,"vehicle_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "jobs_assigned_mechanic_id_fkey"
      columns: ["assigned_mechanic_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "jobs_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "jobs_vehicle_id_fkey"
      columns: ["vehicle_id"]
isOneToOne: false
      referencedRelation: "vehicles"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "about": string | null,"active": boolean,"avatar_path": string | null,"full_name": string,"id": string,"must_change_password": boolean,"phone": string | null,"role": Database["public"]['Enums']["staff_role"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "about"?: string | null,"active"?: boolean,"avatar_path"?: string | null,"full_name": string,"id": string,"must_change_password"?: boolean,"phone"?: string | null,"role": Database["public"]['Enums']["staff_role"],"updated_at"?: string
                  }
                  Update: {
                    "about"?: string | null,"active"?: boolean,"avatar_path"?: string | null,"full_name"?: string,"id"?: string,"must_change_password"?: boolean,"phone"?: string | null,"role"?: Database["public"]['Enums']["staff_role"],"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"rate_limits": {
                  Row: {
                    "count": number,"key": string,"window_start": string
                  }
                  ComputedFields: never
                  Insert: {
                    "count"?: number,"key": string,"window_start": string
                  }
                  Update: {
                    "count"?: number,"key"?: string,"window_start"?: string
                  }
                  Relationships: [
                    
                  ]
                },"settings": {
                  Row: {
                    "currency": string,"garage_address": string,"garage_name": string,"garage_phone": string,"hourly_rate_cents": number,"id": number,"timezone": string,"vat_bps": number
                  }
                  ComputedFields: never
                  Insert: {
                    "currency"?: string,"garage_address": string,"garage_name": string,"garage_phone": string,"hourly_rate_cents": number,"id"?: number,"timezone"?: string,"vat_bps"?: number
                  }
                  Update: {
                    "currency"?: string,"garage_address"?: string,"garage_name"?: string,"garage_phone"?: string,"hourly_rate_cents"?: number,"id"?: number,"timezone"?: string,"vat_bps"?: number
                  }
                  Relationships: [
                    
                  ]
                },"vehicles": {
                  Row: {
                    "customer_id": string,"id": string,"make": string,"model": string,"plate": string,"year": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "customer_id": string,"id"?: string,"make": string,"model": string,"plate": string,"year"?: number | null
                  }
                  Update: {
                    "customer_id"?: string,"id"?: string,"make"?: string,"model"?: string,"plate"?: string,"year"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "vehicles_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "job_totals": {
                  Row: {
                    "job_id": string,"subtotal_cents": number | null,"total_cents": number | null,"vat_cents": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                }
          }
          Functions: {
            "compute_job_totals":
{ Args: { "p_job_id": string }; Returns: {
              "subtotal_cents": number,"total_cents": number,"vat_cents": number
            }[]
                           },
"create_customer":
{ Args: { "p_email"?: string,"p_full_name": string,"p_make": string,"p_model": string,"p_phone": string,"p_plate": string,"p_year"?: number }; Returns: string
                           },
"create_job_link":
{ Args: { "p_job_id": string,"p_token_hash": string }; Returns: string
                           },
"get_dashboard":
{ Args: { "p_now"?: string }; Returns: Json
                           },
"public_job_by_token_hash":
{ Args: { "p_count_view"?: boolean,"p_token_hash": string }; Returns: Json
                           },
"rate_limit_hit":
{ Args: { "p_key": string,"p_max": number,"p_window_seconds": number }; Returns: boolean
                           },
"revoke_job_link":
{ Args: { "p_job_id": string }; Returns: boolean
                           },
"search_customers":
{ Args: { "p_query": string }; Returns: {
              "email": string,"full_name": string,"id": string,"phone": string,"vehicles": Json
            }[]
                           },
"set_staff_active":
{ Args: { "p_active": boolean,"p_profile_id": string }; Returns: undefined
                           },
"transition_job":
{ Args: { "p_expected_version"?: number,"p_job_id": string,"p_link_token_hash"?: string,"p_note"?: string,"p_to_status": Database["public"]['Enums']["job_status"] }; Returns: {
              "approved_at": string | null,
"approved_quote_version": number | null,
"approved_subtotal_cents": number | null,
"approved_total_cents": number | null,
"approved_vat_cents": number | null,
"assigned_mechanic_id": string,
"collected_at": string | null,
"created_at": string,
"created_by": string,
"description": string,
"id": string,
"quote_version": number | null,
"quoted_at": string | null,
"quoted_subtotal_cents": number | null,
"quoted_total_cents": number | null,
"quoted_vat_cents": number | null,
"ref": string,
"status": Database["public"]['Enums']["job_status"],
"vat_bps": number,
"vehicle_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "jobs"
        isOneToOne: true
        isSetofReturn: false
      } }
          }
          Enums: {
            "actor_type": "staff"|"customer","approval_channel": "link"|"phone","job_status": "new"|"quoted"|"declined"|"approved"|"in_progress"|"ready"|"collected"|"cancelled","line_kind": "labour"|"part","staff_role": "owner"|"mechanic"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "actor_type": ["staff", "customer"],"approval_channel": ["link", "phone"],"job_status": ["new", "quoted", "declined", "approved", "in_progress", "ready", "collected", "cancelled"],"line_kind": ["labour", "part"],"staff_role": ["owner", "mechanic"]
          }
        }
} as const
