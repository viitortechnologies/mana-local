export type LocationId = string;

export interface Location {
  id: LocationId;
  name: string;
  pincode: string;
  display_name: string;
}

export type RoleCode = 'admin' | 'community_member' | 'moderator' | 'delivery_partner' | 'reviewer';

export interface Role {
  id: string;
  code: RoleCode;
  label: string;
  can_post: boolean;
  can_moderate: boolean;
}

export interface UserRole {
  id: string;
  user_id: string;
  role_id: string;
  role?: Role;
}

export type PostCategory = 'problem' | 'question' | 'historical' | 'business' | 'general';

export type AccountStatus = 'active' | 'blocked';

export interface Profile {
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
  push_notifications_enabled?: boolean;
  account_status?: AccountStatus;
  created_at: string;
  updated_at: string;
}

export interface Post {
  id: string;
  location_id: string;
  author_id: string;
  category: PostCategory;
  title: string | null;
  body: string | null;
  media_urls: string[];
  approved_at: string | null;
  view_count: number;
  like_count: number;
  share_count: number;
  created_at: string;
  updated_at: string;
  profiles?: Pick<Profile, 'name' | 'avatar_url' | 'created_at'> | null;
  /** Approved comment count (set on list view from get_post_comment_counts). */
  comment_count?: number;
}

export interface Comment {
  id: string;
  post_id: string;
  author_id: string;
  body: string;
  parent_id: string | null;
  like_count: number;
  approved_at: string | null;
  created_at: string;
  profiles?: Pick<Profile, 'name' | 'avatar_url'> | null;
  replies?: Comment[];
  /** True if the current user has liked this comment (set by client). */
  liked_by_me?: boolean;
}

export type DeliveryOption = 'self_pickup' | 'third_party';

export type ReuseCategory = 'electronics' | 'furniture' | 'appliances' | 'books' | 'clothing' | 'other';

export interface ReuseItem {
  id: string;
  location_id: string;
  seller_id: string;
  title: string;
  description: string | null;
  mrp: number;
  selling_price: number;
  delivery_option: DeliveryOption;
  delivery_charge: number;
  media_urls: string[];
  category?: ReuseCategory | null;
  subcategory?: string | null;
  approved_at: string | null;
  rejected_at?: string | null;
  admin_comment?: string | null;
  created_at: string;
  updated_at: string;
  view_count?: number;
  handover_order_id?: string | null;
  is_active?: boolean;
  expires_at?: string | null;
  profiles?: Pick<Profile, 'name' | 'avatar_url'> | null;
  request_count?: number;
}

export interface ReuseReview {
  id: string;
  reuse_item_id: string;
  reviewer_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  profiles?: Pick<Profile, 'name' | 'avatar_url' | 'created_at'> | null;
}

export interface ReuseOrder {
  id: string;
  reuse_item_id: string;
  seller_id: string;
  buyer_id: string;
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled';
  delivery_option: DeliveryOption;
  delivery_charge: number;
  total_amount: number;
  buyer_name: string | null;
  buyer_phone: string | null;
  note: string | null;
  seller_note: string | null;
  status_changed_at: string | null;
  created_at: string;
}

export const POST_CATEGORIES: { value: PostCategory; label: string }[] = [
  { value: 'problem', label: 'Problem' },
  { value: 'question', label: 'Question' },
  { value: 'historical', label: 'Historical' },
  { value: 'business', label: 'Business' },
  { value: 'general', label: 'General' },
];

export const REUSE_CATEGORIES: { value: ReuseCategory; label: string }[] = [
  { value: 'electronics', label: 'Electronics & Gadgets' },
  { value: 'furniture', label: 'Furniture' },
  { value: 'appliances', label: 'Home Appliances' },
  { value: 'books', label: 'Books & Study' },
  { value: 'clothing', label: 'Clothing & Accessories' },
  { value: 'other', label: 'Other' },
];

export const LOCATION_OPTIONS = [
  { name: 'Armoor', pincode: '503224' },
  { name: 'Nirmal', pincode: '504106' },
  { name: 'Jagtial', pincode: '505327' },
] as const;
