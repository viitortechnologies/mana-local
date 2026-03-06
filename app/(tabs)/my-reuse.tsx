import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Image,
  Linking,
  Modal,
  PanResponder,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Link, useRouter, type ErrorBoundaryProps } from 'expo-router';
import { supabase } from '@/src/lib/supabase';
import { requestWithTimeout, TIMEOUT_MESSAGE } from '@/src/lib/requestWithTimeout';
import { useAuth } from '@/src/contexts/AuthContext';
import type { ReuseItem, ReuseOrder, Profile } from '@/src/lib/types';
import { REUSE_CATEGORIES } from '@/src/lib/types';
import { getWhatsAppUrl } from '@/src/lib/whatsapp';
import { formatExpiryShort } from '@/src/lib/formatExpiry';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';

type BuyerInfo = {
  name: string | null;
  avatar_url: string | null;
  locationName: string | null;
  memberSince: string | null;
  phone?: string | null;
};

function formatMemberSince(createdAt: string | null | undefined): string {
  if (!createdAt) return '—';
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return '—';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getMonth()]} ${d.getFullYear()}`;
}

/** Message from owner to requester: initiating handover discussion (owner received the request). */
function buildOwnerToRequesterWhatsAppMessage(itemTitle: string, buyerName: string | null): string {
  const name = buyerName?.trim() || 'there';
  return `Hi ${name}, I received your request for "${itemTitle}". I'd like to discuss handover/delivery with you. Let's coordinate over call or chat.`;
}

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background, padding: 24 }}>
      <Text style={{ color: colors.text, marginBottom: 12, textAlign: 'center', fontSize: 16 }}>
        Something went wrong loading your listings.
      </Text>
      {__DEV__ && error?.message ? (
        <Text style={{ color: colors.tabIconDefault, fontSize: 12, marginBottom: 16, textAlign: 'center' }} numberOfLines={3}>
          {error.message}
        </Text>
      ) : null}
      <Pressable
        style={{ backgroundColor: colors.tint, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 10 }}
        onPress={retry}
      >
        <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14 }}>Retry</Text>
      </Pressable>
    </View>
  );
}

export default function MyReuseScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const [items, setItems] = useState<(ReuseItem & { request_count?: number })[]>([]);
  const [ordersByItem, setOrdersByItem] = useState<Record<string, (ReuseOrder & { buyer_info?: BuyerInfo })[]>>({});
  const [reviewsByItem, setReviewsByItem] = useState<Record<string, { rating: number; comment: string | null; created_at: string }[]>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [approvingOrderId, setApprovingOrderId] = useState<string | null>(null);
  const [togglingActiveId, setTogglingActiveId] = useState<string | null>(null);
  const [actionModal, setActionModal] = useState<'approve' | 'reject' | null>(null);
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);
  const [pendingItemId, setPendingItemId] = useState<string | null>(null);
  const [modalNote, setModalNote] = useState('');
  const [expandedActivities, setExpandedActivities] = useState<Record<string, boolean>>({});
  const [requesterSheetUserId, setRequesterSheetUserId] = useState<string | null>(null);
  const [requesterSheetProfile, setRequesterSheetProfile] = useState<Profile | null>(null);
  const [requesterSheetProducts, setRequesterSheetProducts] = useState<ReuseItem[]>([]);
  const [requesterSheetRequests, setRequesterSheetRequests] = useState<{ order: ReuseOrder; item: ReuseItem }[]>([]);
  const [requesterSheetLocationName, setRequesterSheetLocationName] = useState<string | null>(null);
  const [requesterSheetLoading, setRequesterSheetLoading] = useState(false);
  const [requesterSheetContext, setRequesterSheetContext] = useState<{
    order: ReuseOrder & { buyer_info?: BuyerInfo };
    itemId: string;
    itemTitle: string;
    hasHandover: boolean;
  } | null>(null);

  const windowHeight = Dimensions.get('window').height;
  const sheetMinHeight = Math.max(280, windowHeight * 0.35);
  const sheetMaxHeight = windowHeight - 100;
  const sheetInitialHeight = Math.min(sheetMaxHeight, Math.max(sheetMinHeight, windowHeight * 0.5));
  const sheetHeightAnim = useRef(new Animated.Value(sheetInitialHeight)).current;
  const currentSheetHeightRef = useRef(sheetInitialHeight);
  const sheetDragStartHeight = useRef(sheetInitialHeight);
  const sheetDragMovedRef = useRef(false);
  const lastHeaderTapRef = useRef(0);
  const sheetPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 4,
      onPanResponderGrant: () => {
        sheetDragStartHeight.current = currentSheetHeightRef.current;
        sheetDragMovedRef.current = false;
      },
      onPanResponderMove: (_, gestureState) => {
        if (Math.abs(gestureState.dy) > 5) sheetDragMovedRef.current = true;
        const { height } = Dimensions.get('window');
        const minH = Math.max(280, height * 0.35);
        const maxH = height - 100;
        const newH = Math.min(maxH, Math.max(minH, sheetDragStartHeight.current - gestureState.dy));
        sheetHeightAnim.setValue(newH);
        currentSheetHeightRef.current = newH;
      },
      onPanResponderRelease: (_, gestureState) => {
        const wasTap = !sheetDragMovedRef.current && Math.abs(gestureState.dy) < 10;
        if (wasTap) {
          const now = Date.now();
          if (now - lastHeaderTapRef.current < 450) {
            lastHeaderTapRef.current = 0;
            const { height } = Dimensions.get('window');
            const maxH = height - 100;
            Animated.timing(sheetHeightAnim, {
              toValue: maxH,
              duration: 280,
              useNativeDriver: false,
            }).start(() => {
              currentSheetHeightRef.current = maxH;
            });
          } else {
            lastHeaderTapRef.current = now;
          }
        }
      },
    })
  ).current;

  const isItemExpired = (it: ReuseItem & { expires_at?: string | null }) =>
    !!it.expires_at && new Date(it.expires_at) <= new Date();
  const isItemInactive = (it: ReuseItem & { is_active?: boolean }) => it.is_active === false;
  const listingStatus = (it: ReuseItem & { approved_at?: string | null; is_active?: boolean; expires_at?: string | null; handover_order_id?: string | null }): 'Pending' | 'Active' | 'Inactive' | 'Expired' | 'Handovered' => {
    if (it.handover_order_id) return 'Handovered';
    if (!it.approved_at) return 'Pending'; // Awaiting admin approval; not visible to end users yet
    if (isItemInactive(it)) return 'Inactive';
    if (isItemExpired(it)) return 'Expired';
    return 'Active';
  };

  const load = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      setLoadError(null);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const itemsPromise = supabase
        .from('reuse_items')
        .select('*')
        .eq('seller_id', user.id)
        .order('created_at', { ascending: false });
      const { data: itemsData, error: itemsError } = await requestWithTimeout(itemsPromise);

      if (itemsError) {
        console.warn('Failed to load my reuse items', itemsError);
        setItems([]);
        setLoadError(itemsError.message || 'Failed to load. Pull down to retry.');
        setLoading(false);
        return;
      }

      const myItems = (itemsData ?? []) as (ReuseItem & { request_count?: number })[];
      const itemIds = myItems.map((i) => i.id);

      if (itemIds.length === 0) {
        setItems([]);
        setOrdersByItem({});
        setReviewsByItem({});
        setLoading(false);
        return;
      }

      const { data: ordersData, error: ordersError } = await supabase
        .from('reuse_orders')
        .select('*')
        .in('reuse_item_id', itemIds)
        .order('created_at', { ascending: false });

      if (ordersError) {
        console.warn('Failed to load reuse orders', ordersError);
      }

      const orders = (ordersData ?? []) as ReuseOrder[];
      const buyerIds = [...new Set(orders.map((o) => o.buyer_id))];

      const ordersByItemId: Record<string, (ReuseOrder & { buyer_info?: BuyerInfo })[]> = {};
      itemIds.forEach((id) => {
        ordersByItemId[id] = orders.filter((o) => o.reuse_item_id === id);
      });

      const requestCountByItem = new Map<string, number>();
      orders.forEach((o) => {
        requestCountByItem.set(o.reuse_item_id, (requestCountByItem.get(o.reuse_item_id) ?? 0) + 1);
      });
      myItems.forEach((it) => {
        (it as any).request_count = requestCountByItem.get(it.id) ?? 0;
      });

      if (buyerIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, name, avatar_url, location_id, created_at, phone')
          .in('id', buyerIds);
        const profiles = (profilesData ?? []) as {
          id: string;
          name: string | null;
          avatar_url: string | null;
          location_id: string | null;
          created_at: string;
          phone: string | null;
        }[];
        const locationIds = [...new Set(profiles.map((p) => p.location_id).filter(Boolean))] as string[];
        let locations: { id: string; name: string }[] = [];
        if (locationIds.length > 0) {
          const { data: locData } = await supabase
            .from('locations')
            .select('id, name')
            .in('id', locationIds);
          locations = (locData ?? []) as { id: string; name: string }[];
        }
        const locationMap = new Map(locations.map((l) => [l.id, l.name]));
        const profileMap = new Map(
          profiles.map((p) => [
            p.id,
            {
              name: p.name ?? null,
              avatar_url: p.avatar_url ?? null,
              locationName: p.location_id ? locationMap.get(p.location_id) ?? null : null,
              memberSince: formatMemberSince(p.created_at),
              phone: p.phone ?? null,
            },
          ])
        );
        Object.keys(ordersByItemId).forEach((itemId) => {
          ordersByItemId[itemId] = ordersByItemId[itemId].map((o) => ({
            ...o,
            buyer_info: profileMap.get(o.buyer_id) ?? undefined,
          }));
        });
      }

      const { data: reviewsData } = await supabase
        .from('reuse_reviews')
        .select('reuse_item_id, rating, comment, created_at')
        .in('reuse_item_id', itemIds)
        .order('created_at', { ascending: false });
      const reviewsList = (reviewsData ?? []) as { reuse_item_id: string; rating: number; comment: string | null; created_at: string }[];
      const reviewsByItemId: Record<string, typeof reviewsList> = {};
      itemIds.forEach((id) => {
        reviewsByItemId[id] = reviewsList.filter((r) => r.reuse_item_id === id);
      });

      setItems(myItems);
      setOrdersByItem(ordersByItemId);
      setReviewsByItem(reviewsByItemId);
      setLoadError(null);
    } catch (e) {
      console.warn('My reuse load error', e);
      setItems([]);
      setOrdersByItem({});
      setReviewsByItem({});
      const msg = (e as { message?: string })?.message === 'REQUEST_TIMEOUT' ? TIMEOUT_MESSAGE : (e as Error)?.message ?? 'Something went wrong. Pull down to retry.';
      setLoadError(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  useEffect(() => {
    load();
  }, [load]);

  const handleReactivate = useCallback(
    async (itemId: string) => {
      if (!user?.id) return;
      setTogglingActiveId(itemId);
      try {
        const expiresAt = new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString();
        const { error } = await requestWithTimeout(
          supabase
            .from('reuse_items')
            .update({ is_active: true, expires_at: expiresAt, updated_at: new Date().toISOString() })
            .eq('id', itemId)
            .eq('seller_id', user.id)
        );
        if (error) throw error;
        await load();
      } catch (e: unknown) {
        const msg = (e as { message?: string })?.message === 'REQUEST_TIMEOUT' ? TIMEOUT_MESSAGE : (e as Error)?.message ?? 'Could not reactivate. Try again.';
        Alert.alert('Could not reactivate', msg);
      } finally {
        setTogglingActiveId(null);
      }
    },
    [user?.id, load]
  );

  const handleDeactivate = useCallback(
    async (itemId: string) => {
      if (!user?.id) return;
      setTogglingActiveId(itemId);
      try {
        const { error } = await requestWithTimeout(
          supabase
            .from('reuse_items')
            .update({ is_active: false, updated_at: new Date().toISOString() })
            .eq('id', itemId)
            .eq('seller_id', user.id)
        );
        if (error) throw error;
        await load();
      } catch (e: unknown) {
        const msg = (e as { message?: string })?.message === 'REQUEST_TIMEOUT' ? TIMEOUT_MESSAGE : (e as Error)?.message ?? 'Could not deactivate. Try again.';
        Alert.alert('Could not deactivate', msg);
      } finally {
        setTogglingActiveId(null);
      }
    },
    [user?.id, load]
  );

  const openApproveModal = useCallback((itemId: string, orderId: string) => {
    setPendingItemId(itemId);
    setPendingOrderId(orderId);
    setModalNote('Deal done and handovered.');
    setActionModal('approve');
  }, []);

  const openRejectModal = useCallback((itemId: string, orderId: string) => {
    setPendingItemId(itemId);
    setPendingOrderId(orderId);
    setModalNote('Request declined.');
    setActionModal('reject');
  }, []);

  const submitApproveReject = useCallback(async () => {
    if (!user?.id || !pendingOrderId || !pendingItemId || !actionModal) return;
    const action = actionModal;
    const note = modalNote.trim() || (action === 'approve' ? 'Deal done and handovered.' : 'Request declined.');
    const now = new Date().toISOString();
    setApprovingOrderId(pendingOrderId);
    setActionModal(null);
    setPendingOrderId(null);
    setPendingItemId(null);
    try {
      const work = async () => {
        if (action === 'approve') {
          const { error: orderError } = await supabase
            .from('reuse_orders')
            .update({ status: 'accepted', seller_note: note, status_changed_at: now })
            .eq('id', pendingOrderId)
            .eq('seller_id', user.id);
          if (orderError) throw orderError;
          const { error: itemError } = await supabase
            .from('reuse_items')
            .update({ handover_order_id: pendingOrderId, updated_at: now })
            .eq('id', pendingItemId)
            .eq('seller_id', user.id);
          if (itemError) throw itemError;
        } else {
          const { error: orderError } = await supabase
            .from('reuse_orders')
            .update({ status: 'rejected', seller_note: note, status_changed_at: now })
            .eq('id', pendingOrderId)
            .eq('seller_id', user.id);
          if (orderError) throw orderError;
        }
        await load();
      };
      await requestWithTimeout(work());
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message === 'REQUEST_TIMEOUT' ? TIMEOUT_MESSAGE : (e as Error)?.message ?? 'Could not update. Try again.';
      Alert.alert('Could not update', msg);
    } finally {
      setApprovingOrderId(null);
    }
  }, [user?.id, pendingOrderId, pendingItemId, actionModal, modalNote, load]);

  const formatDateTime = (iso: string | null | undefined) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  };

  const getActivityEvents = useCallback(
    (
      it: ReuseItem,
      orders: (ReuseOrder & { buyer_info?: BuyerInfo })[],
      reviews: { rating: number; comment: string | null; created_at: string }[] = []
    ) => {
      const events: { at: string; label: string; detail?: string }[] = [];
      events.push({ at: it.created_at, label: 'Listed' });
      if (it.approved_at) {
        events.push({ at: it.approved_at, label: 'Admin approved' });
      }
      orders.forEach((o) => {
        events.push({
          at: o.created_at,
          label: 'Request',
          detail: `from ${o.buyer_name?.trim() || 'Someone'}`,
        });
        if (o.status === 'accepted' && o.status_changed_at) {
          events.push({
            at: o.status_changed_at,
            label: 'Handover approved',
            detail: o.seller_note || 'Deal done and handovered.',
          });
        }
        if (o.status === 'rejected' && o.status_changed_at) {
          events.push({
            at: o.status_changed_at,
            label: 'Rejected',
            detail: o.seller_note || undefined,
          });
        }
      });
      reviews.forEach((r) => {
        const detail = r.comment?.trim()
          ? `${r.rating} stars — ${r.comment.trim().slice(0, 80)}${r.comment.length > 80 ? '…' : ''}`
          : `${r.rating} stars`;
        events.push({ at: r.created_at, label: 'Review', detail });
      });
      events.push({ at: it.updated_at, label: 'Last updated' });
      events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
      return events;
    },
    []
  );

  const handleApproveForHandover = useCallback(
    (itemId: string, orderId: string) => {
      openApproveModal(itemId, orderId);
    },
    [openApproveModal]
  );

  const handleRejectRequest = useCallback(
    (itemId: string, orderId: string) => {
      openRejectModal(itemId, orderId);
    },
    [openRejectModal]
  );

  useEffect(() => {
    if (requesterSheetUserId) {
      const h = Dimensions.get('window').height;
      const initial = Math.min(h - 100, Math.max(Math.max(280, h * 0.35), h * 0.5));
      sheetHeightAnim.setValue(initial);
      currentSheetHeightRef.current = initial;
    }
  }, [requesterSheetUserId, sheetHeightAnim]);

  const openRequesterSheet = useCallback(
    (
      userId: string,
      context?: { order: ReuseOrder & { buyer_info?: BuyerInfo }; itemId: string; itemTitle: string; hasHandover: boolean }
    ) => {
      setRequesterSheetUserId(userId);
      setRequesterSheetProfile(null);
      setRequesterSheetProducts([]);
      setRequesterSheetRequests([]);
      setRequesterSheetLocationName(null);
      setRequesterSheetContext(context ?? null);
    },
    []
  );

  useEffect(() => {
    if (!requesterSheetUserId) return;
    let cancelled = false;
    setRequesterSheetLoading(true);
    (async () => {
      try {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', requesterSheetUserId)
          .single();
        if (cancelled) return;
        const profile = (profileData as Profile) ?? null;
        setRequesterSheetProfile(profile);
        if (profile?.location_id) {
          const { data: locData } = await supabase
            .from('locations')
            .select('name')
            .eq('id', profile.location_id)
            .single();
          if (!cancelled && locData) setRequesterSheetLocationName((locData as { name: string }).name);
        }
        const { data: itemsData } = await supabase
          .from('reuse_items')
          .select('*')
          .eq('seller_id', requesterSheetUserId)
          .not('approved_at', 'is', null)
          .order('created_at', { ascending: false })
          .limit(20);
        if (cancelled) return;
        setRequesterSheetProducts((itemsData as ReuseItem[]) ?? []);

        const { data: ordersAsBuyerData } = await supabase
          .from('reuse_orders')
          .select('*')
          .eq('buyer_id', requesterSheetUserId)
          .order('created_at', { ascending: false })
          .limit(20);
        const ordersAsBuyer = (ordersAsBuyerData ?? []) as ReuseOrder[];
        if (cancelled || ordersAsBuyer.length === 0) {
          if (!cancelled) setRequesterSheetRequests([]);
        } else {
          const itemIds = [...new Set(ordersAsBuyer.map((o) => o.reuse_item_id))];
          const { data: requestedItemsData } = await supabase
            .from('reuse_items')
            .select('*')
            .in('id', itemIds);
          const requestedItems = new Map(((requestedItemsData ?? []) as ReuseItem[]).map((i) => [i.id, i]));
          const requestsWithItems = ordersAsBuyer
            .map((o) => {
              const item = requestedItems.get(o.reuse_item_id);
              return item ? { order: o, item } : null;
            })
            .filter(Boolean) as { order: ReuseOrder; item: ReuseItem }[];
          if (!cancelled) setRequesterSheetRequests(requestsWithItems);
        }
      } catch (e) {
        if (!cancelled) {
          setRequesterSheetProfile(null);
          setRequesterSheetProducts([]);
          setRequesterSheetRequests([]);
        }
      } finally {
        if (!cancelled) setRequesterSheetLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [requesterSheetUserId]);

  if (loading && items.length === 0 && !loadError) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.tint} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.replace('/(tabs)/profile')} style={styles.backButton}>
          <Text style={[styles.backText, { color: colors.tint }]}>← Back</Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>My listings</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.tint} />
        }
      >
        {loadError ? (
          <View style={styles.emptyBox}>
            <Text style={[styles.emptyText, { color: colors.tabIconDefault }]}>
              {loadError}
            </Text>
            <Pressable
              style={[styles.addFirst, { backgroundColor: colors.tint }]}
              onPress={() => onRefresh()}
            >
              <Text style={styles.addFirstText}>Retry</Text>
            </Pressable>
          </View>
        ) : items.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={[styles.emptyText, { color: colors.tabIconDefault }]}>
              You haven't listed any products yet.
            </Text>
            <Pressable
              style={[styles.addFirst, { backgroundColor: colors.tint }]}
              onPress={() => router.push('/(tabs)/new-reuse')}
            >
              <Text style={styles.addFirstText}>Add product</Text>
            </Pressable>
          </View>
        ) : (
          items.map((item) => {
            const requests = ordersByItem[item.id] ?? [];
            const views = item.view_count ?? 0;
            const requestCount = item.request_count ?? 0;
            const hasHandover = !!item.handover_order_id;
            const categoryLabel =
              item.category && REUSE_CATEGORIES.find((c) => c.value === item.category)?.label;

            return (
              <View
                key={item.id}
                style={[styles.card, { backgroundColor: colors.background, borderColor: colors.tabIconDefault }]}
              >
                <View style={styles.cardHeader}>
                  <Link href={{ pathname: '/reuse-item/[id]', params: { id: item.id } }} asChild>
                    <Pressable style={styles.cardTitleRow}>
                      {item.media_urls?.[0] ? (
                        <Image source={{ uri: item.media_urls[0] }} style={styles.thumb} />
                      ) : (
                        <View style={[styles.thumbPlaceholder, { backgroundColor: colors.tabIconDefault }]} />
                      )}
                      <View style={styles.cardTitleWrap}>
                        <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={2}>
                          {item.title}
                        </Text>
                        {categoryLabel && (
                          <Text style={[styles.categoryTag, { color: colors.tabIconDefault }]}>
                            {categoryLabel}
                          </Text>
                        )}
                      </View>
                    </Pressable>
                  </Link>
                </View>
                <View style={styles.statsRow}>
                  <Text style={[styles.stat, { color: colors.tabIconDefault }]}>
                    {views} view{views === 1 ? '' : 's'}
                  </Text>
                  <Text style={[styles.stat, { color: colors.tint }]}>
                    {requestCount} request{requestCount === 1 ? '' : 's'}
                  </Text>
                  <Text style={[styles.stat, { color: colors.tabIconDefault }]}>
                    {requests.length} interested
                  </Text>
                  {hasHandover && (
                    <Text style={[styles.stat, { color: '#16a34a', fontWeight: '700' }]}>Handover</Text>
                  )}
                </View>

                <View style={[styles.statusRow, { borderTopColor: colors.tabIconDefault }]}>
                  <Text style={[styles.statusLabel, { color: colors.tabIconDefault }]}>
                    Status:{' '}
                    <Text style={[
                      styles.statusValue,
                      listingStatus(item) === 'Pending' && { color: '#d97706' },
                      listingStatus(item) === 'Active' && { color: '#16a34a' },
                      listingStatus(item) === 'Inactive' && { color: colors.tabIconDefault },
                      listingStatus(item) === 'Expired' && { color: '#dc2626' },
                      listingStatus(item) === 'Handovered' && { color: '#16a34a' },
                    ]}>
                      {listingStatus(item)}
                    </Text>
                    {item.expires_at && listingStatus(item) === 'Active' && formatExpiryShort(item.expires_at) && (
                      <Text style={[styles.statusExpiry, { color: colors.tabIconDefault }]}>
                        {' '}· {formatExpiryShort(item.expires_at)}
                      </Text>
                    )}
                    {item.expires_at && listingStatus(item) === 'Expired' && formatExpiryShort(item.expires_at) && (
                      <Text style={[styles.statusExpiry, { color: '#dc2626' }]}>
                        {' '}· {formatExpiryShort(item.expires_at)}
                      </Text>
                    )}
                  </Text>
                  {item.approved_at && !hasHandover && (
                    <View style={styles.statusActions}>
                      {(listingStatus(item) === 'Inactive' || listingStatus(item) === 'Expired') ? (
                        <Pressable
                          style={[styles.statusBtn, { backgroundColor: '#16a34a' }]}
                          onPress={() => handleReactivate(item.id)}
                          disabled={togglingActiveId === item.id}
                        >
                          <Text style={styles.statusBtnText}>
                            {togglingActiveId === item.id ? '…' : 'Reactivate'}
                          </Text>
                        </Pressable>
                      ) : listingStatus(item) === 'Active' ? (
                        <Pressable
                          style={[styles.statusBtn, { backgroundColor: colors.tabIconDefault }]}
                          onPress={() => handleDeactivate(item.id)}
                          disabled={togglingActiveId === item.id}
                        >
                          <Text style={styles.statusBtnText}>
                            {togglingActiveId === item.id ? '…' : 'Deactivate'}
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                  )}
                </View>

                <View style={[styles.activitySection, { borderTopColor: colors.tabIconDefault }]}>
                  <Pressable
                    style={styles.activityHeader}
                    onPress={() => setExpandedActivities((prev) => ({ ...prev, [item.id]: !prev[item.id] }))}
                  >
                    <Text style={[styles.requestsTitle, { color: colors.text }]}>Activities</Text>
                    <Text style={[styles.activityChevron, { color: colors.tabIconDefault }]}>
                      {expandedActivities[item.id] ? '▼' : '▶'}
                    </Text>
                  </Pressable>
                  {expandedActivities[item.id] &&
                    getActivityEvents(item, requests, reviewsByItem[item.id] ?? []).map((evt, idx) => (
                      <View key={idx} style={styles.activityRow}>
                        <Text style={[styles.activityLabel, { color: colors.text }]}>{evt.label}</Text>
                        <Text style={[styles.activityAt, { color: colors.tabIconDefault }]}>
                          {formatDateTime(evt.at)}
                        </Text>
                        {evt.detail ? (
                          <Text style={[styles.activityDetail, { color: colors.tabIconDefault }]}>{evt.detail}</Text>
                        ) : null}
                      </View>
                    ))}
                </View>

                {requests.length > 0 && (
                  <View style={[styles.requestsSection, { borderTopColor: colors.tabIconDefault }]}>
                    <Text style={[styles.requestsTitle, { color: colors.text }]}>Requests / Interested</Text>
                    {requests.map((order) => {
                      const name = order.buyer_info?.name?.trim() || order.buyer_name?.trim() || 'Someone';
                      const avatarUrl = order.buyer_info?.avatar_url;
                      const phone = order.buyer_phone || order.buyer_info?.phone;
                      const city = order.buyer_info?.locationName ?? '—';
                      const memberSince = order.buyer_info?.memberSince ?? '—';
                      const msg = buildOwnerToRequesterWhatsAppMessage(item.title, name);
                      const whatsappUrl = phone ? getWhatsAppUrl(phone, msg) : null;
                      const canApprove = order.status === 'pending' && !hasHandover;
                      const canReject = order.status === 'pending' && !hasHandover;
                      const isApproved = order.status === 'accepted';
                      const isRejected = order.status === 'rejected';

                      return (
                        <View
                          key={order.id}
                          style={[styles.requestCard, { borderColor: colors.tabIconDefault }]}
                        >
                          <Pressable
                            style={styles.requesterRow}
                            onPress={() =>
                              openRequesterSheet(order.buyer_id, {
                                order,
                                itemId: item.id,
                                itemTitle: item.title ?? '',
                                hasHandover,
                              })
                            }
                          >
                            {avatarUrl ? (
                              <Image source={{ uri: avatarUrl }} style={styles.requesterAvatar} />
                            ) : (
                              <View style={[styles.requesterAvatar, styles.requesterAvatarPlaceholder, { backgroundColor: colors.tabIconDefault }]}>
                                <Text style={[styles.requesterAvatarText, { color: colors.background }]}>
                                  {(name || '?').charAt(0).toUpperCase()}
                                </Text>
                              </View>
                            )}
                            <Text style={[styles.requestName, { color: colors.text, flex: 1 }]}>{name}</Text>
                            <FontAwesome name="chevron-right" size={14} color={colors.tabIconDefault} />
                          </Pressable>
                          <Text style={[styles.requestDateTime, { color: colors.tabIconDefault }]}>
                            Requested: {formatDateTime(order.created_at)}
                          </Text>
                          <Text style={[styles.requestDetail, { color: colors.tabIconDefault }]}>
                            From: {city} · Member since {memberSince}
                          </Text>
                          {order.note ? (
                            <Text style={[styles.requestNote, { color: colors.text }]} numberOfLines={2}>
                              "{order.note}"
                            </Text>
                          ) : null}
                          {isApproved && (
                            <>
                              <Text style={[styles.handoverBadge, { color: '#16a34a' }]}>Handover approved</Text>
                              {order.status_changed_at && (
                                <Text style={[styles.eventDetail, { color: colors.tabIconDefault }]}>
                                  {formatDateTime(order.status_changed_at)}
                                  {order.seller_note ? ` · ${order.seller_note}` : ''}
                                </Text>
                              )}
                            </>
                          )}
                          {isRejected && order.status_changed_at && (
                            <Text style={[styles.handoverBadge, { color: '#dc2626' }]}>
                              Rejected {formatDateTime(order.status_changed_at)}
                              {order.seller_note ? ` — ${order.seller_note}` : ''}
                            </Text>
                          )}
                          <View style={styles.requestActions}>
                            {phone ? (
                              <>
                                <Pressable
                                  style={[styles.actionBtn, { backgroundColor: colors.tint }]}
                                  onPress={() => Linking.openURL(`tel:${phone.replace(/\s/g, '')}`)}
                                >
                                  <MaterialCommunityIcons name="phone" size={16} color="#fff" />
                                  <Text style={styles.actionBtnText}>Call</Text>
                                </Pressable>
                                {whatsappUrl ? (
                                  <Pressable
                                    style={[styles.actionBtn, styles.whatsappBtn]}
                                    onPress={() => Linking.openURL(whatsappUrl)}
                                  >
                                    <MaterialCommunityIcons name="whatsapp" size={16} color="#fff" />
                                    <Text style={styles.actionBtnText}>WhatsApp</Text>
                                  </Pressable>
                                ) : null}
                              </>
                            ) : (
                              <Text style={[styles.noContact, { color: colors.tabIconDefault }]}>
                                No contact shared
                              </Text>
                            )}
                            {canApprove && (
                              <Pressable
                                style={[styles.actionBtn, styles.approveBtn]}
                                onPress={() => handleApproveForHandover(item.id, order.id)}
                                disabled={approvingOrderId === order.id}
                              >
                                <Text style={styles.actionBtnText}>
                                  {approvingOrderId === order.id ? '…' : 'Approve handover'}
                                </Text>
                              </Pressable>
                            )}
                            {canReject && (
                              <Pressable
                                style={[styles.actionBtn, { backgroundColor: '#dc2626' }]}
                                onPress={() => handleRejectRequest(item.id, order.id)}
                                disabled={approvingOrderId === order.id}
                              >
                                <Text style={styles.actionBtnText}>
                                  {approvingOrderId === order.id ? '…' : 'Reject'}
                                </Text>
                              </Pressable>
                            )}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>

      <Modal
        visible={!!requesterSheetUserId}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setRequesterSheetUserId(null)}
      >
        <View style={styles.sheetOverlayContainer}>
          <Pressable
            style={styles.sheetBackdrop}
            onPress={() => setRequesterSheetUserId(null)}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel="Close popup"
          />
          <Animated.View
            style={[
              styles.sheetBox,
              { backgroundColor: colors.background, height: sheetHeightAnim },
            ]}
          >
            <View style={styles.sheetHeaderDragArea} {...sheetPanResponder.panHandlers}>
              <View style={[styles.sheetHandle, { backgroundColor: colors.tabIconDefault }]} />
              <View style={[styles.sheetHeader, { borderBottomColor: colors.tabIconDefault }]}>
                <Text style={[styles.sheetTitle, { color: colors.text }]}>Requester profile</Text>
                <Pressable onPress={() => setRequesterSheetUserId(null)} hitSlop={12}>
                  <Text style={[styles.sheetClose, { color: colors.text }]}>✕</Text>
                </Pressable>
              </View>
            </View>
            {requesterSheetLoading ? (
              <View style={styles.sheetLoading}>
                <ActivityIndicator size="large" color={colors.tint} />
              </View>
            ) : (
              <>
                <ScrollView
                  style={styles.sheetScroll}
                  contentContainerStyle={[styles.sheetScrollContent, { flexGrow: 1 }]}
                  showsVerticalScrollIndicator={true}
                  nestedScrollEnabled
                  bounces={true}
                >
                  {requesterSheetProfile && (
                    <View style={[styles.sheetProfileCard, { borderColor: colors.tabIconDefault }]}>
                      <View style={styles.sheetProfileRow}>
                        {requesterSheetProfile.avatar_url ? (
                          <Image source={{ uri: requesterSheetProfile.avatar_url }} style={styles.sheetAvatar} />
                        ) : (
                          <View style={[styles.sheetAvatar, styles.sheetAvatarPlaceholder, { backgroundColor: colors.tabIconDefault }]}>
                            <Text style={[styles.sheetAvatarText, { color: colors.background }]}>
                              {(requesterSheetProfile.name || '?').charAt(0).toUpperCase()}
                            </Text>
                          </View>
                        )}
                        <View style={styles.sheetProfileInfo}>
                          <Text style={[styles.sheetName, { color: colors.text }]}>{requesterSheetProfile.name || 'Anonymous'}</Text>
                          <Text style={[styles.sheetMeta, { color: colors.tabIconDefault }]}>
                            Member since {formatMemberSince(requesterSheetProfile.created_at)}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.sheetDetailRow}>
                        <Text style={[styles.sheetLabel, { color: colors.tabIconDefault }]}>Location</Text>
                        <Text style={[styles.sheetValue, { color: colors.text }]}>
                          {[requesterSheetLocationName, requesterSheetProfile.area].filter(Boolean).join(' · ') || '—'}
                        </Text>
                      </View>
                      {requesterSheetProfile.phone ? (
                        <View style={styles.sheetDetailRow}>
                          <Text style={[styles.sheetLabel, { color: colors.tabIconDefault }]}>Phone</Text>
                          <Text style={[styles.sheetValue, { color: colors.text }]}>{requesterSheetProfile.phone}</Text>
                        </View>
                      ) : null}
                      {requesterSheetProfile.about ? (
                        <View style={styles.sheetDetailRow}>
                          <Text style={[styles.sheetLabel, { color: colors.tabIconDefault }]}>About</Text>
                          <Text style={[styles.sheetValue, { color: colors.text }]}>{requesterSheetProfile.about}</Text>
                        </View>
                      ) : null}
                      {requesterSheetProfile.status_text ? (
                        <View style={styles.sheetDetailRow}>
                          <Text style={[styles.sheetLabel, { color: colors.tabIconDefault }]}>Status</Text>
                          <Text style={[styles.sheetValue, { color: colors.text }]}>{requesterSheetProfile.status_text}</Text>
                        </View>
                      ) : null}
                    </View>
                  )}
                  <View style={[styles.sheetSection, styles.sheetSectionWithSlides, { borderColor: colors.tabIconDefault }]}>
                    <Text style={[styles.sheetSectionTitle, { color: colors.text }]}>
                      Their listings ({requesterSheetProducts.length})
                    </Text>
                    {requesterSheetProducts.length === 0 ? (
                      <Text style={[styles.sheetEmpty, { color: colors.tabIconDefault }]}>No products listed yet.</Text>
                    ) : (
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.sheetSlidesContent}
                        style={styles.sheetHorizontalScroll}
                        snapToInterval={152}
                        snapToAlignment="start"
                        decelerationRate="fast"
                      >
                        {requesterSheetProducts.map((prod) => (
                          <Link key={prod.id} href={{ pathname: '/reuse-item/[id]', params: { id: prod.id } }} asChild>
                            <Pressable
                              style={[styles.sheetSlideCard, { borderColor: colors.tabIconDefault }]}
                              onPress={() => setRequesterSheetUserId(null)}
                            >
                              {prod.media_urls?.[0] ? (
                                <Image source={{ uri: prod.media_urls[0] }} style={styles.sheetSlideImage} />
                              ) : (
                                <View style={[styles.sheetSlideImage, styles.sheetSlideImagePlaceholder, { backgroundColor: colors.tabIconDefault }]} />
                              )}
                              <Text style={[styles.sheetSlideTitle, { color: colors.text }]} numberOfLines={2}>{prod.title}</Text>
                              <Text style={[styles.sheetSlideCategory, { color: colors.tabIconDefault }]} numberOfLines={1}>
                                {REUSE_CATEGORIES.find((c) => c.value === prod.category)?.label ?? prod.category ?? '—'}
                              </Text>
                            </Pressable>
                          </Link>
                        ))}
                      </ScrollView>
                    )}
                  </View>
                  <View style={[styles.sheetSection, styles.sheetSectionWithSlides, { borderColor: colors.tabIconDefault }]}>
                    <Text style={[styles.sheetSectionTitle, { color: colors.text }]}>
                      Products they requested ({requesterSheetRequests.length})
                    </Text>
                    {requesterSheetRequests.length === 0 ? (
                      <Text style={[styles.sheetEmpty, { color: colors.tabIconDefault }]}>No requests yet.</Text>
                    ) : (
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.sheetSlidesContent}
                        style={styles.sheetHorizontalScroll}
                        snapToInterval={152}
                        snapToAlignment="start"
                        decelerationRate="fast"
                      >
                        {requesterSheetRequests.map(({ order, item }) => (
                          <Link key={order.id} href={{ pathname: '/reuse-item/[id]', params: { id: item.id } }} asChild>
                            <Pressable
                              style={[styles.sheetSlideCard, { borderColor: colors.tabIconDefault }]}
                              onPress={() => setRequesterSheetUserId(null)}
                            >
                              {item.media_urls?.[0] ? (
                                <Image source={{ uri: item.media_urls[0] }} style={styles.sheetSlideImage} />
                              ) : (
                                <View style={[styles.sheetSlideImage, styles.sheetSlideImagePlaceholder, { backgroundColor: colors.tabIconDefault }]} />
                              )}
                              <Text style={[styles.sheetSlideTitle, { color: colors.text }]} numberOfLines={2}>{item.title}</Text>
                              <Text style={[styles.sheetSlideMeta, { color: colors.tabIconDefault }]}>
                                {order.status === 'pending' ? 'Pending' : order.status === 'accepted' ? 'Approved' : order.status === 'rejected' ? 'Rejected' : order.status}
                                {' · '}
                                {formatDateTime(order.created_at)}
                              </Text>
                            </Pressable>
                          </Link>
                        ))}
                      </ScrollView>
                    )}
                  </View>
                </ScrollView>
                <View style={[styles.sheetFooter, { borderTopColor: colors.tabIconDefault, backgroundColor: colors.background }]}>
                  {requesterSheetContext && (() => {
                    const ctx = requesterSheetContext;
                    const phone = ctx.order.buyer_phone || ctx.order.buyer_info?.phone;
                    const msg = buildOwnerToRequesterWhatsAppMessage(ctx.itemTitle, ctx.order.buyer_name?.trim() || undefined);
                    const whatsappUrl = phone ? getWhatsAppUrl(phone, msg) : null;
                    const canApprove = ctx.order.status === 'pending' && !ctx.hasHandover;
                    const canReject = ctx.order.status === 'pending' && !ctx.hasHandover;
                    return (
                      <>
                        {phone ? (
                          <>
                            <Pressable
                              style={[styles.sheetFooterBtn, { backgroundColor: colors.tint }]}
                              onPress={() => Linking.openURL(`tel:${phone.replace(/\s/g, '')}`)}
                            >
                              <MaterialCommunityIcons name="phone" size={18} color="#fff" />
                              <Text style={styles.sheetFooterBtnText}>Call</Text>
                            </Pressable>
                            {whatsappUrl ? (
                              <Pressable
                                style={[styles.sheetFooterBtn, styles.whatsappBtn]}
                                onPress={() => Linking.openURL(whatsappUrl)}
                              >
                                <MaterialCommunityIcons name="whatsapp" size={18} color="#fff" />
                                <Text style={styles.sheetFooterBtnText}>WhatsApp</Text>
                              </Pressable>
                            ) : null}
                          </>
                        ) : null}
                        {canApprove && (
                          <Pressable
                            style={[styles.sheetFooterBtn, styles.approveBtn]}
                            onPress={() => {
                              setRequesterSheetUserId(null);
                              openApproveModal(ctx.itemId, ctx.order.id);
                            }}
                          >
                            <Text style={styles.sheetFooterBtnText}>Approve handover</Text>
                          </Pressable>
                        )}
                        {canReject && (
                          <Pressable
                            style={[styles.sheetFooterBtn, { backgroundColor: '#dc2626' }]}
                            onPress={() => {
                              setRequesterSheetUserId(null);
                              openRejectModal(ctx.itemId, ctx.order.id);
                            }}
                          >
                            <Text style={styles.sheetFooterBtnText}>Reject</Text>
                          </Pressable>
                        )}
                      </>
                    );
                  })()}
                  <Pressable
                    style={[styles.sheetFooterBtn, { backgroundColor: colors.tabIconDefault }]}
                    onPress={() => setRequesterSheetUserId(null)}
                  >
                    <Text style={styles.sheetFooterBtnText}>Close</Text>
                  </Pressable>
                </View>
              </>
            )}
          </Animated.View>
        </View>
      </Modal>

      <Modal visible={!!actionModal} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setActionModal(null)}>
          <Pressable style={[styles.modalBox, { backgroundColor: colors.background, borderColor: colors.tabIconDefault }]} onPress={(e) => e.stopPropagation()}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              {actionModal === 'approve' ? 'Approve handover' : 'Reject request'}
            </Text>
            <Text style={[styles.modalHint, { color: colors.tabIconDefault }]}>
              {actionModal === 'approve'
                ? 'Add a comment for the requester (e.g. Deal done and handovered.)'
                : 'Add a comment so they know why it was rejected.'}
            </Text>
            <TextInput
              style={[styles.modalInput, { color: colors.text, borderColor: colors.tabIconDefault }]}
              placeholder="Comment"
              placeholderTextColor={colors.tabIconDefault}
              value={modalNote}
              onChangeText={setModalNote}
              multiline
              numberOfLines={3}
            />
            <View style={styles.modalActions}>
              <Pressable style={[styles.modalBtn, { backgroundColor: colors.tabIconDefault }]} onPress={() => setActionModal(null)}>
                <Text style={styles.modalBtnText}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.modalBtn, { backgroundColor: actionModal === 'approve' ? '#16a34a' : '#dc2626' }]} onPress={submitApproveReject}>
                <Text style={styles.modalBtnText}>{actionModal === 'approve' ? 'Approve' : 'Reject'}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  backButton: { marginRight: 12 },
  backText: { fontSize: 16, fontWeight: '600' },
  headerTitle: { fontSize: 18, fontWeight: '700', flex: 1 },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  emptyBox: { alignItems: 'center', paddingVertical: 48 },
  emptyText: { fontSize: 16, marginBottom: 16 },
  addFirst: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  addFirstText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  card: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  cardHeader: { marginBottom: 8 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center' },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: 8,
    marginRight: 12,
  },
  thumbPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 8,
    marginRight: 12,
    opacity: 0.3,
  },
  cardTitleWrap: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  categoryTag: { fontSize: 12, marginTop: 2 },
  statsRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 12,
  },
  stat: { fontSize: 13, fontWeight: '600' },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    paddingTop: 10,
    marginTop: 4,
    borderTopWidth: 1,
  },
  statusLabel: { fontSize: 13 },
  statusValue: { fontWeight: '700' },
  statusExpiry: { fontSize: 12 },
  statusActions: { marginTop: 6 },
  statusBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  statusBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  requestsSection: {
    borderTopWidth: 1,
    paddingTop: 12,
    marginTop: 4,
  },
  requestsTitle: { fontSize: 14, fontWeight: '700', marginBottom: 10 },
  requestCard: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  requesterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  requesterAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 10,
  },
  requesterAvatarPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  requesterAvatarText: { fontSize: 18, fontWeight: '700' },
  requestName: { fontSize: 15, fontWeight: '600', marginBottom: 4 },
  requestDetail: { fontSize: 12, marginBottom: 4 },
  requestNote: { fontSize: 13, fontStyle: 'italic', marginBottom: 8 },
  requestActions: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  whatsappBtn: { backgroundColor: '#25D366' },
  approveBtn: { backgroundColor: '#16a34a' },
  actionBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  noContact: { fontSize: 13 },
  handoverBadge: { fontSize: 13, fontWeight: '700', marginBottom: 4 },
  eventDetail: { fontSize: 12, marginBottom: 8 },
  activitySection: {
    borderTopWidth: 1,
    paddingTop: 12,
    marginTop: 4,
  },
  activityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  activityChevron: { fontSize: 14, marginLeft: 8 },
  activityRow: { marginTop: 10, marginBottom: 6 },
  activityLabel: { fontSize: 13, fontWeight: '600' },
  activityAt: { fontSize: 12, marginTop: 1 },
  activityDetail: { fontSize: 12, marginTop: 1, fontStyle: 'italic' },
  requestDateTime: { fontSize: 13, marginBottom: 4, fontWeight: '600' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalBox: {
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderRadius: 12,
    padding: 20,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  modalHint: { fontSize: 13, marginBottom: 12 },
  modalInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: 16,
  },
  modalActions: { flexDirection: 'row', gap: 12, justifyContent: 'flex-end' },
  modalBtn: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8 },
  modalBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  sheetOverlayContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheetBox: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: 'hidden',
    flexDirection: 'column',
  },
  sheetHeaderDragArea: {},
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 8,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  sheetTitle: { fontSize: 18, fontWeight: '700' },
  sheetClose: { fontSize: 20, fontWeight: '600' },
  sheetLoading: { padding: 40, alignItems: 'center' },
  sheetScroll: { flex: 1, minHeight: 200, paddingHorizontal: 20, paddingTop: 12 },
  sheetScrollContent: { paddingBottom: 28, flexGrow: 1 },
  sheetProfileCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sheetProfileRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  sheetAvatar: { width: 56, height: 56, borderRadius: 28, marginRight: 14 },
  sheetAvatarPlaceholder: { justifyContent: 'center', alignItems: 'center' },
  sheetAvatarText: { fontSize: 22, fontWeight: '700' },
  sheetProfileInfo: { flex: 1 },
  sheetName: { fontSize: 18, fontWeight: '700', marginBottom: 2 },
  sheetMeta: { fontSize: 13 },
  sheetDetailRow: { marginTop: 10 },
  sheetLabel: { fontSize: 12, marginBottom: 2 },
  sheetValue: { fontSize: 14 },
  sheetSection: { borderWidth: 1, borderRadius: 12, padding: 16, marginTop: 8 },
  sheetSectionWithSlides: { minHeight: 190 },
  sheetHorizontalScroll: { flexGrow: 0, marginHorizontal: -4 },
  sheetSectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 12 },
  sheetEmpty: { fontSize: 14 },
  sheetProductRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
  },
  sheetProductThumb: { width: 48, height: 48, borderRadius: 8, marginRight: 12 },
  sheetProductThumbPlaceholder: { opacity: 0.3 },
  sheetProductInfo: { flex: 1 },
  sheetProductTitle: { fontSize: 14, fontWeight: '600' },
  sheetProductCategory: { fontSize: 12, marginTop: 2 },
  sheetSlidesContent: { paddingVertical: 10, paddingHorizontal: 4, paddingRight: 20 },
  sheetSlideCard: {
    width: 140,
    marginRight: 12,
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  sheetSlideImage: { width: '100%', height: 100, backgroundColor: '#f0f0f0' },
  sheetSlideImagePlaceholder: { opacity: 0.3 },
  sheetSlideTitle: { fontSize: 13, fontWeight: '600', padding: 8, paddingBottom: 2 },
  sheetSlideCategory: { fontSize: 11, paddingHorizontal: 8, paddingBottom: 8 },
  sheetSlideMeta: { fontSize: 10, paddingHorizontal: 8, paddingBottom: 8 },
  sheetFooter: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 14,
    paddingBottom: 24,
    borderTopWidth: 1,
  },
  sheetFooterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 10,
  },
  sheetFooterBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
});
