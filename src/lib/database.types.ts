export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      locations: {
        Row: { id: string; name: string; pincode: string; display_name: string; created_at: string };
        Insert: { id?: string; name: string; pincode: string; created_at?: string };
        Update: { name?: string; pincode?: string };
      };
      roles: {
        Row: { id: string; code: string; label: string; can_post: boolean; can_moderate: boolean; created_at: string };
        Insert: never;
        Update: never;
      };
      user_roles: {
        Row: { id: string; user_id: string; role_id: string; created_at: string };
        Insert: { user_id: string; role_id: string };
        Update: never;
      };
      profiles: {
        Row: {
          id: string;
          name: string | null;
          phone: string | null;
          gender: string | null;
          email: string | null;
          email_verified_at: string | null;
          job_type: string | null;
          location_id: string | null;
          area: string | null;
          about: string | null;
          status_text: string | null;
          avatar_url: string | null;
          date_of_birth: string | null;
          profile_completed_at: string | null;
          can_post: boolean;
          push_notifications_enabled: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['profiles']['Row']> & { id: string };
        Update: Partial<Database['public']['Tables']['profiles']['Row']>;
      };
      push_tokens: {
        Row: { id: string; user_id: string; expo_push_token: string; created_at: string };
        Insert: { id?: string; user_id: string; expo_push_token: string; created_at?: string };
        Update: { user_id?: string; expo_push_token?: string };
      };
      posts: {
        Row: {
          id: string;
          location_id: string;
          author_id: string;
          category: string;
          title: string | null;
          body: string | null;
          media_urls: string[];
          approved_at: string | null;
          view_count: number;
          like_count: number;
          share_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['posts']['Row'], 'id' | 'view_count' | 'like_count' | 'share_count' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Database['public']['Tables']['posts']['Row']>;
      };
      comments: {
        Row: { id: string; post_id: string; author_id: string; body: string; parent_id: string | null; like_count: number; approved_at: string | null; created_at: string };
        Insert: { post_id: string; author_id: string; body: string; parent_id?: string | null };
        Update: { approved_at?: string | null; like_count?: number };
      };
      comment_likes: {
        Row: { comment_id: string; user_id: string; created_at: string };
        Insert: { comment_id: string; user_id: string };
        Update: never;
      };
      reuse_items: {
        Row: {
          id: string;
          location_id: string;
          seller_id: string;
          title: string;
          description: string | null;
          mrp: number;
          selling_price: number;
          delivery_option: string;
          delivery_charge: number;
          media_urls: string[];
          approved_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['reuse_items']['Row'], 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Database['public']['Tables']['reuse_items']['Row']>;
      };
      local_events: {
        Row: {
          id: string;
          location_id: string;
          submitted_by: string;
          title: string;
          description: string | null;
          event_date: string;
          event_location: string | null;
          organizer_name: string | null;
          contact_number: string | null;
          image_url: string | null;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['local_events']['Row'], 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Database['public']['Tables']['local_events']['Row']>;
      };
      emergency_contacts: {
        Row: {
          id: string;
          location_id: string | null;
          category: string;
          name: string;
          phone: string;
          display_order: number;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['emergency_contacts']['Row'], 'id' | 'created_at'> & { id?: string };
        Update: Partial<Database['public']['Tables']['emergency_contacts']['Row']>;
      };
    };
  };
}
