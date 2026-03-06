import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Link, useRouter } from 'expo-router';
import { supabase } from '@/src/lib/supabase';
import { requestWithTimeout, TIMEOUT_MESSAGE } from '@/src/lib/requestWithTimeout';
import { useAuth } from '@/src/contexts/AuthContext';
import { useRole } from '@/src/contexts/RoleContext';
import type { ReuseItem } from '@/src/lib/types';
import { REUSE_CATEGORIES } from '@/src/lib/types';
import { formatExpiryShort } from '@/src/lib/formatExpiry';
import { MediaWithWatermark } from '@/components/MediaWithWatermark';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';

const DEFAULT_APPROVE_COMMENT = 'Approved for listing.';
const DEFAULT_REJECT_COMMENT = 'Does not meet community guidelines.';
const DEFAULT_HOLD_COMMENT = 'Put on hold.';

type FilterTab = 'all' | 'pending' | 'approved' | 'rejected';

function itemStatus(item: ReuseItem & { rejected_at?: string | null }): 'pending' | 'approved' | 'rejected' {
  if (item.rejected_at) return 'rejected';
  if (item.approved_at) return 'approved';
  return 'pending';
}

export default function ApproveReuseScreen() {
  const { user } = useAuth();
  const { activeRole } = useRole();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const [items, setItems] = useState<(ReuseItem & { rejected_at?: string | null })[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionModal, setActionModal] = useState<'approve' | 'reject' | 'hold' | null>(null);
  const [modalItem, setModalItem] = useState<(ReuseItem & { rejected_at?: string | null }) | null>(null);
  const [modalComment, setModalComment] = useState('');

  const isModerator = activeRole?.code === 'admin' || activeRole?.code === 'reviewer';

  const load = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('reuse_items')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('Failed to load reuse items', error);
        setItems([]);
      } else {
        setItems((data ?? []) as (ReuseItem & { rejected_at?: string | null })[]);
      }
    } catch (e) {
      console.warn('Manage products load error', e);
      setItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  const filteredItems = filterTab === 'all'
    ? items
    : filterTab === 'pending'
    ? items.filter((i) => itemStatus(i) === 'pending')
    : filterTab === 'approved'
    ? items.filter((i) => itemStatus(i) === 'approved')
    : items.filter((i) => itemStatus(i) === 'rejected');

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  const openApproveModal = (item: ReuseItem & { rejected_at?: string | null }) => {
    setModalItem(item);
    setModalComment(DEFAULT_APPROVE_COMMENT);
    setActionModal('approve');
  };

  const openRejectModal = (item: ReuseItem & { rejected_at?: string | null }) => {
    setModalItem(item);
    setModalComment(DEFAULT_REJECT_COMMENT);
    setActionModal('reject');
  };

  const openHoldModal = (item: ReuseItem & { rejected_at?: string | null }) => {
    setModalItem(item);
    setModalComment(DEFAULT_HOLD_COMMENT);
    setActionModal('hold');
  };

  const closeModal = () => {
    setActionModal(null);
    setModalItem(null);
    setModalComment('');
  };

  const submitAction = async () => {
    if (!isModerator || !modalItem || !actionModal) return;
    const item = modalItem;
    const action = actionModal;
    const comment = modalComment.trim() || (action === 'approve' ? DEFAULT_APPROVE_COMMENT : action === 'reject' ? DEFAULT_REJECT_COMMENT : DEFAULT_HOLD_COMMENT);
    setBusyId(item.id);
    closeModal();
    try {
      const now = new Date().toISOString();
      if (action === 'approve') {
        const expiresAt = new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString();
        const { error } = await requestWithTimeout(
          supabase
            .from('reuse_items')
            .update({
              approved_at: now,
              rejected_at: null,
              admin_comment: comment,
              updated_at: now,
              expires_at: expiresAt,
              is_active: true,
            })
            .eq('id', item.id)
        );
        if (error) {
          Alert.alert('Could not approve', error.message || 'Please try again.');
          return;
        }
      } else if (action === 'reject') {
        const { error } = await requestWithTimeout(
          supabase
            .from('reuse_items')
            .update({
              rejected_at: now,
              admin_comment: comment,
              updated_at: now,
            })
            .eq('id', item.id)
        );
        if (error) {
          Alert.alert('Could not reject', error.message || 'Please try again.');
          return;
        }
      } else {
        const { error } = await requestWithTimeout(
          supabase
            .from('reuse_items')
            .update({
              is_active: false,
              admin_comment: comment,
              updated_at: now,
            })
            .eq('id', item.id)
        );
        if (error) {
          Alert.alert('Could not put on hold', error.message || 'Please try again.');
          return;
        }
      }
      setItems((prev) =>
        prev.map((i) =>
          i.id === item.id
            ? {
                ...i,
                approved_at: action === 'approve' ? now : i.approved_at,
                rejected_at: action === 'reject' ? now : action === 'approve' ? null : i.rejected_at,
                is_active: action === 'approve' ? true : action === 'hold' ? false : i.is_active,
                admin_comment: comment,
                updated_at: now,
                ...(action === 'approve' ? { expires_at: expiresAt } : {}),
              }
            : i
        )
      );
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message === 'REQUEST_TIMEOUT' ? TIMEOUT_MESSAGE : (e as Error)?.message ?? `Could not ${action}. Try again.`;
      Alert.alert(`Could not ${action}`, msg);
    } finally {
      setBusyId(null);
    }
  };

  const setActive = async (item: ReuseItem & { rejected_at?: string | null }, active: boolean) => {
    if (!isModerator) return;
    setBusyId(item.id);
    try {
      const now = new Date().toISOString();
      const updates: Record<string, unknown> = { is_active: active, updated_at: now };
      if (active) updates.expires_at = new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString();
      const { error } = await requestWithTimeout(
        supabase.from('reuse_items').update(updates).eq('id', item.id)
      );
      if (error) {
        Alert.alert(active ? 'Could not activate' : 'Could not deactivate', error.message || 'Please try again.');
        return;
      }
      setItems((prev) =>
        prev.map((i) =>
          i.id === item.id ? { ...i, is_active: active, updated_at: now, ...(active && i.approved_at ? { expires_at: (updates.expires_at as string) } : {}) } : i
        )
      );
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message === 'REQUEST_TIMEOUT' ? TIMEOUT_MESSAGE : (e as Error)?.message ?? 'Please try again.';
      Alert.alert(active ? 'Could not activate' : 'Could not deactivate', msg);
    } finally {
      setBusyId(null);
    }
  };

  if (!isModerator) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Text style={[styles.forbidden, { color: colors.text }]}>
          Only Admin or Reviewer can manage products.
        </Text>
        <Pressable style={[styles.backBtn, { marginTop: 16 }]} onPress={() => router.replace('/(tabs)/profile')}>
          <Text style={{ color: colors.tint, fontWeight: '600' }}>Back</Text>
        </Pressable>
      </View>
    );
  }

  const modalTitle =
    actionModal === 'approve' ? 'Approve listing' : actionModal === 'reject' ? 'Reject listing' : 'Put on hold';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.headerRow, { borderBottomColor: colors.tabIconDefault }]}>
        <Pressable onPress={() => router.replace('/(tabs)/profile')} style={styles.backButton}>
          <Text style={[styles.backText, { color: colors.tint }]}>← Back</Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Manage products</Text>
      </View>

      <View style={[styles.tabRow, { borderBottomColor: colors.tabIconDefault }]}>
        {(['all', 'pending', 'approved', 'rejected'] as const).map((tab) => (
          <Pressable
            key={tab}
            style={[styles.tab, filterTab === tab && { borderBottomColor: colors.tint, borderBottomWidth: 2 }]}
            onPress={() => setFilterTab(tab)}
          >
            <Text style={[styles.tabText, { color: filterTab === tab ? colors.tint : colors.tabIconDefault }]}>
              {tab === 'all' ? 'All' : tab === 'pending' ? 'Pending' : tab === 'approved' ? 'Approved' : 'Rejected'}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.tint} />
        }
      >
        {loading && items.length === 0 ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={colors.tint} />
          </View>
        ) : filteredItems.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={[styles.emptyText, { color: colors.tabIconDefault }]}>
              {filterTab === 'all' ? 'No products.' : `No ${filterTab} products.`}
            </Text>
          </View>
        ) : (
          filteredItems.map((item) => {
            const categoryLabel =
              item.category && REUSE_CATEGORIES.find((c) => c.value === item.category)?.label;
            const status = itemStatus(item);
            const isBusy = busyId === item.id;
            const isActive = item.is_active !== false;

            return (
              <View
                key={item.id}
                style={[styles.card, { backgroundColor: colors.background, borderColor: colors.tabIconDefault }]}
              >
                <View style={styles.cardRow}>
                  {item.media_urls?.[0] ? (
                    <MediaWithWatermark style={styles.thumb}>
                      <Image source={{ uri: item.media_urls[0] }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                    </MediaWithWatermark>
                  ) : (
                    <View style={[styles.thumbPlaceholder, { backgroundColor: colors.tabIconDefault }]} />
                  )}
                  <View style={styles.cardBody}>
                    <View style={styles.titleRow}>
                      <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
                        {item.title}
                      </Text>
                      <View
                        style={[
                          styles.statusBadge,
                          status === 'pending' && { backgroundColor: '#d9770620' },
                          status === 'approved' && { backgroundColor: '#22c55e20' },
                          status === 'rejected' && { backgroundColor: '#ef444420' },
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusBadgeText,
                            status === 'pending' && { color: '#d97706' },
                            status === 'approved' && { color: '#16a34a' },
                            status === 'rejected' && { color: '#dc2626' },
                          ]}
                        >
                          {status.charAt(0).toUpperCase() + status.slice(1)}
                        </Text>
                      </View>
                    </View>
                    {categoryLabel && (
                      <Text style={[styles.category, { color: colors.tabIconDefault }]}>{categoryLabel}</Text>
                    )}
                    <Text style={[styles.meta, { color: colors.tabIconDefault }]} numberOfLines={1}>
                      MRP ₹{item.mrp} · {status === 'approved' ? (isActive ? 'Active' : 'Inactive') : status.charAt(0).toUpperCase() + status.slice(1)}
                    </Text>
                    <Text style={[styles.meta, styles.metaRow, { color: colors.tabIconDefault }]} numberOfLines={1}>
                      Submitted {new Date(item.created_at).toLocaleDateString()}
                      {item.expires_at && status === 'approved' && formatExpiryShort(item.expires_at) ? (
                        <> · {formatExpiryShort(item.expires_at)}</>
                      ) : ''}
                    </Text>
                  </View>
                </View>
                <View style={styles.actions}>
                  <Link href={{ pathname: '/reuse-item/[id]', params: { id: item.id } }} asChild>
                    <Pressable style={[styles.viewBtn, { borderColor: colors.tint }]}>
                      <Text style={[styles.viewBtnText, { color: colors.tint }]}>View</Text>
                    </Pressable>
                  </Link>
                  {status === 'pending' && (
                    <>
                      <Pressable
                        style={[styles.rejectBtn, { borderColor: '#dc2626' }]}
                        onPress={() => openRejectModal(item)}
                        disabled={!!isBusy}
                      >
                        <Text style={[styles.rejectBtnText, { color: '#dc2626' }]}>Reject</Text>
                      </Pressable>
                      <Pressable
                        style={[styles.approveBtn, { backgroundColor: colors.tint }]}
                        onPress={() => openApproveModal(item)}
                        disabled={!!isBusy}
                      >
                        {isBusy ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Text style={styles.approveBtnText}>Approve</Text>
                        )}
                      </Pressable>
                    </>
                  )}
                  {status === 'approved' && !item.handover_order_id && (
                    <>
                      <Pressable
                        style={[styles.secondaryBtn, { borderColor: colors.tabIconDefault }]}
                        onPress={() => openHoldModal(item)}
                        disabled={!!isBusy}
                      >
                        <Text style={[styles.secondaryBtnText, { color: colors.text }]}>Hold</Text>
                      </Pressable>
                      {isActive ? (
                        <Pressable
                          style={[styles.secondaryBtn, { borderColor: colors.tabIconDefault }]}
                          onPress={() => setActive(item, false)}
                          disabled={!!isBusy}
                        >
                          {isBusy ? (
                            <ActivityIndicator size="small" color={colors.tabIconDefault} />
                          ) : (
                            <Text style={[styles.secondaryBtnText, { color: colors.text }]}>Deactivate</Text>
                          )}
                        </Pressable>
                      ) : (
                        <Pressable
                          style={[styles.activateBtn, { backgroundColor: '#22c55e' }]}
                          onPress={() => setActive(item, true)}
                          disabled={!!isBusy}
                        >
                          {isBusy ? (
                            <ActivityIndicator size="small" color="#fff" />
                          ) : (
                            <Text style={styles.approveBtnText}>Activate</Text>
                          )}
                        </Pressable>
                      )}
                      <Pressable
                        style={[styles.rejectBtn, { borderColor: '#dc2626' }]}
                        onPress={() => openRejectModal(item)}
                        disabled={!!isBusy}
                      >
                        <Text style={[styles.rejectBtnText, { color: '#dc2626' }]}>Reject</Text>
                      </Pressable>
                    </>
                  )}
                  {status === 'rejected' && (
                    <Pressable
                      style={[styles.approveBtn, { backgroundColor: colors.tint }]}
                      onPress={() => openApproveModal(item)}
                      disabled={!!isBusy}
                    >
                      {isBusy ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={styles.approveBtnText}>Approve</Text>
                      )}
                    </Pressable>
                  )}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      <Modal visible={!!actionModal} transparent animationType="fade">
        <Pressable style={styles.modalBackdrop} onPress={closeModal}>
          <Pressable style={[styles.modalBox, { backgroundColor: colors.background, borderColor: colors.tabIconDefault }]} onPress={(e) => e.stopPropagation()}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>{modalTitle}</Text>
            <Text style={[styles.modalHint, { color: colors.tabIconDefault }]}>Comment (seller may see this)</Text>
            <TextInput
              style={[styles.modalInput, { color: colors.text, borderColor: colors.tabIconDefault }]}
              placeholder="Comment"
              placeholderTextColor={colors.tabIconDefault}
              value={modalComment}
              onChangeText={setModalComment}
              multiline
              numberOfLines={3}
            />
            <View style={styles.modalActions}>
              <Pressable style={[styles.modalBtn, { borderColor: colors.tabIconDefault }]} onPress={closeModal}>
                <Text style={{ color: colors.text, fontWeight: '600' }}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.modalBtn,
                  actionModal === 'approve' && { backgroundColor: colors.tint },
                  actionModal === 'reject' && styles.modalBtnReject,
                  actionModal === 'hold' && { backgroundColor: colors.tabIconDefault },
                ]}
                onPress={submitAction}
              >
                <Text style={styles.modalBtnPrimaryText}>
                  {actionModal === 'approve' ? 'Approve' : actionModal === 'reject' ? 'Reject' : 'Put on hold'}
                </Text>
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
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  forbidden: { fontSize: 16, textAlign: 'center' },
  backBtn: { padding: 8 },
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
  tabRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    paddingHorizontal: 8,
  },
  tab: { paddingVertical: 12, paddingHorizontal: 12, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabText: { fontSize: 14, fontWeight: '600' },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  emptyBox: { paddingVertical: 48, alignItems: 'center' },
  emptyText: { fontSize: 16 },
  card: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  cardRow: { flexDirection: 'row', marginBottom: 12 },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: 8,
    marginRight: 12,
  },
  thumbPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 8,
    marginRight: 12,
    opacity: 0.3,
  },
  cardBody: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  title: { fontSize: 16, fontWeight: '600', flex: 1 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  statusBadgeText: { fontSize: 11, fontWeight: '600' },
  category: { fontSize: 12, marginBottom: 2 },
  meta: { fontSize: 12 },
  metaRow: { marginTop: 2 },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  viewBtn: {
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  viewBtnText: { fontSize: 14, fontWeight: '600' },
  rejectBtn: {
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  rejectBtnText: { fontSize: 14, fontWeight: '600' },
  secondaryBtn: {
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  secondaryBtnText: { fontSize: 13, fontWeight: '600' },
  activateBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  approveBtn: {
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 8,
    minWidth: 80,
    alignItems: 'center',
  },
  approveBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalBox: {
    width: '100%',
    maxWidth: 360,
    borderWidth: 1,
    borderRadius: 12,
    padding: 20,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 12 },
  modalHint: { fontSize: 13, marginBottom: 8 },
  modalInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 20, justifyContent: 'flex-end' },
  modalBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    minWidth: 90,
    alignItems: 'center',
  },
  modalBtnReject: { backgroundColor: '#dc2626' },
  modalBtnPrimaryText: { color: '#fff', fontWeight: '600', fontSize: 15 },
});
