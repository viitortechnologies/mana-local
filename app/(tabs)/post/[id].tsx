import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { supabase } from '@/src/lib/supabase';
import { useAuth } from '@/src/contexts/AuthContext';
import type { Comment, Post } from '@/src/lib/types';
import { POST_CATEGORIES } from '@/src/lib/types';
import { isVideoUrl } from '@/constants/MediaLimits';
import { MediaWithWatermark } from '@/components/MediaWithWatermark';
import { PhotoPreviewModal } from '@/components/PhotoPreviewModal';
import { VideoPreviewModal } from '@/components/VideoPreviewModal';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';

const COMMUNITY_GUIDELINES_NOTE =
  'Please be respectful and follow community guidelines. Keep comments constructive and kind.';

function daysSince(createdAt: string | null | undefined): number {
  if (!createdAt) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / (24 * 60 * 60 * 1000)));
}

/** Comment with replies attached (from buildCommentTree). */
type CommentWithReplies = Comment & { replies?: CommentWithReplies[] };

/** Build nested comment tree: top-level have parent_id null, replies under parent_id. */
function buildCommentTree(flat: Comment[]): CommentWithReplies[] {
  const byParent = new Map<string | null, CommentWithReplies[]>();
  for (const c of flat) {
    const key = c.parent_id ?? null;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push({ ...c, replies: [] });
  }
  const roots = (byParent.get(null) ?? []).sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  function attachReplies(parentId: string): CommentWithReplies[] {
    const children = (byParent.get(parentId) ?? []).sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    return children.map((c) => ({ ...c, replies: attachReplies(c.id) }));
  }
  return roots.map((r) => ({ ...r, replies: attachReplies(r.id) }));
}

function CommentItem({
  comment,
  commentLikedIds,
  colors,
  onReply,
  onLike,
  canInteract,
  depth,
}: {
  comment: CommentWithReplies;
  commentLikedIds: Set<string>;
  colors: Record<string, string>;
  onReply: (commentId: string) => void;
  onLike: (commentId: string) => void;
  canInteract: boolean;
  depth: number;
}) {
  const authorName = comment.profiles?.name?.trim() || 'Anonymous';
  const liked = commentLikedIds.has(comment.id);
  const likeCount = comment.like_count ?? 0;
  const replies = comment.replies ?? [];
  const isPending = !comment.approved_at;

  return (
    <View style={[styles.commentBlock, depth > 0 && styles.commentReplyBlock, { marginLeft: depth * 16 }]}>
      <View style={[styles.comment, { borderColor: colors.tint + '44' }]}>
        <View style={styles.commentAuthorRow}>
          <Text style={[styles.commentAuthor, { color: colors.tabIconDefault }]}>{authorName}</Text>
          {isPending && (
            <View style={[styles.pendingBadge, { backgroundColor: colors.tabIconDefault + '33' }]}>
              <Text style={[styles.pendingBadgeText, { color: colors.tabIconDefault }]}>Pending</Text>
            </View>
          )}
        </View>
        <Text style={[styles.commentBody, { color: colors.text }]}>{comment.body}</Text>
        <View style={styles.commentActions}>
          <Pressable
            style={styles.commentActionBtn}
            onPress={() => onLike(comment.id)}
            disabled={!canInteract}
          >
            <MaterialCommunityIcons
              name={liked ? 'heart' : 'heart-outline'}
              size={18}
              color={liked ? colors.tint : colors.tabIconDefault}
            />
            <Text style={[styles.commentActionText, { color: colors.tabIconDefault }]}>
              {likeCount > 0 ? likeCount : 'Like'}
            </Text>
          </Pressable>
          {canInteract && (
            <Pressable style={styles.commentActionBtn} onPress={() => onReply(comment.id)}>
              <MaterialCommunityIcons name="reply-outline" size={18} color={colors.tabIconDefault} />
              <Text style={[styles.commentActionText, { color: colors.tabIconDefault }]}>Reply</Text>
            </Pressable>
          )}
        </View>
      </View>
      {replies.length > 0 && (
        <View style={styles.repliesContainer}>
          {replies.map((r) => (
            <CommentItem
              key={r.id}
              comment={r}
              commentLikedIds={commentLikedIds}
              colors={colors}
              onReply={onReply}
              onLike={onLike}
              canInteract={canInteract}
              depth={depth + 1}
            />
          ))}
        </View>
      )}
    </View>
  );
}

export default function PostDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user, canPost } = useAuth();
  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [postLikedByMe, setPostLikedByMe] = useState(false);
  const [commentLikedIds, setCommentLikedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [mediaPreviewIndex, setMediaPreviewIndex] = useState<number | null>(null);
  const [newCommentBody, setNewCommentBody] = useState('');
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [submittingComment, setSubmittingComment] = useState(false);
  const [likingPost, setLikingPost] = useState(false);
  const [commentsSheetVisible, setCommentsSheetVisible] = useState(false);
  const [sheetClosing, setSheetClosing] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const sheetAnim = useRef(new Animated.Value(0)).current;
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const userId = user?.id ?? null;

  const fetchPost = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase.from('posts').select('*').eq('id', id).single();
    if (data) {
      const postRow = data as Post;
      const authorId = postRow.author_id;
      const { data: authorProfile } = await supabase
        .from('profiles')
        .select('id, name, avatar_url, created_at')
        .eq('id', authorId)
        .single();
      if (authorProfile) {
        const ap = authorProfile as { name: string | null; avatar_url: string | null; created_at: string };
        (postRow as Post).profiles = {
          name: ap.name,
          avatar_url: ap.avatar_url,
          created_at: ap.created_at,
        };
      }
      setPost(postRow);
      await supabase.rpc('increment_post_view', { post_id: id });
    }
    setLoading(false);
  }, [id]);

  const fetchPostLikeStatus = useCallback(async () => {
    if (!id || !userId) return;
    const { data } = await supabase
      .from('post_likes')
      .select('post_id')
      .eq('post_id', id)
      .eq('user_id', userId)
      .maybeSingle();
    setPostLikedByMe(!!data);
  }, [id, userId]);

  const fetchComments = useCallback(async () => {
    if (!id) return;
    const { data: commentsData } = await supabase
      .from('comments')
      .select('*')
      .eq('post_id', id)
      .order('created_at', { ascending: true });
    const list = (commentsData ?? []) as Comment[];
    const authorIds = [...new Set(list.map((c) => c.author_id))];
    if (authorIds.length > 0) {
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, name, avatar_url')
        .in('id', authorIds);
      const profileMap = new Map(
        (profilesData ?? []).map((p: { id: string; name: string | null; avatar_url: string | null }) => [p.id, p])
      );
      list.forEach((c) => {
        const p = profileMap.get(c.author_id);
        (c as Comment).profiles = p ? { name: p.name, avatar_url: p.avatar_url } : null;
      });
    }
    if (userId && list.length > 0) {
      const { data: likesData } = await supabase
        .from('comment_likes')
        .select('comment_id')
        .eq('user_id', userId)
        .in('comment_id', list.map((c) => c.id));
      const likedSet = new Set((likesData ?? []).map((r: { comment_id: string }) => r.comment_id));
      setCommentLikedIds(likedSet);
    } else {
      setCommentLikedIds(new Set());
    }
    setComments(list);
  }, [id, userId]);

  useEffect(() => {
    fetchPost();
  }, [fetchPost]);

  useEffect(() => {
    if (post) {
      fetchPostLikeStatus();
      fetchComments();
    }
  }, [post, fetchPostLikeStatus, fetchComments]);

  useEffect(() => {
    if (commentsSheetVisible && !sheetClosing) {
      sheetAnim.setValue(0);
      Animated.spring(sheetAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 65,
        friction: 11,
      }).start();
    }
  }, [commentsSheetVisible, sheetClosing, sheetAnim]);

  const closeCommentsSheet = useCallback(() => {
    setSheetClosing(true);
    Animated.timing(sheetAnim, {
      toValue: 0,
      duration: 220,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setCommentsSheetVisible(false);
        setSheetClosing(false);
      }
    });
  }, [sheetAnim]);

  const commentTree = useMemo(() => buildCommentTree(comments), [comments]);
  const commentTreeFlat = useMemo(() => {
    const flat: { comment: CommentWithReplies; depth: number }[] = [];
    function walk(c: CommentWithReplies, depth: number) {
      flat.push({ comment: c, depth });
      (c.replies ?? []).forEach((r) => walk(r, depth + 1));
    }
    commentTree.forEach((c) => walk(c, 0));
    return flat;
  }, [commentTree]);

  const SHEET_HEIGHT = Dimensions.get('window').height * 0.72;
  const sheetTranslateY = sheetAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [SHEET_HEIGHT, 0],
  });

  const handleLikePost = useCallback(async () => {
    if (!id || !userId || likingPost) return;
    if (!canPost) {
      Alert.alert('Complete profile', 'Complete your profile to like posts.');
      return;
    }
    setLikingPost(true);
    try {
      if (postLikedByMe) {
        await supabase.from('post_likes').delete().eq('post_id', id).eq('user_id', userId);
        setPostLikedByMe(false);
        setPost((p) => (p ? { ...p, like_count: Math.max(0, (p.like_count ?? 0) - 1) } : null));
      } else {
        await supabase.from('post_likes').insert({ post_id: id, user_id: userId });
        setPostLikedByMe(true);
        setPost((p) => (p ? { ...p, like_count: (p.like_count ?? 0) + 1 } : null));
      }
    } finally {
      setLikingPost(false);
    }
  }, [id, userId, canPost, postLikedByMe, likingPost]);

  const buildShareMessage = useCallback((p: Post) => {
    const authorName = (p.profiles?.name?.trim() || 'Anonymous').trim();
    const postDate = p.created_at
      ? new Date(p.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
      : '';
    const titleLine = (p.title?.trim() || 'Post').toUpperCase();
    const bodyText = (p.body?.trim() || '').trim();
    const parts: string[] = [`★ ${titleLine} ★`];
    if (bodyText) parts.push('', bodyText);
    parts.push(
      '',
      '—',
      `Posted by: ${authorName}`,
      postDate ? `Date: ${postDate}` : '',
      '',
      'Shared from Mana Local app.',
      'Good content grows when we share — help your community reach more people.',
      '#ManaLocal'
    );
    return parts.filter(Boolean).join('\n');
  }, []);

  const handleShare = useCallback(async () => {
    if (!post) return;
    try {
      const message = buildShareMessage(post);
      await Share.share({
        message,
        title: post.title ?? 'Post from Mana Local',
      });
      await supabase.rpc('increment_post_share', { post_id: id });
      setPost((p) => (p ? { ...p, share_count: (p.share_count ?? 0) + 1 } : null));
    } catch (_) {}
  }, [post, id, buildShareMessage]);

  const handleSubmitComment = useCallback(async () => {
    const body = newCommentBody.trim();
    if (!id || !userId || !body || submittingComment) return;
    if (!canPost) {
      Alert.alert('Complete profile', 'Complete your profile to add comments.');
      return;
    }
    setSubmittingComment(true);
    try {
      const { error } = await supabase.from('comments').insert({
        post_id: id,
        author_id: userId,
        body,
        parent_id: replyingToId || null,
      });
      if (error) throw error;
      setNewCommentBody('');
      setReplyingToId(null);
      await fetchComments();
    } catch (e) {
      Alert.alert('Error', 'Could not add comment. Please try again.');
    } finally {
      setSubmittingComment(false);
    }
  }, [id, userId, newCommentBody, replyingToId, submittingComment, canPost, fetchComments]);

  const handleLikeComment = useCallback(
    async (commentId: string) => {
      if (!userId || !canPost) return;
      const liked = commentLikedIds.has(commentId);
      try {
        if (liked) {
          await supabase.from('comment_likes').delete().eq('comment_id', commentId).eq('user_id', userId);
          setCommentLikedIds((s) => {
            const next = new Set(s);
            next.delete(commentId);
            return next;
          });
          setComments((prev) =>
            prev.map((c) =>
              c.id === commentId
                ? { ...c, like_count: Math.max(0, (c.like_count ?? 0) - 1) }
                : c
            )
          );
        } else {
          await supabase.from('comment_likes').insert({ comment_id: commentId, user_id: userId });
          setCommentLikedIds((s) => new Set(s).add(commentId));
          setComments((prev) =>
            prev.map((c) => (c.id === commentId ? { ...c, like_count: (c.like_count ?? 0) + 1 } : c))
          );
        }
      } catch (_) {}
    },
    [userId, canPost, commentLikedIds]
  );

  const categoryLabel = post ? POST_CATEGORIES.find((c) => c.value === post.category)?.label ?? post.category : '';
  const authorLabel = post?.profiles?.name?.trim() ? post.profiles.name.trim() : 'Anonymous';
  const authorAvatar = post?.profiles?.avatar_url ?? null;
  const authorDays = post?.profiles?.created_at ? daysSince(post.profiles.created_at) : 0;
  const mediaUrls = post?.media_urls ?? [];

  if (loading || !post) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.tint} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.page, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      <View style={[styles.headerRow, { backgroundColor: colors.background, borderBottomColor: colors.border ?? colors.tabIconDefault }]}>
        <Pressable onPress={() => router.back()}>
          <Text style={[styles.backText, { color: colors.tint }]}>← Back</Text>
        </Pressable>
      </View>
      <ScrollView
        ref={scrollRef}
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {/* ——— Media gallery ——— */}
        {mediaUrls.length > 0 && (
          <View style={[styles.mediaSection, { backgroundColor: colors.background }]}>
            <View style={styles.mediaSectionHeader}>
              <Text style={[styles.mediaSectionLabel, { color: colors.tabIconDefault }]}>Photos & videos</Text>
              <Text style={[styles.mediaSectionHint, { color: colors.tint }]}>Tap to view full screen</Text>
            </View>
            <View style={styles.mediaRow}>
              {mediaUrls.slice(0, 3).map((url, idx) => {
                const isVideo = isVideoUrl(url);
                return (
                  <Pressable
                    key={url}
                    style={[styles.mediaThumb, { borderColor: colors.tabIconDefault }]}
                    onPress={() => setMediaPreviewIndex(idx)}
                  >
                    {isVideo ? (
                      <MediaWithWatermark style={[styles.mediaThumbInner, styles.videoPlaceholder, { backgroundColor: colors.tabIconDefault + '40' }]}>
                        <MaterialCommunityIcons name="play-circle-outline" size={36} color={colors.tint} />
                        <Text style={[styles.videoLabel, { color: colors.text }]}>Video</Text>
                      </MediaWithWatermark>
                    ) : (
                      <MediaWithWatermark style={styles.mediaThumbInner}>
                        <Image source={{ uri: url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                        <View style={styles.tapOverlay} pointerEvents="none">
                          <MaterialCommunityIcons name="image-outline" size={20} color="rgba(255,255,255,0.9)" />
                        </View>
                      </MediaWithWatermark>
                    )}
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        {/* ——— Post content ——— */}
        <View style={[styles.card, { borderColor: colors.border ?? colors.tabIconDefault }]}>
          <View style={styles.postMetaRow}>
            <View style={[styles.categoryPill, { backgroundColor: colors.tint + '22' }]}>
              <Text style={[styles.categoryPillText, { color: colors.tint }]}>{categoryLabel}</Text>
            </View>
            <Text style={[styles.postDate, { color: colors.tabIconDefault }]}>
              {post.created_at
                ? new Date(post.created_at).toLocaleDateString(undefined, {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })
                : ''}
            </Text>
          </View>
          {post.title ? (
            <Text style={[styles.title, { color: colors.text }]}>{post.title}</Text>
          ) : null}
          {post.body ? (
            <Text style={[styles.body, { color: colors.text }]}>{post.body}</Text>
          ) : null}

          <View style={[styles.statsRow, { borderTopColor: colors.border ?? colors.tabIconDefault }]}>
            <Text style={[styles.meta, { color: colors.tabIconDefault }]}>
              {post.view_count ?? 0} views · {post.like_count ?? 0} likes · {post.share_count ?? 0} shares · {comments.length} comments
            </Text>
            <View style={styles.actionRow}>
              <Pressable
                style={[styles.actionBtn, postLikedByMe && { backgroundColor: colors.tint + '22' }]}
                onPress={handleLikePost}
                disabled={likingPost}
              >
                <MaterialCommunityIcons
                  name={postLikedByMe ? 'heart' : 'heart-outline'}
                  size={22}
                  color={postLikedByMe ? colors.tint : colors.tabIconDefault}
                />
                <Text style={[styles.actionBtnText, { color: postLikedByMe ? colors.tint : colors.tabIconDefault }]}>
                  Like
                </Text>
              </Pressable>
              <Pressable style={[styles.actionBtn, { backgroundColor: colors.background }]} onPress={() => setCommentsSheetVisible(true)}>
                <MaterialCommunityIcons name="comment-outline" size={22} color={colors.tabIconDefault} />
                <Text style={[styles.actionBtnText, { color: colors.tabIconDefault }]}>Comment</Text>
              </Pressable>
              <Pressable style={[styles.actionBtn, { backgroundColor: colors.background }]} onPress={handleShare}>
                <MaterialCommunityIcons name="share-outline" size={22} color={colors.tabIconDefault} />
                <Text style={[styles.actionBtnText, { color: colors.tabIconDefault }]}>Share</Text>
              </Pressable>
            </View>
          </View>

          {/* Author with avatar — tap to open profile */}
          <Link href={{ pathname: '/(tabs)/member/[id]', params: { id: post.author_id } }} asChild>
            <Pressable style={[styles.authorBox, { borderTopColor: colors.border ?? colors.tabIconDefault }]}>
              <Text style={[styles.authorLabel, { color: colors.tabIconDefault }]}>Posted by</Text>
              <View style={styles.authorRow}>
                {authorAvatar ? (
                  <Image source={{ uri: authorAvatar }} style={styles.authorAvatar} />
                ) : (
                  <View style={[styles.authorAvatarPlaceholder, { backgroundColor: colors.tint }]}>
                    <Text style={styles.authorAvatarInitial}>
                      {(authorLabel || '?').charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
                <View style={styles.authorInfo}>
                  <Text style={[styles.authorName, { color: colors.text }]} numberOfLines={1}>
                    {authorLabel}
                  </Text>
                  <Text style={[styles.authorMeta, { color: colors.tabIconDefault }]}>
                    Member · {authorDays} days · Tap to view profile
                  </Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={20} color={colors.tabIconDefault} />
              </View>
            </Pressable>
          </Link>
        </View>

        {/* Comments — tap to open Instagram-style bottom sheet */}
        <Pressable
          style={[styles.commentsTrigger, { borderColor: colors.border ?? colors.tabIconDefault, backgroundColor: colors.cardBg ?? colors.background }]}
          onPress={() => setCommentsSheetVisible(true)}
        >
          <MaterialCommunityIcons name="comment-outline" size={24} color={colors.tint} />
          <Text style={[styles.commentsTriggerText, { color: colors.text }]}>Comments ({comments.length})</Text>
          <MaterialCommunityIcons name="chevron-right" size={22} color={colors.tabIconDefault} />
        </Pressable>
      </ScrollView>

      {/* Instagram-style comments bottom sheet */}
      <Modal
        visible={commentsSheetVisible || sheetClosing}
        transparent
        animationType="fade"
        onRequestClose={closeCommentsSheet}
      >
        <Pressable style={styles.sheetBackdrop} onPress={closeCommentsSheet} />
        <Animated.View
          style={[
            styles.sheetContainer,
            {
              height: SHEET_HEIGHT,
              backgroundColor: colors.background,
            },
            { transform: [{ translateY: sheetTranslateY }] },
          ]}
        >
          <Pressable style={styles.sheetHandle} onPress={closeCommentsSheet}>
            <View style={[styles.sheetHandleBar, { backgroundColor: colors.tabIconDefault }]} />
          </Pressable>
          <View style={[styles.sheetHeader, { borderBottomColor: colors.border ?? colors.tabIconDefault }]}>
            <Text style={[styles.sheetTitle, { color: colors.text }]}>Comments</Text>
            <Pressable onPress={closeCommentsSheet} hitSlop={12}>
              <MaterialCommunityIcons name="close" size={24} color={colors.tabIconDefault} />
            </Pressable>
          </View>

          <KeyboardAvoidingView
            style={styles.sheetBody}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
          >
            <FlatList
              data={commentTreeFlat}
              keyExtractor={(item) => item.comment.id}
              renderItem={({ item }) => (
                <CommentItem
                  comment={item.comment}
                  commentLikedIds={commentLikedIds}
                  colors={colors}
                  onReply={() => setReplyingToId(item.comment.id)}
                  onLike={handleLikeComment}
                  canInteract={!!canPost}
                  depth={item.depth}
                />
              )}
              contentContainerStyle={[styles.sheetListContent, comments.length === 0 && styles.sheetListEmpty]}
              ListEmptyComponent={
                <Text style={[styles.commentsEmpty, { color: colors.tabIconDefault }]}>No comments yet. Be the first to comment.</Text>
              }
              keyboardShouldPersistTaps="handled"
            />

            <View style={[styles.sheetFooter, { borderTopColor: colors.border ?? colors.tabIconDefault, backgroundColor: colors.background }]}>
              <Text style={[styles.sheetGuidelines, { color: colors.secondaryText }]}>{COMMUNITY_GUIDELINES_NOTE}</Text>
              {replyingToId ? (
                <View style={[styles.replyingToBar, { backgroundColor: colors.tint + '18', borderColor: colors.tint + '44' }]}>
                  <Text style={[styles.replyingToText, { color: colors.tint }]} numberOfLines={1}>Replying to a comment</Text>
                  <Pressable onPress={() => setReplyingToId(null)} hitSlop={8}>
                    <MaterialCommunityIcons name="close" size={18} color={colors.tint} />
                  </Pressable>
                </View>
              ) : null}
              <View style={styles.sheetInputRow}>
                <TextInput
                  style={[styles.sheetInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.cardBg }]}
                  placeholder="Add a comment..."
                  placeholderTextColor={colors.tabIconDefault}
                  value={newCommentBody}
                  onChangeText={setNewCommentBody}
                  multiline
                  maxLength={2000}
                  editable={!!userId}
                />
                <Pressable
                  style={[
                    styles.sheetSendBtn,
                    { backgroundColor: colors.tint },
                    (!newCommentBody.trim() || submittingComment) && { opacity: 0.6 },
                  ]}
                  onPress={handleSubmitComment}
                  disabled={!newCommentBody.trim() || submittingComment}
                >
                  {submittingComment ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <MaterialCommunityIcons name="send" size={20} color="#fff" />
                  )}
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Animated.View>
      </Modal>

      {/* Full-screen media preview */}

      {mediaUrls[mediaPreviewIndex ?? -1] && (
        <>
          <PhotoPreviewModal
            visible={mediaPreviewIndex !== null && !isVideoUrl(mediaUrls[mediaPreviewIndex])}
            uri={mediaUrls[mediaPreviewIndex!]}
            onClose={() => setMediaPreviewIndex(null)}
          />
          <VideoPreviewModal
            visible={mediaPreviewIndex !== null && isVideoUrl(mediaUrls[mediaPreviewIndex!])}
            uri={mediaUrls[mediaPreviewIndex!]}
            onClose={() => setMediaPreviewIndex(null)}
          />
        </>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  container: { flex: 1 },
  content: { paddingBottom: 120 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backText: { fontSize: 16, fontWeight: '600' },
  mediaSection: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
  },
  mediaSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  mediaSectionLabel: { fontSize: 13, fontWeight: '600' },
  mediaSectionHint: { fontSize: 12, fontWeight: '500' },
  mediaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  mediaThumb: {
    width: '31%',
    maxWidth: 120,
    aspectRatio: 1,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  mediaThumbInner: {
    width: '100%',
    height: '100%',
  },
  videoPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoLabel: { fontSize: 12, fontWeight: '600', marginTop: 4 },
  tapOverlay: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 14,
    padding: 6,
  },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 18,
    marginHorizontal: 16,
    marginBottom: 16,
  },
  postMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 12,
  },
  categoryPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  categoryPillText: { fontSize: 12, fontWeight: '600' },
  postDate: { fontSize: 13 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 10, lineHeight: 28 },
  body: { fontSize: 15, lineHeight: 23 },
  statsRow: {
    paddingTop: 14,
    marginTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  meta: { fontSize: 14 },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 12,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
  },
  actionBtnText: { fontSize: 14, fontWeight: '600' },
  guidelinesBox: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 12,
  },
  guidelinesText: {
    fontSize: 12,
    lineHeight: 18,
    fontStyle: 'italic',
  },
  commentInputRow: { marginBottom: 16 },
  replyingToBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
  },
  replyingToText: { fontSize: 13, fontWeight: '600' },
  commentInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    minHeight: 80,
    maxHeight: 120,
    textAlignVertical: 'top',
  },
  cancelReplyWrap: { marginTop: 8 },
  cancelReplyText: { fontSize: 13 },
  submitCommentBtn: {
    marginTop: 10,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  submitCommentBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  commentList: { gap: 12 },
  commentBlock: { marginBottom: 12 },
  commentReplyBlock: {},
  comment: {
    borderLeftWidth: 3,
    paddingLeft: 12,
    paddingVertical: 10,
    paddingRight: 8,
  },
  commentAuthorRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  commentAuthor: { fontSize: 12, fontWeight: '600' },
  pendingBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  pendingBadgeText: { fontSize: 10, fontWeight: '600' },
  commentBody: { fontSize: 14, lineHeight: 20, marginBottom: 8 },
  commentActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  commentActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  commentActionText: { fontSize: 13 },
  repliesContainer: { marginTop: 4 },
  authorBox: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  authorLabel: { fontSize: 12, fontWeight: '600', marginBottom: 8 },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  authorAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: 12,
  },
  authorAvatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  authorAvatarInitial: { fontSize: 20, fontWeight: '700', color: '#fff' },
  authorInfo: { flex: 1, minWidth: 0 },
  authorName: { fontSize: 16, fontWeight: '700' },
  authorMeta: { fontSize: 13 },
  section: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 18,
    marginHorizontal: 16,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 12 },
  commentsEmpty: { fontSize: 14 },
  commentsTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 24,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  commentsTriggerText: { fontSize: 16, fontWeight: '600', flex: 1 },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheetContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 16,
  },
  sheetHandle: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  sheetHandleBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    opacity: 0.5,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sheetTitle: { fontSize: 18, fontWeight: '700' },
  sheetBody: { flex: 1, minHeight: 0 },
  sheetListContent: { paddingHorizontal: 16, paddingVertical: 12, paddingBottom: 24 },
  sheetListEmpty: { flexGrow: 1, justifyContent: 'center', paddingVertical: 48 },
  sheetFooter: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 28 : 16,
  },
  sheetGuidelines: { fontSize: 11, fontStyle: 'italic', marginBottom: 8 },
  sheetInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
  },
  sheetInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    paddingTop: 10,
    fontSize: 15,
    minHeight: 44,
    maxHeight: 100,
    textAlignVertical: 'top',
  },
  sheetSendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
