import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Dimensions, Image, Linking, Modal, PanResponder, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { supabase } from '@/src/lib/supabase';
import { requestWithTimeout, TIMEOUT_MESSAGE } from '@/src/lib/requestWithTimeout';
import type { ReuseItem, ReuseOrder, ReuseReview, Profile } from '@/src/lib/types';
import { REUSE_CATEGORIES } from '@/src/lib/types';
import { getWhatsAppUrl } from '@/src/lib/whatsapp';
import { formatExpiryLong } from '@/src/lib/formatExpiry';
import { isVideoUrl } from '@/constants/MediaLimits';
import { MediaWithWatermark } from '@/components/MediaWithWatermark';
import { PhotoPreviewModal } from '@/components/PhotoPreviewModal';
import { VideoPreviewModal } from '@/components/VideoPreviewModal';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { useAuth } from '@/src/contexts/AuthContext';

type BuyerInfo = {
  name: string | null;
  avatar_url: string | null;
  locationName: string | null;
  memberSince: string;
  phone?: string | null;
};

function formatMemberSince(createdAt: string | null | undefined): string {
  if (!createdAt) return '—';
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return '—';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getMonth()]} ${d.getFullYear()}`;
}

/** Message from owner to requester: initiating handover discussion. */
function buildOwnerToRequesterWhatsAppMessage(itemTitle: string, buyerName: string | null): string {
  const name = buyerName?.trim() || 'there';
  return `Hi ${name}, I received your request for "${itemTitle}". I'd like to discuss handover/delivery with you. Let's coordinate over call or chat.`;
}

export default function ReuseItemScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const [item, setItem] = useState<ReuseItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [reviews, setReviews] = useState<ReuseReview[]>([]);
  const [similar, setSimilar] = useState<ReuseItem[]>([]);
  const [myRating, setMyRating] = useState<number>(0);
  const [myComment, setMyComment] = useState('');
  const [savingReview, setSavingReview] = useState(false);
  const [seller, setSeller] = useState<
    Pick<Profile, 'name' | 'avatar_url' | 'email_verified_at' | 'profile_completed_at' | 'created_at'> | null
  >(null);
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { user, profile, session, isProfileComplete, refreshProfile } = useAuth();
  const [selectedDelivery, setSelectedDelivery] = useState<'self_pickup' | 'third_party'>('self_pickup');
  const [requestCount, setRequestCount] = useState(0);
  const [myOrder, setMyOrder] = useState<Pick<ReuseOrder, 'id' | 'status' | 'created_at'> | null>(null);
  const [orderSuccess, setOrderSuccess] = useState<{ id: string } | null>(null);
  const orderSuccessAnim = useRef(new Animated.Value(0)).current;
  const [ownerRequests, setOwnerRequests] = useState<(ReuseOrder & { buyer_info?: BuyerInfo })[]>([]);
  const [requestsSectionY, setRequestsSectionY] = useState(0);
  const [approvingOrderId, setApprovingOrderId] = useState<string | null>(null);
  const [actionModal, setActionModal] = useState<'approve' | 'reject' | null>(null);
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);
  const [modalNote, setModalNote] = useState('');
  const [activitiesExpanded, setActivitiesExpanded] = useState(false);
  const [hasIncrementedView, setHasIncrementedView] = useState(false);
  const [requesterSheetUserId, setRequesterSheetUserId] = useState<string | null>(null);
  const [requesterSheetProfile, setRequesterSheetProfile] = useState<Profile | null>(null);
  const [requesterSheetProducts, setRequesterSheetProducts] = useState<ReuseItem[]>([]);
  const [requesterSheetRequests, setRequesterSheetRequests] = useState<{ order: ReuseOrder; item: ReuseItem }[]>([]);
  const [requesterSheetLocationName, setRequesterSheetLocationName] = useState<string | null>(null);
  const [requesterSheetLoading, setRequesterSheetLoading] = useState(false);
  const [requesterSheetContext, setRequesterSheetContext] = useState<{
    order: ReuseOrder & { buyer_info?: BuyerInfo };
    hasHandover: boolean;
  } | null>(null);
  const [mediaPreviewIndex, setMediaPreviewIndex] = useState<number | null>(null);

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

  const categoryLabel = useMemo(() => {
    if (!item?.category) return null;
    return REUSE_CATEGORIES.find((c) => c.value === item.category)?.label ?? item.category;
  }, [item?.category]);

  const averageRating = useMemo(() => {
    if (!reviews.length) return null;
    const sum = reviews.reduce((acc, r) => acc + (r.rating || 0), 0);
    return (sum / reviews.length).toFixed(1);
  }, [reviews]);

  const daysSince = (createdAt: string | null | undefined): number => {
    if (!createdAt) return 0;
    const created = new Date(createdAt).getTime();
    return Math.max(0, Math.floor((Date.now() - created) / (24 * 60 * 60 * 1000)));
  };

  const reloadReviews = useCallback(
    async (reuseItemId: string) => {
      try {
        const { data: reviewData } = await supabase
          .from('reuse_reviews')
          .select('*')
          .eq('reuse_item_id', reuseItemId)
          .order('created_at', { ascending: false });
        const baseReviews = (reviewData as ReuseReview[]) ?? [];

        if (baseReviews.length > 0) {
          const reviewerIds = Array.from(new Set(baseReviews.map((r) => r.reviewer_id)));
          const { data: reviewerProfiles } = await supabase
            .from('profiles')
            .select('id, name, avatar_url, created_at')
            .in('id', reviewerIds);
          const profileMap = new Map(
            (reviewerProfiles ?? []).map(
              (p: { id: string; name: string | null; avatar_url: string | null; created_at: string }) => [p.id, p]
            )
          );
          setReviews(
            baseReviews.map((r) => {
              const prof = profileMap.get(r.reviewer_id);
              return prof
                ? {
                    ...r,
                    profiles: {
                      name: prof.name,
                      avatar_url: prof.avatar_url,
                      created_at: prof.created_at,
                    },
                  }
                : { ...r, profiles: null };
            })
          );
        } else {
          setReviews([]);
        }
      } catch (e) {
        console.warn('Failed to reload reviews', e);
      }
    },
    []
  );

  // Ensure we always have the freshest profile info (including profile_completed_at)
  // when visiting this screen, so isProfileComplete is accurate without restarting.
  useFocusEffect(
    useCallback(() => {
      if (user?.id) {
        refreshProfile();
      }
    }, [user?.id, refreshProfile])
  );

  const fetch = useCallback(async () => {
    if (!id) {
      setItem(null);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const { data: itemData, error: itemError } = await supabase
        .from('reuse_items')
        .select('*')
        .eq('id', id)
        .single();
      if (itemError) {
        console.warn('Failed to load reuse item', itemError);
      }
      const reuseItem = (itemData as ReuseItem | null) ?? null;
      setItem(reuseItem);

        if (reuseItem) {
        if (!hasIncrementedView) {
          try {
            await supabase.rpc('increment_reuse_view', { reuse_id: reuseItem.id });
            setHasIncrementedView(true);
          } catch (e) {
            console.warn('Failed to increment reuse view', e);
          }
        }
        setSelectedDelivery(reuseItem.delivery_option as 'self_pickup' | 'third_party');
        try {
          const { data: counts, error: countsError } = await supabase.rpc('get_reuse_request_counts', {
            reuse_item_ids: [reuseItem.id],
          });
          if (!countsError && counts?.length) {
            const row = (counts as { reuse_item_id: string; request_count: number }[])[0];
            setRequestCount(Number(row?.request_count) ?? 0);
          } else {
            setRequestCount(0);
          }
        } catch (e) {
          console.warn('Failed to load reuse item request count', e);
          setRequestCount(0);
        }
        if (user?.id === reuseItem.seller_id) {
          try {
            const { data: ordersData } = await supabase
              .from('reuse_orders')
              .select('*')
              .eq('reuse_item_id', reuseItem.id)
              .order('created_at', { ascending: false });
            const orders = (ordersData ?? []) as (ReuseOrder & { buyer_info?: BuyerInfo })[];
            const buyerIds = [...new Set(orders.map((o) => o.buyer_id))];
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
                const { data: locData } = await supabase.from('locations').select('id, name').in('id', locationIds);
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
              orders.forEach((o) => {
                o.buyer_info = profileMap.get(o.buyer_id);
              });
            }
            setOwnerRequests(orders);
          } catch (e) {
            console.warn('Failed to load owner requests', e);
            setOwnerRequests([]);
          }
        } else {
          setOwnerRequests([]);
        }
        const { data: sellerData } = await supabase
          .from('profiles')
          .select('name, avatar_url, email_verified_at, profile_completed_at, created_at')
          .eq('id', reuseItem.seller_id)
          .single();
        setSeller((sellerData as any) ?? null);

        await reloadReviews(reuseItem.id);

        // If the current viewer is a buyer (not the seller), check if they already
        // have a request/order for this item so we can disable duplicate requests.
        if (user?.id && user.id !== reuseItem.seller_id) {
          const { data: myOrderData } = await supabase
            .from('reuse_orders')
            .select('id, status, created_at')
            .eq('reuse_item_id', reuseItem.id)
            .eq('buyer_id', user.id)
            .in('status', ['pending', 'accepted'])
            .order('created_at', { ascending: false })
            .limit(1);
          const existing = (myOrderData as Pick<ReuseOrder, 'id' | 'status' | 'created_at'>[] | null)?.[0] ?? null;
          setMyOrder(existing);
        } else {
          setMyOrder(null);
        }

        if (reuseItem.category) {
          const { data: similarData } = await supabase
            .from('reuse_items')
            .select('*')
            .eq('location_id', reuseItem.location_id)
            .eq('category', reuseItem.category)
            .not('approved_at', 'is', null)
            .is('rejected_at', null)
            .neq('id', reuseItem.id)
            .order('created_at', { ascending: false })
            .limit(5);
          setSimilar((similarData as ReuseItem[]) ?? []);
        } else {
          setSimilar([]);
        }
      } else {
        setReviews([]);
        setSimilar([]);
      }
    } catch (e) {
      console.warn('Unexpected error loading reuse item', e);
      setItem(null);
    } finally {
      setLoading(false);
    }
  }, [id, user?.id, hasIncrementedView, reloadReviews]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  useEffect(() => {
    if (requesterSheetUserId) {
      const h = Dimensions.get('window').height;
      const initial = Math.min(h - 100, Math.max(Math.max(280, h * 0.35), h * 0.5));
      sheetHeightAnim.setValue(initial);
      currentSheetHeightRef.current = initial;
    }
  }, [requesterSheetUserId, sheetHeightAnim]);

  const openRequesterSheet = useCallback(
    (userId: string, context?: { order: ReuseOrder & { buyer_info?: BuyerInfo }; hasHandover: boolean }) => {
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
          .is('rejected_at', null)
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
              const it = requestedItems.get(o.reuse_item_id);
              return it ? { order: o, item: it } : null;
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

  const handleSaveReview = async () => {
    if (!user?.id || !item || !myRating) return;
    setSavingReview(true);
    try {
      const payload = {
        reuse_item_id: item.id,
        reviewer_id: user.id,
        rating: myRating,
        comment: myComment.trim() || null,
      };
      const { error } = await requestWithTimeout(
        supabase.from('reuse_reviews').upsert(payload, { onConflict: 'reuse_item_id,reviewer_id' })
      );
      if (error) {
        Alert.alert('Could not save review', error.message || 'Please try again.');
        return;
      }
      setMyRating(0);
      setMyComment('');
      await reloadReviews(item.id);
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message === 'REQUEST_TIMEOUT' ? TIMEOUT_MESSAGE : (e as Error)?.message || TIMEOUT_MESSAGE;
      Alert.alert('Could not save review', msg);
    } finally {
      setSavingReview(false);
    }
  };

  const openApproveModal = useCallback((orderId: string) => {
    setPendingOrderId(orderId);
    setModalNote('Deal done and handovered.');
    setActionModal('approve');
  }, []);

  const openRejectModal = useCallback((orderId: string) => {
    setPendingOrderId(orderId);
    setModalNote('Request declined.');
    setActionModal('reject');
  }, []);

  const submitApproveReject = useCallback(async () => {
    if (!user?.id || !item || !pendingOrderId || !actionModal) return;
    const action = actionModal;
    const orderId = pendingOrderId;
    const note = modalNote.trim() || (action === 'approve' ? 'Deal done and handovered.' : 'Request declined.');
    const now = new Date().toISOString();
    setActionModal(null);
    setPendingOrderId(null);
    setApprovingOrderId(orderId);
    try {
      const work = async () => {
        if (action === 'approve') {
          const { error: orderError } = await supabase
            .from('reuse_orders')
            .update({ status: 'accepted', seller_note: note, status_changed_at: now })
            .eq('id', orderId)
            .eq('seller_id', user.id);
          if (orderError) throw orderError;
          const { error: itemError } = await supabase
            .from('reuse_items')
            .update({ handover_order_id: orderId, updated_at: now })
            .eq('id', item.id)
            .eq('seller_id', user.id);
          if (itemError) throw itemError;
        } else {
          const { error: orderError } = await supabase
            .from('reuse_orders')
            .update({ status: 'rejected', seller_note: note, status_changed_at: now })
            .eq('id', orderId)
            .eq('seller_id', user.id);
          if (orderError) throw orderError;
        }
        await fetch();
      };
      await requestWithTimeout(work());
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message === 'REQUEST_TIMEOUT' ? TIMEOUT_MESSAGE : (e as Error)?.message ?? 'Could not update. Try again.';
      Alert.alert('Could not update', msg);
    } finally {
      setApprovingOrderId(null);
    }
  }, [user?.id, item, pendingOrderId, actionModal, modalNote, fetch]);

  const formatDateTime = (iso: string | null | undefined) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  };

  const getActivityEvents = useCallback(
    (orders: (ReuseOrder & { buyer_info?: BuyerInfo })[], reviewList: ReuseReview[] = []) => {
      if (!item) return [];
      const events: { at: string; label: string; detail?: string }[] = [];
      events.push({ at: item.created_at, label: 'Listed' });
      if (item.approved_at) events.push({ at: item.approved_at, label: 'Admin approved' });
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
          events.push({ at: o.status_changed_at, label: 'Rejected', detail: o.seller_note || undefined });
        }
      });
      reviewList.forEach((r) => {
        const detail = r.comment?.trim()
          ? `${r.rating} stars — ${r.comment.trim().slice(0, 80)}${r.comment.length > 80 ? '…' : ''}`
          : `${r.rating} stars`;
        events.push({ at: r.created_at, label: 'Review', detail });
      });
      events.push({ at: item.updated_at, label: 'Last updated' });
      events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
      return events;
    },
    [item]
  );

  const handleApproveForHandover = useCallback((orderId: string) => openApproveModal(orderId), [openApproveModal]);
  const handleRejectRequest = useCallback((orderId: string) => openRejectModal(orderId), [openRejectModal]);

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.tint} />
      </View>
    );
  }

  if (!item) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.text, fontSize: 16 }}>This listing is no longer available.</Text>
      </View>
    );
  }

  const basePrice = item.selling_price || 0;
  const deliveryFee = selectedDelivery === 'third_party' ? Number(item.delivery_charge || 0) : 0;
  const totalAmount = basePrice + deliveryFee;
  const isThirdParty = selectedDelivery === 'third_party';
  const isItemExpired = !!item.expires_at && new Date(item.expires_at) <= new Date();
  const isItemInactive = item.is_active === false;
  const isListingActive = !isItemInactive && !isItemExpired;

  const handlePlaceOrder = async () => {
    if (!user?.id || !session || !item) return;
    if (myOrder && (myOrder.status === 'pending' || myOrder.status === 'accepted')) {
      const shortId = myOrder.id.slice(0, 8).toUpperCase();
      Alert.alert(
        'Request already sent',
        `You have already requested this product.\n\nOrder ID: ${shortId}`
      );
      return;
    }
    try {
      const buyerName = profile?.name ?? null;
      const buyerPhone = profile?.phone ?? (session.user as any).phone ?? null;
      const insertPromise = supabase
        .from('reuse_orders')
        .insert({
          reuse_item_id: item.id,
          seller_id: item.seller_id,
          buyer_id: user.id,
          status: 'pending',
          delivery_option: selectedDelivery,
          delivery_charge: deliveryFee,
          total_amount: totalAmount,
          buyer_name: buyerName,
          buyer_phone: buyerPhone,
        })
        .select('id, status, created_at')
        .single();
      const { data, error } = await requestWithTimeout(insertPromise);
      if (error) {
        Alert.alert('Could not place order', error.message || 'Please try again.');
        return;
      }
      if (data) {
        const shortId = (data.id as string).slice(0, 8).toUpperCase();
        setMyOrder({
          id: data.id as string,
          status: (data.status as ReuseOrder['status']) ?? 'pending',
          created_at: (data.created_at as string) ?? new Date().toISOString(),
        });
        setOrderSuccess({ id: data.id as string });
        orderSuccessAnim.setValue(0);
        Animated.spring(orderSuccessAnim, {
          toValue: 1,
          useNativeDriver: true,
          friction: 6,
          tension: 80,
        }).start();
      }
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message === 'REQUEST_TIMEOUT' ? TIMEOUT_MESSAGE : (e as Error)?.message || TIMEOUT_MESSAGE;
      Alert.alert('Could not place order', msg);
    }
  };

  return (
    <View style={[styles.page, { backgroundColor: colors.background }]}>
      <View style={[styles.headerRowFixed, { backgroundColor: colors.background, borderBottomColor: colors.tabIconDefault }]}>
        <Pressable onPress={() => router.replace('/(tabs)/reuse')}>
          <Text style={[styles.backText, { color: colors.tint }]}>{'← Back to Reuse'}</Text>
        </Pressable>
      </View>
      <ScrollView
        ref={scrollRef}
        style={styles.container}
        contentContainerStyle={styles.content}
      >
      {/* ——— Media gallery: tap to preview full screen ——— */}
      {item.media_urls && item.media_urls.length > 0 && (
        <View style={[styles.mediaSection, { backgroundColor: colors.background }]}>
          <View style={styles.mediaSectionHeader}>
            <Text style={[styles.mediaSectionLabel, { color: colors.tabIconDefault }]}>Photos & videos</Text>
            <Text style={[styles.mediaSectionHint, { color: colors.tint }]}>Tap to view full screen</Text>
          </View>
          <View style={styles.imagesRow}>
            <Pressable style={styles.mainImageTouchable} onPress={() => setMediaPreviewIndex(0)}>
              {isVideoUrl(item.media_urls[0]) ? (
                <MediaWithWatermark style={[styles.mainImage, styles.videoPlaceholder, { backgroundColor: colors.tabIconDefault + '40' }]}>
                  <MaterialCommunityIcons name="play-circle-outline" size={48} color={colors.tint} />
                  <Text style={[styles.videoPlaceholderText, { color: colors.text }]}>Video — Tap to open</Text>
                </MediaWithWatermark>
              ) : (
                <MediaWithWatermark style={styles.mainImage}>
                  <Image source={{ uri: item.media_urls[0] }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                  <View style={styles.tapOverlay} pointerEvents="none">
                    <MaterialCommunityIcons name="image-multiple-outline" size={28} color="rgba(255,255,255,0.9)" />
                    <Text style={styles.tapOverlayText}>Tap to preview</Text>
                  </View>
                </MediaWithWatermark>
              )}
            </Pressable>
            <View style={styles.sideImages}>
              {item.media_urls.slice(1, 3).map((url, idx) => {
                const mediaIndex = idx + 1;
                const isVideo = isVideoUrl(url);
                return (
                  <Pressable key={url} style={styles.sideImageTouchable} onPress={() => setMediaPreviewIndex(mediaIndex)}>
                    {isVideo ? (
                      <MediaWithWatermark style={[styles.sideImage, styles.videoPlaceholder, { backgroundColor: colors.tabIconDefault + '40' }]}>
                        <MaterialCommunityIcons name="play-circle-outline" size={28} color={colors.tint} />
                        <Text style={[styles.videoPlaceholderTextSmall, { color: colors.text }]}>Video</Text>
                      </MediaWithWatermark>
                    ) : (
                      <MediaWithWatermark style={styles.sideImage}>
                        <Image source={{ uri: url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                        <View style={styles.tapOverlaySmall} pointerEvents="none">
                          <MaterialCommunityIcons name="image-outline" size={18} color="rgba(255,255,255,0.9)" />
                        </View>
                      </MediaWithWatermark>
                    )}
                  </Pressable>
                );
              })}
            </View>
          </View>
          <Text style={[styles.mediaCount, { color: colors.tabIconDefault }]}>
            {item.media_urls.length} item{item.media_urls.length === 1 ? '' : 's'}
          </Text>
        </View>
      )}

      {/* ——— Product details ——— */}
      <View style={[styles.card, { borderColor: colors.border ?? colors.tabIconDefault }]}>
        {categoryLabel && (
          <View style={[styles.categoryPill, { backgroundColor: colors.tint + '22' }]}>
            <Text style={[styles.categoryPillText, { color: colors.tint }]} numberOfLines={1}>
              {categoryLabel}
              {item.subcategory ? ` · ${item.subcategory}` : ''}
            </Text>
          </View>
        )}
        <Text style={[styles.title, { color: colors.text }]}>{item.title}</Text>
        {item.description ? (
          <Text style={[styles.body, { color: colors.text }]}>{item.description}</Text>
        ) : null}

        <View style={[styles.priceBlock, { borderTopColor: colors.border ?? colors.tabIconDefault }]}>
          <Text style={[styles.priceLabel, { color: colors.tabIconDefault }]}>Price</Text>
          <Text style={[styles.price, { color: colors.tint }]}>MRP ₹{item.mrp}</Text>
          <Text style={[styles.deliveryLabel, { color: colors.tabIconDefault }]}>
            Selling at ₹{item.selling_price} · {item.delivery_option === 'self_pickup' ? 'Self pickup' : 'Third party delivery'}
          </Text>
        </View>

        <View style={[styles.infoBlock, { backgroundColor: colors.tabIconDefault + '12', borderColor: colors.tabIconDefault + '30' }]}>
          <Text style={[styles.infoBlockTitle, { color: colors.text }]}>Listing info</Text>
          <Text style={[styles.infoRow, { color: colors.tabIconDefault }]}>
            Last updated {new Date(item.updated_at).toLocaleDateString()} · {item.view_count ?? 0} view{(item.view_count ?? 0) === 1 ? '' : 's'}
          </Text>
          {item.expires_at && (
            <Text style={[styles.infoRow, { color: colors.text }]}>
              Expires: {formatExpiryLong(item.expires_at)}
            </Text>
          )}
        </View>

        {seller && (
          <View style={[styles.sellerBox, { borderTopColor: colors.border ?? colors.tabIconDefault }]}>
            <Text style={[styles.sellerTitle, { color: colors.tabIconDefault }]}>Submitted by</Text>
            <View style={styles.sellerRow}>
              {seller.avatar_url ? (
                <Image source={{ uri: seller.avatar_url }} style={styles.sellerAvatar} />
              ) : (
                <View style={[styles.sellerAvatarPlaceholder, { backgroundColor: colors.tint }]}>
                  <Text style={styles.sellerAvatarInitial}>
                    {(seller.name?.trim() || '?').charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
              <View style={styles.sellerInfo}>
                <Text style={[styles.sellerName, { color: colors.text }]} numberOfLines={1}>
                  {seller.name?.trim() || 'Anonymous'}
                </Text>
                <Text style={[styles.sellerMeta, { color: colors.tabIconDefault }]}>
                  Joined {daysSince(seller.created_at)} days ago
                </Text>
                <Text style={[styles.sellerMeta, { color: colors.tabIconDefault }]}>
                  {seller.email_verified_at && seller.profile_completed_at
                    ? 'Verified profile'
                    : 'Profile not fully verified yet'}
                </Text>
              </View>
            </View>
          </View>
        )}

        {user?.id === item.seller_id && (
          <Link href={{ pathname: '/edit-reuse/[id]', params: { id: item.id } }} asChild>
            <Pressable style={[styles.editButton, { borderColor: colors.tint }]}>
              <MaterialCommunityIcons name="pencil-outline" size={18} color={colors.tint} />
              <Text style={[styles.editButtonText, { color: colors.tint }]}>Edit product details</Text>
            </Pressable>
          </Link>
        )}

        <View style={[styles.metaRowWrap, { borderTopColor: colors.border ?? colors.tabIconDefault }]}>
          {averageRating !== null && averageRating !== undefined && (
            <Text style={[styles.meta, { color: colors.tabIconDefault }]}>
              Rating {averageRating} / 5 ({reviews.length} review{reviews.length === 1 ? '' : 's'})
            </Text>
          )}
          {user?.id === item.seller_id && requestCount > 0 ? (
            <Pressable onPress={() => scrollRef.current?.scrollTo({ y: requestsSectionY, animated: true })}>
              <Text style={[styles.meta, { color: colors.tint, textDecorationLine: 'underline' }]}>
                {requestCount} request{requestCount === 1 ? '' : 's'} received (tap to see)
              </Text>
            </Pressable>
          ) : (
            <Text style={[styles.meta, { color: colors.tint }]}>
              {requestCount} request{requestCount === 1 ? '' : 's'} received
            </Text>
          )}
        </View>
      </View>

      {user?.id === item.seller_id && ownerRequests.length > 0 && (
        <View
          style={[styles.section, { borderColor: colors.tabIconDefault }]}
          onLayout={(e) => setRequestsSectionY(e.nativeEvent.layout.y)}
        >
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Requests received</Text>
          {ownerRequests.map((order) => {
            const name = order.buyer_info?.name?.trim() || order.buyer_name?.trim() || 'Someone';
            const avatarUrl = order.buyer_info?.avatar_url;
            const phone = order.buyer_phone || order.buyer_info?.phone;
            const city = order.buyer_info?.locationName ?? '—';
            const memberSince = order.buyer_info?.memberSince ?? '—';
            const msg = buildOwnerToRequesterWhatsAppMessage(item.title, name);
            const whatsappUrl = phone ? getWhatsAppUrl(phone, msg) : null;
            const hasHandover = !!item.handover_order_id;
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
                  onPress={() => openRequesterSheet(order.buyer_id, { order, hasHandover: !!item.handover_order_id })}
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
                  <MaterialCommunityIcons name="chevron-right" size={20} color={colors.tabIconDefault} />
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
                      onPress={() => handleApproveForHandover(order.id)}
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
                      onPress={() => handleRejectRequest(order.id)}
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

      {user?.id === item.seller_id && (
        <View style={[styles.section, { borderColor: colors.tabIconDefault }]}>
          <Pressable
            style={styles.activityHeader}
            onPress={() => setActivitiesExpanded((v) => !v)}
          >
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Activities</Text>
            <Text style={[styles.activityChevron, { color: colors.tabIconDefault }]}>
              {activitiesExpanded ? '▼' : '▶'}
            </Text>
          </Pressable>
          {activitiesExpanded &&
            getActivityEvents(ownerRequests, reviews).map((evt, idx) => (
              <View key={idx} style={styles.activityRow}>
                <Text style={[styles.activityLabel, { color: colors.text }]}>{evt.label}</Text>
                <Text style={[styles.activityAt, { color: colors.tabIconDefault }]}>{formatDateTime(evt.at)}</Text>
                {evt.detail ? (
                  <Text style={[styles.activityDetail, { color: colors.tabIconDefault }]}>{evt.detail}</Text>
                ) : null}
              </View>
            ))}
        </View>
      )}

      <View style={[styles.section, { borderColor: colors.tabIconDefault }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Trust & feedback</Text>
        {user && !isProfileComplete ? (
          <View
            style={[
              styles.viewerOnlyReviewBox,
              styles.completeProfileHighlight,
              {
                borderColor: colors.tint,
                backgroundColor: colorScheme === 'dark' ? '#422006' : '#fef3c7',
              },
            ]}
          >
            <Text style={[styles.viewerOnlyReviewText, { color: colors.text }]}>
              Complete your profile first to add a rating or comment.
            </Text>
            <Text style={[styles.viewerOnlyReviewSubtext, { color: colors.secondaryText }]}>
              After completing your profile you can rate, comment, and request items.
            </Text>
            <Link href="/(tabs)/edit-profile" asChild>
              <Pressable style={[styles.reviewButton, styles.completeProfileButton, styles.completeProfileButtonBg, { backgroundColor: colors.tint }]}>
                <Text style={styles.completeProfileButtonText}>Complete profile →</Text>
              </Pressable>
            </Link>
          </View>
        ) : (
          <>
            <View style={styles.ratingRow}>
              {[1, 2, 3, 4, 5].map((star) => (
                <Pressable key={star} onPress={() => setMyRating(star)} disabled={!user || savingReview}>
                  <Text
                    style={[
                      styles.star,
                      { color: star <= myRating ? colors.tint : colors.tabIconDefault },
                    ]}
                  >
                    ★
                  </Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              style={[styles.input, { borderColor: colors.tabIconDefault, color: colors.text }]}
              placeholder="Write your experience with this product (optional)"
              placeholderTextColor={colors.tabIconDefault}
              value={myComment}
              onChangeText={setMyComment}
              multiline
            />
            <Pressable
              style={[styles.reviewButton, { backgroundColor: colors.tint }]}
              onPress={handleSaveReview}
              disabled={!user || savingReview || !myRating}
            >
              <Text style={styles.reviewButtonText}>
                {savingReview ? 'Saving…' : myRating ? 'Submit rating' : 'Select rating'}
              </Text>
            </Pressable>
          </>
        )}

        {reviews.length > 0 && (
          <View style={styles.reviewList}>
            {reviews.slice(0, 3).map((r) => {
              const reviewerName = r.profiles?.name?.trim() || 'Anonymous';
              const dt = new Date(r.created_at);
              const ts = `${dt.toLocaleDateString()} ${dt.toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}`;
              return (
                <View key={r.id} style={styles.reviewItem}>
                  <View style={styles.reviewHeader}>
                    <Link href={{ pathname: '/member/[id]', params: { id: r.reviewer_id } }} asChild>
                      <Pressable>
                        <Text style={[styles.reviewerName, { color: colors.tint }]} numberOfLines={1}>
                          {reviewerName}
                        </Text>
                      </Pressable>
                    </Link>
                    <Text style={[styles.reviewTimestamp, { color: colors.tabIconDefault }]}>{ts}</Text>
                  </View>
                  <Text style={[styles.reviewRating, { color: colors.tint }]}>
                    {'★'.repeat(r.rating)}{' '}
                    <Text style={{ color: colors.tabIconDefault }}>{'★'.repeat(5 - r.rating)}</Text>
                  </Text>
                  {r.comment ? (
                    <Text style={[styles.reviewComment, { color: colors.text }]}>{r.comment}</Text>
                  ) : null}
                </View>
              );
            })}
          </View>
        )}
      </View>

      {similar.length > 0 && (
        <View style={[styles.section, { borderColor: colors.tabIconDefault }]}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Similar in this category</Text>
            <Link href={{ pathname: '/reuse', params: { category: item.category ?? undefined } }} asChild>
              <Pressable>
                <Text style={[styles.viewAll, { color: colors.tint }]}>View all</Text>
              </Pressable>
            </Link>
          </View>
          {similar.slice(0, 5).map((s) => (
            <Link key={s.id} href={{ pathname: '/reuse-item/[id]', params: { id: s.id } }} asChild>
              <Pressable style={styles.similarRow}>
                {s.media_urls && s.media_urls.length > 0 && (
                  <Image source={{ uri: s.media_urls[0] }} style={styles.similarThumb} />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={[styles.similarTitle, { color: colors.text }]} numberOfLines={1}>
                    {s.title}
                  </Text>
                  <Text style={[styles.similarMeta, { color: colors.tabIconDefault }]}>
                    MRP ₹{s.mrp} · {s.delivery_option === 'self_pickup' ? 'Self pickup' : 'Third party'}
                  </Text>
                </View>
              </Pressable>
            </Link>
          ))}
        </View>
      )}
      <Text style={[styles.disclaimer, { color: colors.tabIconDefault }]}>
        Mana Local only provides a platform to connect people. We are not responsible for product quality,
        payments, or any legal issues. Before giving or taking a product, please carefully verify the item
        and follow standard safe practices.
      </Text>
      {user?.id !== item.seller_id && item.handover_order_id && (
        <View style={styles.handoverBanner}>
          <Text style={styles.handoverBannerText}>
            This item is in handover. No more requests accepted.
          </Text>
        </View>
      )}
      {user?.id !== item.seller_id && !item.handover_order_id && !isListingActive && (
        <View style={[styles.handoverBanner, { backgroundColor: '#b91c1c' }]}>
          <Text style={styles.handoverBannerText}>
            This listing has expired or is no longer active.
          </Text>
        </View>
      )}
      </ScrollView>
      {user?.id !== item.seller_id && !item.handover_order_id && isListingActive && !isProfileComplete && (
        <View style={[styles.orderBar, styles.viewerOnlyBar, styles.completeProfileOrderBar, { backgroundColor: colors.headerBg, borderTopColor: colors.tint }]}>
          <Text style={[styles.viewerOnlyText, { color: colors.text }]}>
            Complete your profile to request this product.
          </Text>
          <Link href="/(tabs)/edit-profile" asChild>
            <Pressable style={[styles.orderButton, styles.completeProfileButton, styles.completeProfileButtonBg, { backgroundColor: colors.tint }]}>
              <Text style={styles.completeProfileButtonText}>Complete profile →</Text>
            </Pressable>
          </Link>
        </View>
      )}
      {user?.id !== item.seller_id && !item.handover_order_id && isListingActive && isProfileComplete && (
        myOrder ? (
          <View style={[styles.orderBar, styles.viewerOnlyBar, { backgroundColor: colors.headerBg, borderTopColor: colors.tabIconDefault }]}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={[styles.orderLine, { color: colors.text }]}>
                Request submitted. Order ID: {myOrder.id.slice(0, 8).toUpperCase()}
              </Text>
              <Text style={[styles.orderSub, { color: colors.tabIconDefault }]}>
                The seller will review your request. Meanwhile you can explore more products.
              </Text>
            </View>
            <Link href="/(tabs)/reuse" asChild>
              <Pressable style={[styles.orderButton, { backgroundColor: colors.headerBg, borderWidth: 1, borderColor: colors.tabIconDefault }]}>
                <Text style={[styles.orderButtonText, { color: colors.text }]}>Find more ▶</Text>
              </Pressable>
            </Link>
          </View>
        ) : (
          <View style={[styles.orderBar, { backgroundColor: colors.headerBg, borderTopColor: colors.tabIconDefault }]}>
            <View style={{ flex: 1, marginRight: 12 }}>
              {item.delivery_option === 'third_party' ? (
                <View style={styles.deliveryChoiceRow}>
                  <Pressable
                    style={[
                      styles.deliveryChip,
                      selectedDelivery === 'self_pickup' && { backgroundColor: colors.tint },
                    ]}
                    onPress={() => setSelectedDelivery('self_pickup')}
                  >
                    <Text
                      style={[
                        styles.deliveryChipText,
                        { color: selectedDelivery === 'self_pickup' ? '#fff' : colors.text },
                      ]}
                    >
                      Self pickup
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.deliveryChip,
                      selectedDelivery === 'third_party' && { backgroundColor: colors.tint },
                    ]}
                    onPress={() => setSelectedDelivery('third_party')}
                  >
                    <Text
                      style={[
                        styles.deliveryChipText,
                        { color: selectedDelivery === 'third_party' ? '#fff' : colors.text },
                      ]}
                    >
                      Third party
                    </Text>
                  </Pressable>
                </View>
              ) : (
                <Text style={[styles.orderSub, { color: colors.tabIconDefault }]}>
                  Only self pickup available for this item.
                </Text>
              )}
              {isThirdParty ? (
                <Text style={[styles.orderLine, { color: colors.text }]}>
                  Total ₹{totalAmount.toFixed(2)}{' '}
                  <Text style={{ color: colors.tabIconDefault }}>(includes third party delivery)</Text>
                </Text>
              ) : (
                <Text style={[styles.orderLine, { color: colors.text }]}>
                  Total ₹{totalAmount.toFixed(2)}{' '}
                  <Text style={{ color: colors.tabIconDefault }}>(self pickup)</Text>
                </Text>
              )}
              {isThirdParty && (
                <Text style={[styles.orderSub, { color: colors.tabIconDefault }]}>
                  Delivery handled by partner. Seller will confirm.
                </Text>
              )}
            </View>
            <Pressable style={[styles.orderButton, { backgroundColor: colors.tint }]} onPress={handlePlaceOrder}>
              <Text style={styles.orderButtonText}>Place Order ▶</Text>
            </Pressable>
          </View>
        )
      )}

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
                        {requesterSheetRequests.map(({ order, item: reqItem }) => (
                          <Link key={order.id} href={{ pathname: '/reuse-item/[id]', params: { id: reqItem.id } }} asChild>
                            <Pressable
                              style={[styles.sheetSlideCard, { borderColor: colors.tabIconDefault }]}
                              onPress={() => setRequesterSheetUserId(null)}
                            >
                              {reqItem.media_urls?.[0] ? (
                                <Image source={{ uri: reqItem.media_urls[0] }} style={styles.sheetSlideImage} />
                              ) : (
                                <View style={[styles.sheetSlideImage, styles.sheetSlideImagePlaceholder, { backgroundColor: colors.tabIconDefault }]} />
                              )}
                              <Text style={[styles.sheetSlideTitle, { color: colors.text }]} numberOfLines={2}>{reqItem.title}</Text>
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
                  {requesterSheetContext && item && (() => {
                    const ctx = requesterSheetContext;
                    const phone = ctx.order.buyer_phone || ctx.order.buyer_info?.phone;
                    const msg = buildOwnerToRequesterWhatsAppMessage(item.title, ctx.order.buyer_name?.trim() || undefined);
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
                              openApproveModal(ctx.order.id);
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
                              openRejectModal(ctx.order.id);
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

      {/* Order success modal */}
      <Modal
        visible={!!orderSuccess}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setOrderSuccess(null)}
      >
        <View style={styles.successOverlay}>
          <Pressable style={styles.successBackdrop} onPress={() => setOrderSuccess(null)} />
          <View style={[styles.successCard, { backgroundColor: colors.background }]}>
            <Animated.View
              style={[
                styles.successIconWrap,
                {
                  transform: [
                    {
                      scale: orderSuccessAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.4, 1],
                      }),
                    },
                  ],
                },
              ]}
            >
              <View style={[styles.successIconCircle, { backgroundColor: colors.tint }]}>
                <Text style={styles.successIconText}>✓</Text>
              </View>
            </Animated.View>
            <Text style={[styles.successTitle, { color: colors.text }]}>Request sent!</Text>
            {orderSuccess && (
              <Text style={[styles.successMessage, { color: colors.tabIconDefault }]}>
                Order ID: {orderSuccess.id.slice(0, 8).toUpperCase()}
              </Text>
            )}
            <Text style={[styles.successSub, { color: colors.tabIconDefault }]}>
              The seller will review your request. Meanwhile you can explore more reuse products.
            </Text>
            <View style={styles.successButtonsRow}>
              <Pressable
                style={[styles.successSecondaryBtn, { borderColor: colors.tabIconDefault }]}
                onPress={() => setOrderSuccess(null)}
              >
                <Text style={[styles.successSecondaryText, { color: colors.text }]}>Close</Text>
              </Pressable>
              <Link href="/(tabs)/reuse" asChild>
                <Pressable
                  style={[styles.successPrimaryBtn, { backgroundColor: colors.tint }]}
                  onPress={() => setOrderSuccess(null)}
                >
                  <Text style={styles.successPrimaryText}>Find more ▶</Text>
                </Pressable>
              </Link>
            </View>
          </View>
        </View>
      </Modal>

      {/* Full-screen preview for product images and videos */}
      {item?.media_urls && mediaPreviewIndex !== null && item.media_urls[mediaPreviewIndex] && (
        <>
          <PhotoPreviewModal
            visible={!isVideoUrl(item.media_urls[mediaPreviewIndex])}
            uri={item.media_urls[mediaPreviewIndex]}
            onClose={() => setMediaPreviewIndex(null)}
          />
          <VideoPreviewModal
            visible={isVideoUrl(item.media_urls[mediaPreviewIndex])}
            uri={item.media_urls[mediaPreviewIndex]}
            onClose={() => setMediaPreviewIndex(null)}
          />
        </>
      )}

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
  page: { flex: 1 },
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerRowFixed: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backRow: {
    marginBottom: 8,
  },
  backText: {
    fontSize: 14,
    fontWeight: '600',
  },
  mediaSection: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    marginBottom: 4,
  },
  mediaSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  mediaSectionLabel: { fontSize: 13, fontWeight: '600' },
  mediaSectionHint: { fontSize: 12, fontWeight: '500' },
  imagesRow: {
    flexDirection: 'row',
    gap: 10,
  },
  mainImageTouchable: {
    flex: 2,
    aspectRatio: 1,
  },
  mainImage: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  tapOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tapOverlayText: { color: 'rgba(255,255,255,0.95)', fontSize: 12, fontWeight: '600' },
  tapOverlaySmall: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 12,
    padding: 4,
  },
  sideImages: {
    flex: 1,
    justifyContent: 'space-between',
  },
  sideImageTouchable: {
    flex: 1,
    minHeight: 0,
  },
  sideImage: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 10,
    overflow: 'hidden',
  },
  videoPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoPlaceholderText: { fontSize: 14, fontWeight: '600', marginTop: 4 },
  videoPlaceholderTextSmall: { fontSize: 10, fontWeight: '600', marginTop: 2 },
  mediaCount: { fontSize: 11, marginTop: 8, marginLeft: 2 },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 18,
    marginHorizontal: 16,
  },
  categoryPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 10,
  },
  categoryPillText: { fontSize: 12, fontWeight: '600' },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 10, lineHeight: 28 },
  body: { fontSize: 15, lineHeight: 23, marginBottom: 16 },
  priceBlock: {
    paddingTop: 14,
    marginTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  priceLabel: { fontSize: 12, fontWeight: '600', marginBottom: 2 },
  price: { fontSize: 20, fontWeight: '700', marginBottom: 4 },
  deliveryLabel: { fontSize: 14 },
  infoBlock: {
    marginTop: 16,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  infoBlockTitle: { fontSize: 13, fontWeight: '700', marginBottom: 8 },
  infoRow: { fontSize: 13, marginBottom: 4 },
  sellerBox: {
    marginTop: 18,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  sellerTitle: { fontSize: 12, fontWeight: '600', marginBottom: 10 },
  sellerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sellerAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: 12,
  },
  sellerAvatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sellerAvatarInitial: { fontSize: 20, fontWeight: '700', color: '#fff' },
  sellerInfo: { flex: 1, minWidth: 0 },
  sellerName: { fontSize: 16, fontWeight: '700', marginBottom: 2 },
  sellerMeta: { fontSize: 13 },
  editButton: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  editButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  metaRowWrap: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  meta: { fontSize: 14, marginBottom: 4 },
  section: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginBottom: 8 },
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
  handoverBanner: {
    backgroundColor: '#16a34a',
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  handoverBannerText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  viewerOnlyReviewBox: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 16,
    marginBottom: 8,
    gap: 10,
  },
  completeProfileHighlight: {
    borderWidth: 2,
  },
  viewerOnlyReviewText: { fontSize: 15, fontWeight: '600' },
  viewerOnlyReviewSubtext: { fontSize: 13, lineHeight: 18 },
  completeProfileButton: {
    marginTop: 4,
    paddingVertical: 12,
    paddingHorizontal: 20,
    minHeight: 44,
  },
  ratingRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  star: { fontSize: 24, marginRight: 4 },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    minHeight: 60,
    textAlignVertical: 'top',
    marginBottom: 8,
  },
  reviewButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 8,
  },
  completeProfileButtonBg: {
    borderWidth: 2,
    borderColor: '#4a6b1f',
  },
  completeProfileButtonText: {
    color: '#1a1a1a',
    fontWeight: '700',
    fontSize: 15,
  },
  reviewButtonText: { color: '#ffffff', fontWeight: '700', fontSize: 15 },
  reviewList: {
    marginTop: 8,
    borderTopWidth: 0.5,
    borderTopColor: '#e5e7eb',
    paddingTop: 8,
  },
  reviewItem: {
    marginBottom: 8,
  },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  reviewerName: { fontSize: 13, fontWeight: '600' },
  reviewTimestamp: { fontSize: 11 },
  reviewRating: { fontSize: 14, fontWeight: '600' },
  reviewComment: { fontSize: 14 },
  viewAll: { fontSize: 13, fontWeight: '600' },
  similarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 10,
  },
  similarThumb: {
    width: 56,
    height: 56,
    borderRadius: 8,
  },
  similarTitle: { fontSize: 14, fontWeight: '600' },
  similarMeta: { fontSize: 12 },
  disclaimer: {
    fontSize: 11,
    marginTop: 12,
    lineHeight: 16,
  },
  orderBar: {
    width: '100%',
    alignSelf: 'stretch',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 0.5,
  },
  viewerOnlyBar: { gap: 12 },
  completeProfileOrderBar: { borderTopWidth: 2 },
  viewerOnlyText: { flex: 1, fontSize: 14, fontWeight: '600' },
  orderLine: { fontSize: 16, fontWeight: '700' },
  orderSub: { fontSize: 11, marginTop: 2 },
  orderButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 999,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  orderButtonText: { color: '#ffffff', fontWeight: '700', fontSize: 15 },
  successOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    padding: 24,
  },
  successBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  successCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
  },
  successIconWrap: {
    marginBottom: 12,
  },
  successIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successIconText: { fontSize: 38, fontWeight: '800', color: '#fff' },
  successTitle: { fontSize: 20, fontWeight: '700', marginTop: 4, marginBottom: 4 },
  successMessage: { fontSize: 14, fontWeight: '600', marginBottom: 4 },
  successSub: { fontSize: 13, textAlign: 'center', marginBottom: 16 },
  successButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    alignSelf: 'stretch',
  },
  successSecondaryBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
  },
  successSecondaryText: { fontSize: 14, fontWeight: '600' },
  successPrimaryBtn: {
    flex: 1.2,
    paddingVertical: 12,
    borderRadius: 999,
    alignItems: 'center',
  },
  successPrimaryText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  deliveryChoiceRow: {
    flexDirection: 'row',
    marginBottom: 4,
    gap: 8,
  },
  deliveryChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  deliveryChipText: {
    fontSize: 11,
    fontWeight: '600',
  },
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
