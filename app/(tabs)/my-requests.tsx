import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Link, useRouter } from 'expo-router';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { supabase } from '@/src/lib/supabase';
import { requestWithTimeout, TIMEOUT_MESSAGE } from '@/src/lib/requestWithTimeout';
import { useAuth } from '@/src/contexts/AuthContext';
import type { Post, ReuseItem, ReuseOrder } from '@/src/lib/types';
import { POST_CATEGORIES } from '@/src/lib/types';
import { MediaWithWatermark } from '@/components/MediaWithWatermark';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { isVideoUrl } from '@/constants/MediaLimits';

type OrderWithItem = ReuseOrder & { item?: Pick<ReuseItem, 'id' | 'title' | 'media_urls' | 'selling_price' | 'delivery_option'> | null };

type MyPost = Post & { comment_count?: number };
type TabKind = 'post' | 'products';

export default function MyRequestsScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const [activeTab, setActiveTab] = useState<TabKind>('post');
  const [myPosts, setMyPosts] = useState<MyPost[]>([]);
  const [orders, setOrders] = useState<OrderWithItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cancelOrder, setCancelOrder] = useState<OrderWithItem | null>(null);
  const [cancelNote, setCancelNote] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);

  const loadPosts = useCallback(async () => {
    if (!user?.id) {
      setMyPosts([]);
      return;
    }
    try {
      const { data: postsData, error } = await requestWithTimeout(
        supabase
          .from('posts')
          .select('*')
          .eq('author_id', user.id)
          .order('created_at', { ascending: false })
      );
      if (error) {
        console.warn('Failed to load my posts', error);
        setMyPosts([]);
        return;
      }
      const posts = (postsData ?? []) as MyPost[];
      if (posts.length === 0) {
        setMyPosts([]);
        return;
      }
      const postIds = posts.map((p) => p.id);
      const { data: commentsData } = await supabase
        .from('comments')
        .select('post_id')
        .in('post_id', postIds)
        .not('approved_at', 'is', null);
      const countByPost = new Map<string, number>();
      for (const p of postIds) countByPost.set(p, 0);
      for (const row of commentsData ?? []) {
        const pid = (row as { post_id: string }).post_id;
        countByPost.set(pid, (countByPost.get(pid) ?? 0) + 1);
      }
      setMyPosts(
        posts.map((p) => ({ ...p, comment_count: countByPost.get(p.id) ?? 0 }))
      );
    } catch (e) {
      console.warn('Error loading my posts', e);
      setMyPosts([]);
    }
  }, [user?.id]);

  const load = useCallback(async () => {
    if (!user?.id) {
      setOrders([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const { data: ordersData, error } = await requestWithTimeout(
        supabase
          .from('reuse_orders')
          .select('*')
          .eq('buyer_id', user.id)
          .order('created_at', { ascending: false })
      );
      if (error) {
        console.warn('Failed to load reuse orders as buyer', error);
        Alert.alert('Could not load requests', error.message || 'Please try again.');
        setOrders([]);
        return;
      }
      const baseOrders = (ordersData ?? []) as ReuseOrder[];
      if (!baseOrders.length) {
        setOrders([]);
        return;
      }
      const itemIds = Array.from(new Set(baseOrders.map((o) => o.reuse_item_id)));
      const { data: itemsData } = await requestWithTimeout(
        supabase
          .from('reuse_items')
          .select('id, title, media_urls, selling_price, delivery_option')
          .in('id', itemIds)
      );
      const items = (itemsData ?? []) as Pick<ReuseItem, 'id' | 'title' | 'media_urls' | 'selling_price' | 'delivery_option'>[];
      const itemMap = new Map(items.map((it) => [it.id, it]));
      setOrders(
        baseOrders.map((o) => ({
          ...o,
          item: itemMap.get(o.reuse_item_id) ?? null,
        }))
      );
    } catch (e: unknown) {
      console.warn('Unexpected error loading buyer requests', e);
      Alert.alert('Could not load requests', TIMEOUT_MESSAGE);
      setOrders([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => {
    load();
    loadPosts();
  }, [load, loadPosts]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
    loadPosts();
  }, [load, loadPosts]);

  const handleDeletePost = useCallback(
    async (post: MyPost) => {
      Alert.alert(
        'Delete post?',
        'This cannot be undone. The post will be removed from the community.',
        [
          { text: 'Keep', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              if (!user?.id) return;
              setDeletingPostId(post.id);
              try {
                const { error } = await supabase.from('posts').delete().eq('id', post.id).eq('author_id', user.id);
                if (error) throw error;
                setMyPosts((prev) => prev.filter((p) => p.id !== post.id));
              } catch (e) {
                Alert.alert('Error', 'Could not delete post. Try again.');
              } finally {
                setDeletingPostId(null);
              }
            },
          },
        ]
      );
    },
    [user?.id]
  );

  const openCancelModal = (order: OrderWithItem) => {
    setCancelOrder(order);
    setCancelNote('');
  };

  const submitCancel = async () => {
    if (!cancelOrder) return;
    const note = cancelNote.trim();
    if (!note) {
      Alert.alert('Add a comment', 'Please tell the seller why you are cancelling this request.');
      return;
    }
    try {
      setCancelling(true);
      const now = new Date().toISOString();
      const { error } = await requestWithTimeout(
        supabase
          .from('reuse_orders')
          .update({ status: 'cancelled', note, status_changed_at: now })
          .eq('id', cancelOrder.id)
          .eq('buyer_id', cancelOrder.buyer_id)
      );
      if (error) {
        Alert.alert('Could not cancel request', error.message || 'Please try again.');
        return;
      }
      setOrders((prev) =>
        prev.map((o) =>
          o.id === cancelOrder.id ? { ...o, status: 'cancelled', note, status_changed_at: now } : o
        )
      );
      setCancelOrder(null);
      setCancelNote('');
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message === 'REQUEST_TIMEOUT' ? TIMEOUT_MESSAGE : (e as Error)?.message || TIMEOUT_MESSAGE;
      Alert.alert('Could not cancel request', msg);
    } finally {
      setCancelling(false);
    }
  };

  const renderStatus = (order: ReuseOrder) => {
    let label = order.status;
    let color = '#4b5563';
    if (order.status === 'pending') {
      label = 'Pending';
      color = '#d97706';
    } else if (order.status === 'accepted') {
      label = 'Handovered';
      color = '#16a34a';
    } else if (order.status === 'rejected') {
      label = 'Rejected';
      color = '#dc2626';
    } else if (order.status === 'cancelled') {
      label = 'Cancelled';
      color = '#6b7280';
    }
    return (
      <View style={[styles.statusPill, { borderColor: color }]}>
        <Text style={[styles.statusPillText, { color }]}>{label}</Text>
      </View>
    );
  };

  const renderItem = ({ item }: { item: OrderWithItem }) => {
    const dt = new Date(item.created_at);
    const createdStr = dt.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    const shortId = item.id.slice(0, 8).toUpperCase();
    const canCancel = item.status === 'pending';
    return (
      <View style={[styles.card, { borderColor: colors.tabIconDefault, backgroundColor: colors.cardBg ?? colors.background }]}>
        <View style={styles.cardRow}>
          {item.item?.media_urls?.[0] ? (
            <MediaWithWatermark style={styles.thumb}>
              <Image source={{ uri: item.item.media_urls[0] }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            </MediaWithWatermark>
          ) : (
            <View style={[styles.thumbPlaceholder, { backgroundColor: colors.tabIconDefault }]} />
          )}
          <View style={styles.cardBody}>
            <View style={styles.cardHeaderRow}>
              <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
                {item.item?.title ?? 'Product removed'}
              </Text>
              {renderStatus(item)}
            </View>
            <Text style={[styles.orderMeta, { color: colors.tabIconDefault }]}>
              Order ID: {shortId} · Requested {createdStr}
            </Text>
            {item.item ? (
              <Text style={[styles.orderMeta, { color: colors.tabIconDefault }]}>
                Offer ₹{item.item.selling_price.toFixed(2)} ·{' '}
                {item.item.delivery_option === 'third_party' ? 'Third party delivery' : 'Self pickup'}
              </Text>
            ) : null}
            {item.note && item.status === 'cancelled' && (
              <Text style={[styles.cancelNote, { color: colors.tabIconDefault }]}>
                You wrote: {item.note}
              </Text>
            )}
          </View>
        </View>
        <View style={styles.cardFooter}>
          <Link href={{ pathname: '/reuse-item/[id]', params: { id: item.reuse_item_id } }} asChild>
            <Pressable style={[styles.viewBtn, { borderColor: colors.tint }]}>
              <Text style={[styles.viewBtnText, { color: colors.tint }]}>View product</Text>
            </Pressable>
          </Link>
          {canCancel && (
            <Pressable
              style={[styles.cancelBtn, { borderColor: '#dc2626' }]}
              onPress={() => openCancelModal(item)}
            >
              <Text style={[styles.cancelBtnText, { color: '#dc2626' }]}>Cancel request</Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  };

  if (!user?.id) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.text, fontSize: 16 }}>Sign in to see your requests.</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.tint} />
      </View>
    );
  }

  const renderPostItem = ({ item }: { item: MyPost }) => {
    const isLive = !!item.approved_at;
    const categoryLabel = POST_CATEGORIES.find((c) => c.value === item.category)?.label ?? item.category;
    const coverUrl = item.media_urls?.[0];
    const isVideo = coverUrl ? isVideoUrl(coverUrl) : false;
    const deleting = deletingPostId === item.id;

    return (
      <View style={[styles.card, { borderColor: colors.tabIconDefault, backgroundColor: colors.cardBg ?? colors.background }]}>
        <View style={styles.cardRow}>
          {coverUrl ? (
            <MediaWithWatermark style={styles.thumb}>
              {isVideo ? (
                <View style={[styles.thumbPlaceholder, { backgroundColor: colors.tabIconDefault + '40' }]}>
                  <MaterialCommunityIcons name="play-circle-outline" size={24} color={colors.tint} />
                </View>
              ) : (
                <Image source={{ uri: coverUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
              )}
            </MediaWithWatermark>
          ) : (
            <View style={[styles.thumbPlaceholder, { backgroundColor: colors.tabIconDefault }]} />
          )}
          <View style={styles.cardBody}>
            <View style={[styles.postStatusRow, { marginBottom: 4 }]}>
              <View style={[styles.statusPill, { borderColor: isLive ? '#16a34a' : '#d97706' }]}>
                <Text style={[styles.statusPillText, { color: isLive ? '#16a34a' : '#d97706' }]}>
                  {isLive ? 'Live' : 'Pending'}
                </Text>
              </View>
              <Text style={[styles.postCategory, { color: colors.tabIconDefault }]}>{categoryLabel}</Text>
            </View>
            <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
              {item.title || 'Untitled post'}
            </Text>
            <View style={[styles.analyticsRow, { marginTop: 8 }]}>
              <Text style={[styles.analyticsText, { color: colors.tabIconDefault }]}>
                {item.view_count ?? 0} views · {item.like_count ?? 0} likes · {item.share_count ?? 0} shares · {item.comment_count ?? 0} comments
              </Text>
            </View>
            <Text style={[styles.encourageText, { color: colors.tint }]}>
              More content gets more engagement — consider adding updates.
            </Text>
          </View>
        </View>
        <View style={styles.cardFooter}>
          <Link href={{ pathname: '/post/[id]', params: { id: item.id } }} asChild>
            <Pressable style={[styles.viewBtn, { borderColor: colors.tint }]}>
              <Text style={[styles.viewBtnText, { color: colors.tint }]}>View</Text>
            </Pressable>
          </Link>
          <Link href={{ pathname: '/(tabs)/edit-post/[id]', params: { id: item.id } }} asChild>
            <Pressable style={[styles.viewBtn, { borderColor: colors.tabIconDefault }]}>
              <Text style={[styles.viewBtnText, { color: colors.text }]}>Edit</Text>
            </Pressable>
          </Link>
          <Pressable
            style={[styles.cancelBtn, { borderColor: '#dc2626' }]}
            onPress={() => handleDeletePost(item)}
            disabled={deleting}
          >
            {deleting ? (
              <ActivityIndicator size="small" color="#dc2626" />
            ) : (
              <Text style={[styles.cancelBtnText, { color: '#dc2626' }]}>Delete</Text>
            )}
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.headerRow, { borderBottomColor: colors.tabIconDefault }]}>
        <Pressable onPress={() => router.back()}>
          <Text style={[styles.backText, { color: colors.tint }]}>← Back</Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>My requests</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={[styles.tabRow, { borderBottomColor: colors.border ?? colors.tabIconDefault }]}>
        <Pressable
          style={[styles.tab, activeTab === 'post' && { borderBottomColor: colors.tint, borderBottomWidth: 2 }]}
          onPress={() => setActiveTab('post')}
        >
          <MaterialCommunityIcons
            name="post-outline"
            size={20}
            color={activeTab === 'post' ? colors.tint : colors.tabIconDefault}
          />
          <Text style={[styles.tabLabel, { color: activeTab === 'post' ? colors.tint : colors.tabIconDefault }]}>
            Post
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, activeTab === 'products' && { borderBottomColor: colors.tint, borderBottomWidth: 2 }]}
          onPress={() => setActiveTab('products')}
        >
          <MaterialCommunityIcons
            name="package-variant"
            size={20}
            color={activeTab === 'products' ? colors.tint : colors.tabIconDefault}
          />
          <Text style={[styles.tabLabel, { color: activeTab === 'products' ? colors.tint : colors.tabIconDefault }]}>
            Products
          </Text>
        </Pressable>
      </View>

      {activeTab === 'post' ? (
        myPosts.length === 0 ? (
          <View style={styles.emptyBox}>
            <MaterialCommunityIcons name="post-outline" size={48} color={colors.tabIconDefault} style={{ marginBottom: 12 }} />
            <Text style={[styles.emptyText, { color: colors.tabIconDefault }]}>
              You haven&apos;t created any posts yet.
            </Text>
            <Text style={[styles.emptySubtext, { color: colors.tabIconDefault }]}>
              Share with the community from the Community tab.
            </Text>
          </View>
        ) : (
          <FlatList
            data={myPosts}
            keyExtractor={(p) => p.id}
            contentContainerStyle={styles.listContent}
            renderItem={renderPostItem}
            refreshing={refreshing}
            onRefresh={onRefresh}
          />
        )
      ) : orders.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={[styles.emptyText, { color: colors.tabIconDefault }]}>
            You haven&apos;t requested any products yet.
          </Text>
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(o) => o.id}
          contentContainerStyle={styles.listContent}
          renderItem={renderItem}
          refreshing={refreshing}
          onRefresh={onRefresh}
        />
      )}

      <Modal
        visible={!!cancelOrder}
        transparent
        animationType="fade"
        onRequestClose={() => (cancelling ? null : setCancelOrder(null))}
      >
        <KeyboardAvoidingView
          style={styles.cancelOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 40 : 0}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => !cancelling && setCancelOrder(null)} />
          <View style={[styles.cancelCard, { backgroundColor: colors.background, borderColor: colors.tabIconDefault }]}>
            <Text style={[styles.cancelTitle, { color: colors.text }]}>Cancel request</Text>
            {cancelOrder && (
              <Text style={[styles.cancelSubtitle, { color: colors.tabIconDefault }]}>
                Order ID: {cancelOrder.id.slice(0, 8).toUpperCase()}
              </Text>
            )}
            <Text style={[styles.cancelLabel, { color: colors.text }]}>Comment (required)</Text>
            <TextInput
              style={[styles.cancelInput, { color: colors.text, borderColor: colors.tabIconDefault }]}
              placeholder="Tell the seller why you are cancelling…"
              placeholderTextColor={colors.tabIconDefault}
              value={cancelNote}
              onChangeText={setCancelNote}
              multiline
              editable={!cancelling}
            />
            <View style={styles.cancelActions}>
              <Pressable
                style={[styles.cancelSecondaryBtn, { borderColor: colors.tabIconDefault }]}
                onPress={() => !cancelling && setCancelOrder(null)}
              >
                <Text style={[styles.cancelSecondaryText, { color: colors.text }]}>Keep request</Text>
              </Pressable>
              <Pressable
                style={[styles.cancelPrimaryBtn, { backgroundColor: '#dc2626' }]}
                onPress={submitCancel}
                disabled={cancelling}
              >
                <Text style={styles.cancelPrimaryText}>{cancelling ? 'Cancelling…' : 'Confirm cancel'}</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backText: { fontSize: 15 },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  tabRow: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  tabLabel: { fontSize: 15, fontWeight: '600' },
  postStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  postCategory: { fontSize: 11 },
  analyticsRow: {},
  analyticsText: { fontSize: 12 },
  encourageText: { fontSize: 11, fontStyle: 'italic', marginTop: 4 },
  emptySubtext: { fontSize: 13, marginTop: 8, textAlign: 'center' },
  listContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: 24,
    gap: 12,
  },
  card: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  cardRow: { flexDirection: 'row', gap: 10 },
  thumb: { width: 64, height: 64, borderRadius: 8 },
  thumbPlaceholder: { width: 64, height: 64, borderRadius: 8, opacity: 0.2 },
  cardBody: { flex: 1 },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 2,
  },
  title: { fontSize: 15, fontWeight: '600', flex: 1 },
  orderMeta: { fontSize: 12, marginTop: 2 },
  cancelNote: { fontSize: 11, marginTop: 4, fontStyle: 'italic' },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
  },
  viewBtn: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  viewBtnText: { fontSize: 13, fontWeight: '600' },
  cancelBtn: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  cancelBtnText: { fontSize: 13, fontWeight: '600' },
  statusPill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 2,
    marginLeft: 8,
  },
  statusPillText: { fontSize: 11, fontWeight: '600' },
  emptyBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptyText: { fontSize: 14, textAlign: 'center' },
  cancelOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    padding: 24,
  },
  cancelCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  cancelTitle: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  cancelSubtitle: { fontSize: 13, marginBottom: 12 },
  cancelLabel: { fontSize: 13, fontWeight: '600', marginBottom: 4 },
  cancelInput: {
    borderWidth: 1,
    borderRadius: 10,
    minHeight: 80,
    padding: 10,
    fontSize: 14,
    textAlignVertical: 'top',
    marginBottom: 14,
  },
  cancelActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  cancelSecondaryBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
  },
  cancelSecondaryText: { fontSize: 14, fontWeight: '600' },
  cancelPrimaryBtn: {
    flex: 1.2,
    paddingVertical: 10,
    borderRadius: 999,
    alignItems: 'center',
  },
  cancelPrimaryText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  statusPillRow: {},
});

