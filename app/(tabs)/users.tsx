import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Image,
  Linking,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Link, useRouter } from 'expo-router';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { supabase } from '@/src/lib/supabase';
import { requestWithTimeout, TIMEOUT_MESSAGE } from '@/src/lib/requestWithTimeout';
import { useRole } from '@/src/contexts/RoleContext';
import type { Profile, Role, ReuseItem, ReuseOrder } from '@/src/lib/types';
import { REUSE_CATEGORIES } from '@/src/lib/types';
import { getWhatsAppUrl } from '@/src/lib/whatsapp';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';

const PAGE_SIZE = 20;

type RoleEntry = { id: string; roleId: string; label: string };

type UserRow = {
  profile: Profile;
  reportCount: number;
  roleEntries: RoleEntry[];
};

function escapeIlike(q: string): string {
  return q.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

function formatMemberSince(createdAt: string | null | undefined): string {
  if (!createdAt) return '—';
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return '—';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getMonth()]} ${d.getFullYear()}`;
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
}

export default function UsersScreen() {
  const { activeRole, roles } = useRole();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const [list, setList] = useState<UserRow[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [assignModalUserId, setAssignModalUserId] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);
  const [removingRoleId, setRemovingRoleId] = useState<string | null>(null);
  const [userSheetUserId, setUserSheetUserId] = useState<string | null>(null);
  const [userSheetProfile, setUserSheetProfile] = useState<Profile | null>(null);
  const [userSheetProducts, setUserSheetProducts] = useState<ReuseItem[]>([]);
  const [userSheetRequests, setUserSheetRequests] = useState<{ order: ReuseOrder; item: ReuseItem }[]>([]);
  const [userSheetLocationName, setUserSheetLocationName] = useState<string | null>(null);
  const [userSheetLoading, setUserSheetLoading] = useState(false);

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
        const next = Math.min(sheetMaxHeight, Math.max(sheetMinHeight, sheetDragStartHeight.current - gestureState.dy));
        currentSheetHeightRef.current = next;
        sheetHeightAnim.setValue(next);
      },
      onPanResponderRelease: (_, gestureState) => {
        if (!sheetDragMovedRef.current && Math.abs(gestureState.dy) < 5) {
          const now = Date.now();
          if (now - lastHeaderTapRef.current < 450) {
            Animated.timing(sheetHeightAnim, { toValue: sheetMaxHeight, duration: 250, useNativeDriver: false }).start();
            currentSheetHeightRef.current = sheetMaxHeight;
          }
          lastHeaderTapRef.current = now;
        }
      },
    })
  ).current;

  const isAdmin = activeRole?.code === 'admin';

  const fetchPage = useCallback(
    async (pageNum: number, append: boolean) => {
      if (!isAdmin) return;
      if (pageNum === 0) setLoading(true);
      try {
        let q = supabase
          .from('profiles')
          .select('id, name, email, phone, avatar_url, account_status, created_at', { count: 'exact' })
          .order('created_at', { ascending: false })
          .range(pageNum * PAGE_SIZE, (pageNum + 1) * PAGE_SIZE - 1);

        if (searchQuery.trim()) {
          const escaped = escapeIlike(searchQuery.trim());
          const term = `%${escaped}%`;
          q = q.or(`name.ilike.${term},email.ilike.${term},phone.ilike.${term}`);
        }

        const { data: profiles, error } = await q;

        if (error) {
          if (pageNum === 0) setList([]);
          setHasMore(false);
          return;
        }

        const profilesList = (profiles ?? []) as Profile[];
        if (profilesList.length < PAGE_SIZE) setHasMore(false);
        else setHasMore(true);

        const ids = profilesList.map((p) => p.id);
        if (ids.length === 0) {
          if (append) return;
          setList([]);
          return;
        }

        const [countsRes, urRes] = await Promise.all([
          supabase.rpc('get_report_counts', { user_ids: ids }),
          supabase.from('user_roles').select('id, user_id, role_id').in('user_id', ids),
        ]);

        const countMap: Record<string, number> = {};
        ((countsRes.data as { user_id: string; report_count: number }[] | null) ?? []).forEach(
          (r) => {
            countMap[r.user_id] = Number(r.report_count) || 0;
          }
        );

        const urData = (urRes.data ?? []) as { id: string; user_id: string; role_id: string }[];
        const roleIds = new Set(urData.map((r) => r.role_id));
        const roleList = roleIds.size
          ? ((await supabase.from('roles').select('id, code, label').in('id', [...roleIds])).data as Role[] ?? [])
          : [];
        const roleEntriesByUserId: Record<string, RoleEntry[]> = {};
        urData.forEach((ur) => {
          const role = roleList.find((r) => r.id === ur.role_id);
          if (!role) return;
          if (!roleEntriesByUserId[ur.user_id]) roleEntriesByUserId[ur.user_id] = [];
          roleEntriesByUserId[ur.user_id].push({ id: ur.id, roleId: ur.role_id, label: role.label });
        });

        const rows: UserRow[] = profilesList.map((p) => ({
          profile: p,
          reportCount: countMap[p.id] ?? 0,
          roleEntries: roleEntriesByUserId[p.id] ?? [],
        }));

        if (append) setList((prev) => [...prev, ...rows]);
        else setList(rows);
      } finally {
        setLoading(false);
      }
    },
    [isAdmin, searchQuery]
  );

  useEffect(() => {
    if (!isAdmin) return;
    setPage(0);
    setList([]);
    setHasMore(true);
    fetchPage(0, false);
  }, [isAdmin, searchQuery]);

  useEffect(() => {
    if (userSheetUserId) {
      const h = Dimensions.get('window').height;
      const initial = Math.min(h - 100, Math.max(Math.max(280, h * 0.35), h * 0.5));
      sheetHeightAnim.setValue(initial);
      currentSheetHeightRef.current = initial;
    }
  }, [userSheetUserId, sheetHeightAnim]);

  const openUserSheet = useCallback((userId: string) => {
    setUserSheetUserId(userId);
    setUserSheetProfile(null);
    setUserSheetProducts([]);
    setUserSheetRequests([]);
    setUserSheetLocationName(null);
  }, []);

  useEffect(() => {
    if (!userSheetUserId) return;
    let cancelled = false;
    setUserSheetLoading(true);
    (async () => {
      try {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userSheetUserId)
          .single();
        if (cancelled) return;
        const profile = (profileData as Profile) ?? null;
        setUserSheetProfile(profile);
        if (profile?.location_id) {
          const { data: locData } = await supabase
            .from('locations')
            .select('name')
            .eq('id', profile.location_id)
            .single();
          if (!cancelled && locData) setUserSheetLocationName((locData as { name: string }).name);
        }
        const { data: itemsData } = await supabase
          .from('reuse_items')
          .select('*')
          .eq('seller_id', userSheetUserId)
          .not('approved_at', 'is', null)
          .is('rejected_at', null)
          .order('created_at', { ascending: false })
          .limit(20);
        if (cancelled) return;
        setUserSheetProducts((itemsData as ReuseItem[]) ?? []);

        const { data: ordersAsBuyerData } = await supabase
          .from('reuse_orders')
          .select('*')
          .eq('buyer_id', userSheetUserId)
          .order('created_at', { ascending: false })
          .limit(20);
        const ordersAsBuyer = (ordersAsBuyerData ?? []) as ReuseOrder[];
        if (cancelled || ordersAsBuyer.length === 0) {
          if (!cancelled) setUserSheetRequests([]);
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
          if (!cancelled) setUserSheetRequests(requestsWithItems);
        }
      } catch (e) {
        if (!cancelled) {
          setUserSheetProfile(null);
          setUserSheetProducts([]);
          setUserSheetRequests([]);
        }
      } finally {
        if (!cancelled) setUserSheetLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userSheetUserId]);

  const loadMore = useCallback(() => {
    if (!hasMore || loading) return;
    const next = page + 1;
    setPage(next);
    fetchPage(next, true);
  }, [hasMore, loading, page, fetchPage]);

  const onSearchSubmit = useCallback(() => {
    setSearchQuery(searchInput.trim());
    setPage(0);
  }, [searchInput]);

  const assignRole = useCallback(
    async (userId: string, roleId: string) => {
      setAssigning(true);
      try {
        const { error } = await requestWithTimeout(
          supabase.from('user_roles').insert({ user_id: userId, role_id: roleId })
        );
        if (error) {
          if (error.code === '23505') return; // unique violation = already has role
          Alert.alert('Could not assign role', error.message || 'Please try again.');
          return;
        }
        setAssignModalUserId(null);
        setPage(0);
        fetchPage(0, false);
      } catch (e: unknown) {
        const msg = (e as { message?: string })?.message === 'REQUEST_TIMEOUT' ? TIMEOUT_MESSAGE : (e as Error)?.message || TIMEOUT_MESSAGE;
        Alert.alert('Could not assign role', msg);
      } finally {
        setAssigning(false);
      }
    },
    [fetchPage]
  );

  const removeRole = useCallback(
    async (userRoleId: string, userId: string) => {
      setRemovingRoleId(userRoleId);
      try {
        const { error } = await requestWithTimeout(
          supabase.from('user_roles').delete().eq('id', userRoleId)
        );
        if (error) {
          Alert.alert('Could not remove role', error.message || 'Please try again.');
          return;
        }
        setList((prev) =>
          prev.map((row) =>
            row.profile.id === userId
              ? { ...row, roleEntries: row.roleEntries.filter((e) => e.id !== userRoleId) }
              : row
          )
        );
      } catch (e: unknown) {
        const msg = (e as { message?: string })?.message === 'REQUEST_TIMEOUT' ? TIMEOUT_MESSAGE : (e as Error)?.message || TIMEOUT_MESSAGE;
        Alert.alert('Could not remove role', msg);
      } finally {
        setRemovingRoleId(null);
      }
    },
    []
  );

  const setAccountStatus = useCallback(
    async (userId: string, status: 'active' | 'blocked') => {
      setUpdatingStatus(userId);
      try {
        const { error } = await requestWithTimeout(
          supabase.from('profiles').update({ account_status: status, updated_at: new Date().toISOString() }).eq('id', userId)
        );
        if (error) {
          Alert.alert('Could not update status', error.message || 'Please try again.');
          return;
        }
        setList((prev) =>
          prev.map((r) =>
            r.profile.id === userId ? { ...r, profile: { ...r.profile, account_status: status } } : r
          )
        );
      } catch (e: unknown) {
        const msg = (e as { message?: string })?.message === 'REQUEST_TIMEOUT' ? TIMEOUT_MESSAGE : (e as Error)?.message || TIMEOUT_MESSAGE;
        Alert.alert('Could not update status', msg);
      } finally {
        setUpdatingStatus(null);
      }
    },
    []
  );

  const refresh = useCallback(() => {
    setPage(0);
    fetchPage(0, false);
  }, [fetchPage]);

  if (!isAdmin) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Text style={[styles.forbidden, { color: colors.text }]}>Only admins can access this screen.</Text>
        <Pressable style={[styles.backBtn, { marginTop: 16 }]} onPress={() => router.replace('/(tabs)/profile')}>
          <Text style={{ color: colors.tint, fontWeight: '600' }}>Back</Text>
        </Pressable>
      </View>
    );
  }

  const renderItem = ({ item }: { item: UserRow }) => {
    const { profile, reportCount, roleEntries } = item;
    const status = (profile.account_status ?? 'active') as 'active' | 'blocked';
    const isBlocked = status === 'blocked';
    const isUpdating = updatingStatus === profile.id;

    return (
      <View style={[styles.row, { borderColor: colors.tabIconDefault }]}>
        <Pressable style={styles.rowLeft} onPress={() => openUserSheet(profile.id)}>
          <View style={styles.rowLeftInner}>
          {profile.avatar_url ? (
            <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatarPlaceholder, { backgroundColor: colors.tabIconDefault }]}>
              <Text style={[styles.avatarText, { color: colors.background }]}>
                {(profile.name || profile.email || '?')[0].toUpperCase()}
              </Text>
            </View>
          )}
          <View style={styles.rowBody}>
            <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
              {profile.name || '—'}
            </Text>
            <Text style={[styles.meta, { color: colors.tabIconDefault }]} numberOfLines={1}>
              {profile.email || profile.phone || profile.id.slice(0, 8)}
            </Text>
            <View style={styles.badges}>
              <View style={[styles.badge, isBlocked ? styles.badgeBlocked : styles.badgeActive]}>
                <Text style={[styles.badgeText, isBlocked ? styles.badgeTextBlocked : styles.badgeTextActive]}>
                  {isBlocked ? 'Blocked' : 'Active'}
                </Text>
              </View>
              {reportCount >= 3 && (
                <View style={styles.badgeReports}>
                  <Text style={styles.badgeReportsText}>{reportCount} reports</Text>
                </View>
              )}
              {roleEntries.length > 0 && (
                <View style={styles.roleChipsRow}>
                  {roleEntries.map((re) => (
                    <View key={re.id} style={[styles.roleChip, { borderColor: colors.tabIconDefault }]}>
                      <Text style={[styles.roleChipText, { color: colors.text }]} numberOfLines={1}>
                        {re.label}
                      </Text>
                      <Pressable
                        hitSlop={8}
                        onPress={() => removeRole(re.id, profile.id)}
                        disabled={removingRoleId === re.id}
                        style={styles.roleChipRemove}
                      >
                        {removingRoleId === re.id ? (
                          <ActivityIndicator size="small" color={colors.tabIconDefault} />
                        ) : (
                          <MaterialCommunityIcons name="close" size={16} color={colors.tabIconDefault} />
                        )}
                      </Pressable>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </View>
          </View>
        </Pressable>
        <View style={styles.actions}>
          <Pressable
            style={[styles.actionBtn, { borderColor: colors.tint }]}
            onPress={() => setAssignModalUserId(profile.id)}
          >
            <Text style={[styles.actionBtnText, { color: colors.tint }]}>Role</Text>
          </Pressable>
          {isBlocked ? (
            <Pressable
              style={[styles.actionBtn, styles.actionBtnGreen]}
              onPress={() => setAccountStatus(profile.id, 'active')}
              disabled={!!isUpdating}
            >
              {isUpdating ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.actionBtnTextWhite}>Active</Text>
              )}
            </Pressable>
          ) : (
            <Pressable
              style={[styles.actionBtn, styles.actionBtnRed]}
              onPress={() => setAccountStatus(profile.id, 'blocked')}
              disabled={!!isUpdating}
            >
              {isUpdating ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.actionBtnTextWhite}>Block</Text>
              )}
            </Pressable>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.headerRow, { borderBottomColor: colors.tabIconDefault }]}>
        <Pressable onPress={() => router.replace('/(tabs)/profile')} style={styles.backButton}>
          <Text style={[styles.backText, { color: colors.tint }]}>← Back</Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Users</Text>
      </View>

      <View style={[styles.searchRow, { borderBottomColor: colors.tabIconDefault }]}>
        <TextInput
          style={[styles.searchInput, { color: colors.text, borderColor: colors.tabIconDefault }]}
          placeholder="Search by name, email, phone..."
          placeholderTextColor={colors.tabIconDefault}
          value={searchInput}
          onChangeText={setSearchInput}
          onSubmitEditing={onSearchSubmit}
          returnKeyType="search"
        />
        <Pressable style={[styles.searchBtn, { backgroundColor: colors.tint }]} onPress={onSearchSubmit}>
          <MaterialCommunityIcons name="magnify" size={22} color="#fff" />
        </Pressable>
      </View>

      {loading && list.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.tint} />
        </View>
      ) : (
        <FlatList
          data={list}
          keyExtractor={(item) => item.profile.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            loading && list.length > 0 ? (
              <View style={styles.footerLoader}>
                <ActivityIndicator size="small" color={colors.tint} />
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={{ color: colors.tabIconDefault }}>No users found.</Text>
            </View>
          }
        />
      )}

      <Modal visible={!!assignModalUserId} transparent animationType="fade">
        <Pressable style={styles.modalBackdrop} onPress={() => setAssignModalUserId(null)}>
          <Pressable style={[styles.modalBox, { backgroundColor: colors.background }]} onPress={(e) => e.stopPropagation()}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Assign role</Text>
            {roles.map((r) => (
              <Pressable
                key={r.id}
                style={[styles.modalOption, { borderColor: colors.tabIconDefault }]}
                onPress={() => assignModalUserId && assignRole(assignModalUserId, r.id)}
                disabled={assigning}
              >
                <Text style={[styles.modalOptionText, { color: colors.text }]}>{r.label}</Text>
              </Pressable>
            ))}
            <Pressable style={[styles.modalCancel, { borderColor: colors.tabIconDefault }]} onPress={() => setAssignModalUserId(null)}>
              <Text style={{ color: colors.text }}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={!!userSheetUserId}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setUserSheetUserId(null)}
      >
        <View style={styles.sheetOverlayContainer}>
          <Pressable
            style={styles.sheetBackdrop}
            onPress={() => setUserSheetUserId(null)}
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
                <Text style={[styles.sheetTitle, { color: colors.text }]}>User details</Text>
                <Pressable onPress={() => setUserSheetUserId(null)} hitSlop={12}>
                  <Text style={[styles.sheetClose, { color: colors.text }]}>✕</Text>
                </Pressable>
              </View>
            </View>
            {userSheetLoading ? (
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
                  {userSheetProfile && (
                    <View style={[styles.sheetProfileCard, { borderColor: colors.tabIconDefault }]}>
                      <View style={styles.sheetProfileRow}>
                        {userSheetProfile.avatar_url ? (
                          <Image source={{ uri: userSheetProfile.avatar_url }} style={styles.sheetAvatar} />
                        ) : (
                          <View style={[styles.sheetAvatar, styles.sheetAvatarPlaceholder, { backgroundColor: colors.tabIconDefault }]}>
                            <Text style={[styles.sheetAvatarText, { color: colors.background }]}>
                              {(userSheetProfile.name || '?').charAt(0).toUpperCase()}
                            </Text>
                          </View>
                        )}
                        <View style={styles.sheetProfileInfo}>
                          <Text style={[styles.sheetName, { color: colors.text }]}>{userSheetProfile.name || 'Anonymous'}</Text>
                          <Text style={[styles.sheetMeta, { color: colors.tabIconDefault }]}>
                            Member since {formatMemberSince(userSheetProfile.created_at)}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.sheetDetailRow}>
                        <Text style={[styles.sheetLabel, { color: colors.tabIconDefault }]}>Location</Text>
                        <Text style={[styles.sheetValue, { color: colors.text }]}>
                          {[userSheetLocationName, userSheetProfile.area].filter(Boolean).join(' · ') || '—'}
                        </Text>
                      </View>
                      {userSheetProfile.phone ? (
                        <View style={styles.sheetDetailRow}>
                          <Text style={[styles.sheetLabel, { color: colors.tabIconDefault }]}>Phone</Text>
                          <Text style={[styles.sheetValue, { color: colors.text }]}>{userSheetProfile.phone}</Text>
                        </View>
                      ) : null}
                      {userSheetProfile.about ? (
                        <View style={styles.sheetDetailRow}>
                          <Text style={[styles.sheetLabel, { color: colors.tabIconDefault }]}>About</Text>
                          <Text style={[styles.sheetValue, { color: colors.text }]}>{userSheetProfile.about}</Text>
                        </View>
                      ) : null}
                      {userSheetProfile.status_text ? (
                        <View style={styles.sheetDetailRow}>
                          <Text style={[styles.sheetLabel, { color: colors.tabIconDefault }]}>Status</Text>
                          <Text style={[styles.sheetValue, { color: colors.text }]}>{userSheetProfile.status_text}</Text>
                        </View>
                      ) : null}
                      <View style={styles.sheetDetailRow}>
                        <Text style={[styles.sheetLabel, { color: colors.tabIconDefault }]}>Account</Text>
                        <Text style={[styles.sheetValue, { color: colors.text }]}>
                          {userSheetProfile.account_status === 'blocked' ? 'Blocked' : 'Active'}
                        </Text>
                      </View>
                    </View>
                  )}
                  <View style={[styles.sheetSection, styles.sheetSectionWithSlides, { borderColor: colors.tabIconDefault }]}>
                    <Text style={[styles.sheetSectionTitle, { color: colors.text }]}>
                      Their listings ({userSheetProducts.length})
                    </Text>
                    {userSheetProducts.length === 0 ? (
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
                        {userSheetProducts.map((prod) => (
                          <Link key={prod.id} href={{ pathname: '/reuse-item/[id]', params: { id: prod.id } }} asChild>
                            <Pressable
                              style={[styles.sheetSlideCard, { borderColor: colors.tabIconDefault }]}
                              onPress={() => setUserSheetUserId(null)}
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
                      Products they requested ({userSheetRequests.length})
                    </Text>
                    {userSheetRequests.length === 0 ? (
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
                        {userSheetRequests.map(({ order, item }) => (
                          <Link key={order.id} href={{ pathname: '/reuse-item/[id]', params: { id: item.id } }} asChild>
                            <Pressable
                              style={[styles.sheetSlideCard, { borderColor: colors.tabIconDefault }]}
                              onPress={() => setUserSheetUserId(null)}
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
                  {userSheetProfile?.phone ? (
                    <>
                      <Pressable
                        style={[styles.sheetFooterBtn, { backgroundColor: colors.tint }]}
                        onPress={() => Linking.openURL(`tel:${userSheetProfile.phone!.replace(/\s/g, '')}`)}
                      >
                        <MaterialCommunityIcons name="phone" size={18} color="#fff" />
                        <Text style={styles.sheetFooterBtnText}>Call</Text>
                      </Pressable>
                      <Pressable
                        style={[styles.sheetFooterBtn, styles.whatsappBtn]}
                        onPress={() => {
                          const url = getWhatsAppUrl(userSheetProfile.phone, 'Hi, I\'m reaching out from the app.');
                          if (url) Linking.openURL(url);
                        }}
                      >
                        <MaterialCommunityIcons name="whatsapp" size={18} color="#fff" />
                        <Text style={styles.sheetFooterBtnText}>WhatsApp</Text>
                      </Pressable>
                    </>
                  ) : null}
                  <Pressable
                    style={[styles.sheetFooterBtn, { borderWidth: 1, borderColor: colors.tabIconDefault }]}
                    onPress={() => setUserSheetUserId(null)}
                  >
                    <Text style={[styles.sheetFooterBtnText, { color: colors.text }]}>Close</Text>
                  </Pressable>
                </View>
              </>
            )}
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  forbidden: { fontSize: 16 },
  backBtn: { padding: 12 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backButton: { marginRight: 12 },
  backText: { fontSize: 16 },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  searchBtn: { padding: 10, borderRadius: 8 },
  listContent: { padding: 12, paddingBottom: 24 },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
  },
  rowLeft: { flexDirection: 'row', flex: 1, minWidth: 0, marginRight: 8 },
  rowLeftInner: { flexDirection: 'row', flex: 1, minWidth: 0 },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  avatarPlaceholder: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 18, fontWeight: '700' },
  rowBody: { flex: 1, minWidth: 0 },
  name: { fontSize: 16, fontWeight: '600' },
  meta: { fontSize: 13, marginTop: 2 },
  badges: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginTop: 6, gap: 6 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  badgeActive: { backgroundColor: '#22c55e20' },
  badgeBlocked: { backgroundColor: '#ef444420' },
  badgeText: { fontSize: 12, fontWeight: '600' },
  badgeTextActive: { color: '#16a34a' },
  badgeTextBlocked: { color: '#dc2626' },
  badgeReports: { backgroundColor: '#b91c1c', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  badgeReportsText: { fontSize: 12, fontWeight: '600', color: '#fff' },
  roleChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  roleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingLeft: 8,
    paddingVertical: 4,
    paddingRight: 2,
    maxWidth: 160,
  },
  roleChipText: { fontSize: 12, marginRight: 4, flexShrink: 1 },
  roleChipRemove: { padding: 4 },
  actions: { flexDirection: 'row', gap: 6, flexShrink: 0 },
  actionBtn: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minWidth: 52,
    alignItems: 'center',
  },
  actionBtnText: { fontSize: 13, fontWeight: '600' },
  actionBtnGreen: { backgroundColor: '#22c55e', borderColor: '#22c55e' },
  actionBtnRed: { backgroundColor: '#dc2626', borderColor: '#dc2626' },
  actionBtnTextWhite: { fontSize: 13, fontWeight: '600', color: '#fff' },
  footerLoader: { padding: 16, alignItems: 'center' },
  empty: { padding: 24, alignItems: 'center' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalBox: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 12,
    padding: 20,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 16 },
  modalOption: { borderWidth: 1, borderRadius: 8, padding: 14, marginBottom: 8 },
  modalOptionText: { fontSize: 16 },
  modalCancel: { borderWidth: 1, borderRadius: 8, padding: 14, marginTop: 8, alignItems: 'center' },
  sheetOverlayContainer: { flex: 1, justifyContent: 'flex-end' },
  sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheetBox: { borderTopLeftRadius: 16, borderTopRightRadius: 16, overflow: 'hidden', flexDirection: 'column' },
  sheetHeaderDragArea: {},
  sheetHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 8, marginBottom: 8 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1 },
  sheetTitle: { fontSize: 18, fontWeight: '700' },
  sheetClose: { fontSize: 20, fontWeight: '600' },
  sheetLoading: { padding: 40, alignItems: 'center' },
  sheetScroll: { flex: 1, minHeight: 200, paddingHorizontal: 20, paddingTop: 12 },
  sheetScrollContent: { paddingBottom: 28, flexGrow: 1 },
  sheetProfileCard: { borderWidth: 1, borderRadius: 12, padding: 16, marginBottom: 16 },
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
  sheetSlidesContent: { paddingVertical: 10, paddingHorizontal: 4, paddingRight: 20 },
  sheetSlideCard: { width: 140, marginRight: 12, borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
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
  sheetFooterBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 12, paddingHorizontal: 18, borderRadius: 10 },
  sheetFooterBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  whatsappBtn: { backgroundColor: '#25D366' },
});
