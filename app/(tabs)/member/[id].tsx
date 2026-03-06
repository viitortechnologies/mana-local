import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { supabase } from '@/src/lib/supabase';
import { requestWithTimeout, TIMEOUT_MESSAGE } from '@/src/lib/requestWithTimeout';
import { useAuth } from '@/src/contexts/AuthContext';
import type { Profile, Post, Comment, ReuseItem } from '@/src/lib/types';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';

export default function MemberScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useRouter();
  const { user } = useAuth();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const [profile, setProfile] = useState<Profile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [items, setItems] = useState<ReuseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasBlocked, setHasBlocked] = useState(false);
  const [hasReported, setHasReported] = useState(false);
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [blockSubmitting, setBlockSubmitting] = useState(false);

  const isOwnProfile = user?.id === id;

  const fetchData = useCallback(async () => {
    if (!id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [
        { data: profileData },
        { data: postsData },
        { data: commentsData },
        { data: itemsData },
        blockedRes,
        reportedRes,
      ] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', id).single(),
        supabase
          .from('posts')
          .select('*')
          .eq('author_id', id)
          .not('approved_at', 'is', null)
          .order('created_at', { ascending: false })
          .limit(10),
        supabase
          .from('comments')
          .select('*')
          .eq('author_id', id)
          .not('approved_at', 'is', null)
          .order('created_at', { ascending: false })
          .limit(10),
        supabase
          .from('reuse_items')
          .select('*')
          .eq('seller_id', id)
          .not('approved_at', 'is', null)
          .is('rejected_at', null)
          .order('created_at', { ascending: false })
          .limit(10),
        user?.id
          ? supabase.from('user_blocks').select('id').eq('blocker_id', user.id).eq('blocked_id', id).maybeSingle()
          : Promise.resolve({ data: null }),
        user?.id
          ? supabase.from('user_reports').select('id').eq('reporter_id', user.id).eq('reported_id', id).limit(1)
          : Promise.resolve({ data: null }),
      ]);

      setProfile((profileData as Profile) ?? null);
      setPosts((postsData as Post[]) ?? []);
      setComments((commentsData as Comment[]) ?? []);
      setItems((itemsData as ReuseItem[]) ?? []);
      setHasBlocked(!!blockedRes.data);
      setHasReported(Array.isArray(reportedRes.data) ? reportedRes.data.length > 0 : !!reportedRes.data);
    } finally {
      setLoading(false);
    }
  }, [id, user?.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const totalViews = useMemo(() => posts.reduce((s, p) => s + (p.view_count ?? 0), 0), [posts]);
  const totalLikes = useMemo(() => posts.reduce((s, p) => s + (p.like_count ?? 0), 0), [posts]);
  const totalItemViews = useMemo(() => items.reduce((s, i) => s + (i.view_count ?? 0), 0), [items]);

  const handleBlock = async () => {
    if (!user?.id || !id || hasBlocked) return;
    setBlockSubmitting(true);
    try {
      const { error } = await requestWithTimeout(
        supabase.from('user_blocks').insert({ blocker_id: user.id, blocked_id: id })
      );
      if (error) {
        Alert.alert('Could not block', error.message || 'Please try again.');
        return;
      }
      setHasBlocked(true);
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message === 'REQUEST_TIMEOUT' ? TIMEOUT_MESSAGE : (e as Error)?.message || TIMEOUT_MESSAGE;
      Alert.alert('Could not block', msg);
    } finally {
      setBlockSubmitting(false);
    }
  };

  const handleUnblock = async () => {
    if (!user?.id || !id || !hasBlocked) return;
    setBlockSubmitting(true);
    try {
      const { error } = await requestWithTimeout(
        supabase.from('user_blocks').delete().eq('blocker_id', user.id).eq('blocked_id', id)
      );
      if (error) {
        Alert.alert('Could not unblock', error.message || 'Please try again.');
        return;
      }
      setHasBlocked(false);
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message === 'REQUEST_TIMEOUT' ? TIMEOUT_MESSAGE : (e as Error)?.message || TIMEOUT_MESSAGE;
      Alert.alert('Could not unblock', msg);
    } finally {
      setBlockSubmitting(false);
    }
  };

  const handleReportSubmit = async () => {
    if (!user?.id || !id) return;
    setReportSubmitting(true);
    try {
      const { error } = await requestWithTimeout(
        supabase.from('user_reports').insert({
          reporter_id: user.id,
          reported_id: id,
          reason: reportReason.trim() || null,
        })
      );
      if (error) {
        Alert.alert('Could not submit report', error.message || 'Please try again.');
        return;
      }
      setHasReported(true);
      setReportModalVisible(false);
      setReportReason('');
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message === 'REQUEST_TIMEOUT' ? TIMEOUT_MESSAGE : (e as Error)?.message || TIMEOUT_MESSAGE;
      Alert.alert('Could not submit report', msg);
    } finally {
      setReportSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.tint} />
      </View>
    );
  }

  if (!id || !profile) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.text }}>Member not found.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.content}>
      <Pressable onPress={() => router.back()}>
        <Text style={[styles.backText, { color: colors.tint }]}>‹ Back</Text>
      </Pressable>

      <View style={[styles.profileCard, { borderColor: colors.tabIconDefault, backgroundColor: colors.cardBg ?? colors.background }]}>
        <View style={styles.profileRow}>
          {profile.avatar_url ? (
            <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatarPlaceholder, { backgroundColor: colors.tint }]}>
              <Text style={styles.avatarInitial}>
                {(profile.name || '?').trim().charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <View style={styles.profileInfo}>
            <Text style={[styles.name, { color: colors.text }]}>{profile.name || 'Anonymous'}</Text>
            <Text style={[styles.meta, { color: colors.tabIconDefault }]}>
              Joined {new Date(profile.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
            </Text>
          </View>
        </View>
      </View>

      <View style={[styles.analyticsCard, { borderColor: colors.tabIconDefault, backgroundColor: colors.cardBg ?? colors.background }]}>
        <Text style={[styles.analyticsTitle, { color: colors.text }]}>Activity & reach</Text>
        <View style={styles.analyticsGrid}>
          <View style={[styles.analyticsItem, { backgroundColor: colors.background }]}>
            <MaterialCommunityIcons name="eye-outline" size={22} color={colors.tint} />
            <Text style={[styles.analyticsValue, { color: colors.text }]}>{totalViews + totalItemViews}</Text>
            <Text style={[styles.analyticsLabel, { color: colors.tabIconDefault }]}>Total views</Text>
          </View>
          <View style={[styles.analyticsItem, { backgroundColor: colors.background }]}>
            <MaterialCommunityIcons name="heart-outline" size={22} color={colors.tint} />
            <Text style={[styles.analyticsValue, { color: colors.text }]}>{totalLikes}</Text>
            <Text style={[styles.analyticsLabel, { color: colors.tabIconDefault }]}>Post likes</Text>
          </View>
          <View style={[styles.analyticsItem, { backgroundColor: colors.background }]}>
            <MaterialCommunityIcons name="post-outline" size={22} color={colors.tint} />
            <Text style={[styles.analyticsValue, { color: colors.text }]}>{posts.length}</Text>
            <Text style={[styles.analyticsLabel, { color: colors.tabIconDefault }]}>Posts</Text>
          </View>
          <View style={[styles.analyticsItem, { backgroundColor: colors.background }]}>
            <MaterialCommunityIcons name="package-variant" size={22} color={colors.tint} />
            <Text style={[styles.analyticsValue, { color: colors.text }]}>{items.length}</Text>
            <Text style={[styles.analyticsLabel, { color: colors.tabIconDefault }]}>Products</Text>
          </View>
        </View>
      </View>

      {!isOwnProfile && user?.id && (
        <View style={[styles.actionRow, { borderColor: colors.tabIconDefault }]}>
          {hasBlocked ? (
            <Pressable
              style={[styles.actionBtn, { borderColor: colors.tabIconDefault }]}
              onPress={handleUnblock}
              disabled={blockSubmitting}
            >
              {blockSubmitting ? (
                <ActivityIndicator size="small" color={colors.tint} />
              ) : (
                <Text style={[styles.actionBtnText, { color: colors.text }]}>Unblock</Text>
              )}
            </Pressable>
          ) : (
            <Pressable
              style={[styles.actionBtn, styles.actionBtnBlock, { borderColor: '#dc2626' }]}
              onPress={handleBlock}
              disabled={blockSubmitting}
            >
              {blockSubmitting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={[styles.actionBtnText, { color: '#dc2626' }]}>Block</Text>
              )}
            </Pressable>
          )}
          {hasReported ? (
            <View style={[styles.actionBtn, styles.actionBtnDisabled, { borderColor: colors.tabIconDefault }]}>
              <Text style={[styles.actionBtnText, { color: colors.tabIconDefault }]}>Reported</Text>
            </View>
          ) : (
            <Pressable
              style={[styles.actionBtn, { borderColor: colors.tint }]}
              onPress={() => setReportModalVisible(true)}
            >
              <Text style={[styles.actionBtnText, { color: colors.tint }]}>Report</Text>
            </Pressable>
          )}
        </View>
      )}

      <View style={[styles.section, { borderColor: colors.tabIconDefault }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Approved posts</Text>
        <Text style={[styles.subTitle, { color: colors.tabIconDefault }]}>Tap to open post and see views · likes</Text>
        {posts.length === 0 ? (
          <Text style={[styles.empty, { color: colors.tabIconDefault }]}>No posts yet.</Text>
        ) : (
          posts.map((p) => (
            <Link key={p.id} href={{ pathname: '/post/[id]', params: { id: p.id } }} asChild>
              <Pressable style={[styles.itemCard, { borderColor: colors.border ?? colors.tabIconDefault }]}>
                <Text style={[styles.itemTitle, { color: colors.text }]} numberOfLines={2}>
                  {p.title || '(no title)'}
                </Text>
                <Text style={[styles.itemMeta, { color: colors.tabIconDefault }]}>
                  {p.view_count ?? 0} views · {p.like_count ?? 0} likes
                </Text>
              </Pressable>
            </Link>
          ))
        )}
        <Text style={[styles.subTitle, { color: colors.tabIconDefault, marginTop: 16 }]}>Recent comments</Text>
        {comments.length === 0 ? (
          <Text style={[styles.empty, { color: colors.tabIconDefault }]}>No comments yet.</Text>
        ) : (
          comments.map((c) => (
            <View key={c.id} style={[styles.commentChip, { borderLeftColor: colors.tint + '66' }]}>
              <Text style={[styles.itemText, { color: colors.text }]} numberOfLines={2}>
                {c.body}
              </Text>
            </View>
          ))
        )}
      </View>

      <View style={[styles.section, { borderColor: colors.tabIconDefault }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Approved products</Text>
        <Text style={[styles.subTitle, { color: colors.tabIconDefault }]}>Tap to open product</Text>
        {items.length === 0 ? (
          <Text style={[styles.empty, { color: colors.tabIconDefault }]}>No products yet.</Text>
        ) : (
          items.map((r) => (
            <Link key={r.id} href={{ pathname: '/reuse-item/[id]', params: { id: r.id } }} asChild>
              <Pressable style={[styles.itemCard, { borderColor: colors.border ?? colors.tabIconDefault }]}>
                <Text style={[styles.itemTitle, { color: colors.text }]} numberOfLines={2}>
                  {r.title}
                </Text>
                <Text style={[styles.itemMeta, { color: colors.tabIconDefault }]}>
                  ₹{r.selling_price?.toFixed(0) ?? '—'} · {(r.view_count ?? 0)} views
                </Text>
              </Pressable>
            </Link>
          ))
        )}
      </View>

      <Modal visible={reportModalVisible} transparent animationType="fade">
        <Pressable style={styles.modalBackdrop} onPress={() => !reportSubmitting && setReportModalVisible(false)}>
          <Pressable style={[styles.modalBox, { backgroundColor: colors.background, borderColor: colors.tabIconDefault }]} onPress={(e) => e.stopPropagation()}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Report user</Text>
            <Text style={[styles.modalHint, { color: colors.tabIconDefault }]}>Reason (optional). Report will be visible to admins.</Text>
            <TextInput
              style={[styles.reportInput, { color: colors.text, borderColor: colors.tabIconDefault }]}
              placeholder="Reason..."
              placeholderTextColor={colors.tabIconDefault}
              value={reportReason}
              onChangeText={setReportReason}
              multiline
              numberOfLines={3}
            />
            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalBtn, { borderColor: colors.tabIconDefault }]}
                onPress={() => setReportModalVisible(false)}
                disabled={reportSubmitting}
              >
                <Text style={{ color: colors.text }}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, styles.modalBtnPrimary, { backgroundColor: colors.tint }]}
                onPress={handleReportSubmit}
                disabled={reportSubmitting}
              >
                {reportSubmitting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalBtnPrimaryText}>Submit report</Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  backText: { marginBottom: 12, fontSize: 14, fontWeight: '600' },
  profileCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  profileRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 56, height: 56, borderRadius: 28, marginRight: 14 },
  avatarPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 28,
    marginRight: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { fontSize: 22, fontWeight: '700', color: '#fff' },
  profileInfo: { flex: 1, minWidth: 0 },
  name: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  meta: { fontSize: 13 },
  analyticsCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  analyticsTitle: { fontSize: 14, fontWeight: '700', marginBottom: 12 },
  analyticsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  analyticsItem: {
    minWidth: '47%',
    flex: 1,
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
  },
  analyticsValue: { fontSize: 18, fontWeight: '800', marginTop: 4 },
  analyticsLabel: { fontSize: 11, marginTop: 2 },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  actionBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  actionBtnBlock: { backgroundColor: '#fef2f2' },
  actionBtnDisabled: { opacity: 0.7 },
  actionBtnText: { fontSize: 15, fontWeight: '600' },
  section: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
  },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginBottom: 4 },
  subTitle: { fontSize: 12, marginBottom: 10 },
  empty: { fontSize: 13 },
  itemCard: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  itemTitle: { fontSize: 15, fontWeight: '600', marginBottom: 4 },
  itemMeta: { fontSize: 12 },
  itemText: { fontSize: 14 },
  commentChip: {
    borderLeftWidth: 3,
    paddingLeft: 10,
    paddingVertical: 8,
    marginBottom: 8,
    borderLeftColor: 'transparent',
  },
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
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  modalHint: { fontSize: 13, marginBottom: 12 },
  reportInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 16 },
  modalBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  modalBtnPrimary: { borderColor: 'transparent' },
  modalBtnPrimaryText: { fontSize: 15, fontWeight: '600', color: '#fff' },
});

