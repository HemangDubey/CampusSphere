// Student community: posts, comments, likes, bookmarks, clubs and project groups, reports and moderation.
// Rules enforced here (the UI only mirrors them): authors edit/delete only their own content, moderators
// (community:moderate) can hide or remove anything and resolve reports but not their own, project-group
// discussions are visible to active members only, and clubs are never "verified" unless an administrator says so.
const db = require('../db');
const { ok, HttpError } = require('../utils/response');
const { pageParams, oneOf, text, uuid } = require('../utils/query');
const { notify, notifyMany } = require('../services/notify');
const { audit } = require('../services/audit');
const { can } = require('../permissions');

const TOPICS = ['ACADEMICS', 'PROJECTS', 'TECHNOLOGY', 'CAMPUS_LIFE', 'CLUBS', 'CAREERS', 'GENERAL'];
const REASONS = ['SPAM', 'HARASSMENT', 'INAPPROPRIATE', 'MISINFORMATION', 'OTHER'];
const KINDS = ['CLUB', 'PROJECT_GROUP'];
const POLICIES = ['OPEN', 'REQUEST'];

const clean = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max) : '');
const fail = (errors) => { throw new HttpError(400, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', errors); };
const isMod = (user) => can(user, 'community:moderate');
const author = { select: { id: true, name: true, department: true } };

async function membership(clubId, userId) {
  if (!userId) return null;
  return db.clubMember.findUnique({ where: { clubId_userId: { clubId, userId } } });
}
const activeManager = (m) => m && m.status === 'ACTIVE' && m.role === 'MANAGER';
const activeMember = (m) => m && m.status === 'ACTIVE';

async function loadClub(id) {
  const club = await db.club.findUnique({ where: { id: uuid(id) } });
  if (!club) throw new HttpError(404, 'NOT_FOUND', 'Group not found.');
  return club;
}

// Can this viewer read this club's discussion? Clubs are public; project groups are members-only.
async function canReadGroup(club, user) {
  if (club.kind === 'CLUB') return true;
  if (!user) return false;
  return isMod(user) || activeMember(await membership(club.id, user.id));
}

// ------------------------------------------------------------------ posts
async function decoratePosts(posts, user) {
  const ids = posts.map((p) => p.id);
  const [likes, saves] = user && ids.length
    ? await Promise.all([db.postLike.findMany({ where: { userId: user.id, postId: { in: ids } }, select: { postId: true } }), db.postBookmark.findMany({ where: { userId: user.id, postId: { in: ids } }, select: { postId: true } })])
    : [[], []];
  const liked = new Set(likes.map((l) => l.postId)); const saved = new Set(saves.map((l) => l.postId));
  return posts.map(({ _count, ...p }) => ({ ...p, likeCount: _count.likes, commentCount: _count.comments, liked: liked.has(p.id), bookmarked: saved.has(p.id), mine: user ? p.authorId === user.id : false }));
}
const postInclude = { author, club: { select: { id: true, name: true, kind: true, verified: true } }, _count: { select: { likes: true, comments: { where: { status: 'VISIBLE' } } } } };

exports.listPosts = async (req, res, next) => {
  try {
    const { page, size, skip, take } = pageParams(req.query, { defaultSize: 10, maxSize: 30 });
    const topic = oneOf(req.query.topic, TOPICS, 'topic');
    const sort = oneOf(req.query.sort, ['recent', 'popular'], 'sort') || 'recent';
    const q = text(req.query.q, 80);
    const where = { status: 'VISIBLE' };
    if (topic) where.topic = topic;
    if (q) where.OR = [{ title: { contains: q, mode: 'insensitive' } }, { body: { contains: q, mode: 'insensitive' } }];
    if (req.query.clubId) {
      const club = await loadClub(req.query.clubId);
      if (!(await canReadGroup(club, req.user))) throw new HttpError(403, 'FORBIDDEN', 'Only members can read this group\'s discussion.');
      where.clubId = club.id;
    } else where.AND = [{ OR: [{ clubId: null }, { club: { kind: 'CLUB' } }] }];
    if (req.query.saved === '1') { if (!req.user) throw new HttpError(401, 'UNAUTHENTICATED', 'Sign in to see saved posts.'); where.bookmarks = { some: { userId: req.user.id } }; }
    if (req.query.mine === '1') { if (!req.user) throw new HttpError(401, 'UNAUTHENTICATED', 'Sign in to see your posts.'); where.authorId = req.user.id; }
    const orderBy = sort === 'popular' ? [{ likes: { _count: 'desc' } }, { comments: { _count: 'desc' } }, { createdAt: 'desc' }] : [{ createdAt: 'desc' }];
    const [total, rows] = await Promise.all([db.communityPost.count({ where }), db.communityPost.findMany({ where, orderBy, skip, take, include: postInclude })]);
    ok(res, { posts: await decoratePosts(rows, req.user), page, pageSize: size, total });
  } catch (e) { next(e); }
};

exports.trending = async (req, res, next) => {
  try {
    const since = new Date(Date.now() - 30 * 86400000);
    const rows = await db.communityPost.groupBy({ by: ['topic'], where: { status: 'VISIBLE', createdAt: { gte: since }, OR: [{ clubId: null }, { club: { kind: 'CLUB' } }] }, _count: { _all: true } });
    ok(res, { topics: rows.map((r) => ({ topic: r.topic, posts: r._count._all })).sort((a, b) => b.posts - a.posts), windowDays: 30 });
  } catch (e) { next(e); }
};

async function loadPost(req, { forWrite = false } = {}) {
  const post = await db.communityPost.findUnique({ where: { id: uuid(req.params.id) }, include: { ...postInclude, club: true } });
  if (!post) throw new HttpError(404, 'NOT_FOUND', 'Post not found.');
  const own = req.user && post.authorId === req.user.id;
  if (post.status !== 'VISIBLE' && !own && !isMod(req.user)) throw new HttpError(404, 'NOT_FOUND', 'Post not found.');
  if (post.club && !(await canReadGroup(post.club, req.user))) throw new HttpError(404, 'NOT_FOUND', 'Post not found.');
  if (forWrite && post.status !== 'VISIBLE') throw new HttpError(409, 'NOT_VISIBLE', 'This post is no longer available.');
  return post;
}

exports.getPost = async (req, res, next) => {
  try {
    const post = await loadPost(req);
    const comments = await db.communityComment.findMany({ where: { postId: post.id, status: 'VISIBLE' }, orderBy: { createdAt: 'asc' }, include: { author } });
    const [decorated] = await decoratePosts([post], req.user);
    ok(res, { post: decorated, comments: comments.map((c) => ({ ...c, mine: req.user ? c.authorId === req.user.id : false })) });
  } catch (e) { next(e); }
};

function readPostBody(body, existing) {
  const errors = {};
  const title = clean(body?.title, 120); const content = clean(body?.body, 4000); const topic = body?.topic || existing?.topic || 'GENERAL';
  if (title.length < 3) errors.title = 'Give your post a title of at least 3 characters.';
  if (content.length < 3) errors.body = 'Write something (at least 3 characters).';
  if (!TOPICS.includes(topic)) errors.topic = 'Choose a topic.';
  if (Object.keys(errors).length) fail(errors);
  return { title, body: content, topic };
}

exports.createPost = async (req, res, next) => {
  try {
    const data = readPostBody(req.body);
    let club = null;
    if (req.body.clubId) {
      club = await loadClub(req.body.clubId);
      const m = await membership(club.id, req.user.id);
      if (!activeMember(m)) throw new HttpError(403, 'FORBIDDEN', 'Join this group before posting in it.');
      if (club.status !== 'PUBLISHED') throw new HttpError(409, 'ARCHIVED', 'This group is archived.');
      data.clubId = club.id;
      if (req.body.isAnnouncement === true) {
        if (!activeManager(m)) throw new HttpError(403, 'FORBIDDEN', 'Only group managers can post announcements.');
        data.isAnnouncement = true;
      }
    }
    const post = await db.communityPost.create({ data: { ...data, authorId: req.user.id }, include: postInclude });
    if (data.isAnnouncement) {
      const members = await db.clubMember.findMany({ where: { clubId: club.id, status: 'ACTIVE', userId: { not: req.user.id } }, select: { userId: true } });
      await notifyMany(members.map((m) => m.userId), { type: 'COMMUNITY', title: `${club.name}: ${data.title}`, body: 'New group announcement', link: `/community/posts/${post.id}` });
    }
    const [decorated] = await decoratePosts([post], req.user);
    ok(res, { post: decorated }, { status: 201, message: 'Post published.' });
  } catch (e) { next(e); }
};

exports.updatePost = async (req, res, next) => {
  try {
    const post = await loadPost(req, { forWrite: true });
    if (post.authorId !== req.user.id) throw new HttpError(403, 'FORBIDDEN', 'You can only edit your own posts.');
    const data = readPostBody(req.body, post);
    const updated = await db.communityPost.update({ where: { id: post.id }, data, include: postInclude });
    const [decorated] = await decoratePosts([updated], req.user);
    ok(res, { post: decorated }, { message: 'Post updated.' });
  } catch (e) { next(e); }
};

exports.deletePost = async (req, res, next) => {
  try {
    const post = await loadPost(req);
    if (post.authorId === req.user.id) await db.communityPost.delete({ where: { id: post.id } });
    else if (isMod(req.user)) throw new HttpError(403, 'FORBIDDEN', 'Moderators remove posts through the moderation tools so the action is recorded.');
    else throw new HttpError(403, 'FORBIDDEN', 'You can only delete your own posts.');
    ok(res, null, { message: 'Post deleted.' });
  } catch (e) { next(e); }
};

const toggle = (model, field) => (on) => async (req, res, next) => {
  try {
    const post = await loadPost(req, { forWrite: true });
    const key = { userId_postId: { userId: req.user.id, postId: post.id } };
    if (on) await db[model].upsert({ where: key, create: { userId: req.user.id, postId: post.id }, update: {} });
    else await db[model].deleteMany({ where: { userId: req.user.id, postId: post.id } });
    const likeCount = await db.postLike.count({ where: { postId: post.id } });
    ok(res, { [field]: on, likeCount });
  } catch (e) { next(e); }
};
exports.like = toggle('postLike', 'liked')(true);
exports.unlike = toggle('postLike', 'liked')(false);
exports.bookmark = toggle('postBookmark', 'bookmarked')(true);
exports.unbookmark = toggle('postBookmark', 'bookmarked')(false);

// ------------------------------------------------------------------ comments
exports.addComment = async (req, res, next) => {
  try {
    const post = await loadPost(req, { forWrite: true });
    const body = clean(req.body?.body, 1500);
    if (body.length < 1) fail({ body: 'Write a comment.' });
    let parent = null;
    if (req.body.parentId) {
      parent = await db.communityComment.findUnique({ where: { id: uuid(req.body.parentId) } });
      if (!parent || parent.postId !== post.id || parent.status !== 'VISIBLE') throw new HttpError(404, 'NOT_FOUND', 'The comment you are replying to no longer exists.');
      if (parent.parentId) parent = await db.communityComment.findUnique({ where: { id: parent.parentId } }); // one level of nesting
    }
    const comment = await db.communityComment.create({ data: { postId: post.id, authorId: req.user.id, parentId: parent?.id || null, body }, include: { author } });
    const link = `/community/posts/${post.id}`;
    if (parent && parent.authorId !== req.user.id) await notify(parent.authorId, { type: 'COMMUNITY', title: `${req.user.name} replied to your comment`, body: body.slice(0, 120), link });
    if (post.authorId !== req.user.id && post.authorId !== parent?.authorId) await notify(post.authorId, { type: 'COMMUNITY', title: `${req.user.name} commented on your post`, body: body.slice(0, 120), link });
    ok(res, { comment: { ...comment, mine: true } }, { status: 201, message: 'Comment added.' });
  } catch (e) { next(e); }
};

async function loadComment(req) {
  const c = await db.communityComment.findUnique({ where: { id: uuid(req.params.id) } });
  if (!c || (c.status !== 'VISIBLE' && !isMod(req.user))) throw new HttpError(404, 'NOT_FOUND', 'Comment not found.');
  return c;
}
exports.updateComment = async (req, res, next) => {
  try {
    const c = await loadComment(req);
    if (c.authorId !== req.user.id) throw new HttpError(403, 'FORBIDDEN', 'You can only edit your own comments.');
    const body = clean(req.body?.body, 1500);
    if (!body) fail({ body: 'Write a comment.' });
    const updated = await db.communityComment.update({ where: { id: c.id }, data: { body }, include: { author } });
    ok(res, { comment: { ...updated, mine: true } }, { message: 'Comment updated.' });
  } catch (e) { next(e); }
};
exports.deleteComment = async (req, res, next) => {
  try {
    const c = await loadComment(req);
    if (c.authorId !== req.user.id) throw new HttpError(403, 'FORBIDDEN', 'You can only delete your own comments.');
    await db.communityComment.delete({ where: { id: c.id } });
    ok(res, null, { message: 'Comment deleted.' });
  } catch (e) { next(e); }
};

// ------------------------------------------------------------------ reports and moderation
exports.report = async (req, res, next) => {
  try {
    const targetType = oneOf(req.body?.targetType, ['POST', 'COMMENT'], 'target');
    const reason = oneOf(req.body?.reason, REASONS, 'reason');
    if (!targetType) fail({ targetType: 'Choose what you are reporting.' });
    if (!reason) fail({ reason: 'Choose a reason.' });
    const targetId = uuid(req.body.targetId);
    const target = targetType === 'POST' ? await db.communityPost.findUnique({ where: { id: targetId } }) : await db.communityComment.findUnique({ where: { id: targetId } });
    if (!target || target.status !== 'VISIBLE') throw new HttpError(404, 'NOT_FOUND', 'That content is no longer available.');
    if (target.authorId === req.user.id) throw new HttpError(400, 'SELF_REPORT', 'You cannot report your own content. You can edit or delete it instead.');
    const existing = await db.contentReport.findUnique({ where: { reporterId_targetType_targetId: { reporterId: req.user.id, targetType, targetId } } });
    if (existing) throw new HttpError(409, 'ALREADY_REPORTED', 'You have already reported this. Moderators will review it.');
    await db.contentReport.create({ data: { reporterId: req.user.id, targetType, targetId, reason, details: clean(req.body.details, 500) || null } });
    ok(res, null, { status: 201, message: 'Thanks. A moderator will review your report.' });
  } catch (e) { next(e); }
};

exports.reportQueue = async (req, res, next) => {
  try {
    const { page, size, skip, take } = pageParams(req.query, { defaultSize: 20, maxSize: 50 });
    const status = oneOf(req.query.status, ['OPEN', 'ACTIONED', 'DISMISSED'], 'status') || 'OPEN';
    const where = { status };
    const [total, rows] = await Promise.all([db.contentReport.count({ where }), db.contentReport.findMany({ where, orderBy: { createdAt: 'asc' }, skip, take, include: { reporter: { select: { id: true, name: true } }, resolver: { select: { id: true, name: true } } } })]);
    const items = await Promise.all(rows.map(async (r) => {
      const t = r.targetType === 'POST'
        ? await db.communityPost.findUnique({ where: { id: r.targetId }, select: { id: true, title: true, body: true, status: true, authorId: true, author } })
        : await db.communityComment.findUnique({ where: { id: r.targetId }, select: { id: true, body: true, status: true, postId: true, authorId: true, author } });
      return { ...r, target: t };
    }));
    ok(res, { reports: items, page, pageSize: size, total });
  } catch (e) { next(e); }
};

// Moderators act on a report: HIDE (reversible), REMOVE, or DISMISS. They cannot resolve a report they filed
// or act on their own content, so no one moderates themselves.
exports.resolveReport = async (req, res, next) => {
  try {
    const action = oneOf(req.body?.action, ['HIDE', 'REMOVE', 'DISMISS'], 'action');
    if (!action) fail({ action: 'Choose an action.' });
    const note = clean(req.body.note, 500);
    if (action !== 'DISMISS' && note.length < 3) fail({ note: 'Add a short note explaining the decision.' });
    const report = await db.contentReport.findUnique({ where: { id: uuid(req.params.id) } });
    if (!report) throw new HttpError(404, 'NOT_FOUND', 'Report not found.');
    if (report.status !== 'OPEN') throw new HttpError(409, 'ALREADY_RESOLVED', 'This report was already resolved.');
    if (report.reporterId === req.user.id) throw new HttpError(403, 'FORBIDDEN', 'You cannot resolve a report you filed.');
    const model = report.targetType === 'POST' ? db.communityPost : db.communityComment;
    const target = await model.findUnique({ where: { id: report.targetId } });
    if (target && target.authorId === req.user.id && action !== 'DISMISS') throw new HttpError(403, 'FORBIDDEN', 'You cannot moderate your own content.');
    await db.$transaction(async (tx) => {
      if (target && action !== 'DISMISS') await (report.targetType === 'POST' ? tx.communityPost : tx.communityComment).update({ where: { id: target.id }, data: { status: action === 'HIDE' ? 'HIDDEN' : 'REMOVED' } });
      await tx.contentReport.updateMany({ where: { targetType: report.targetType, targetId: report.targetId, status: 'OPEN' }, data: { status: action === 'DISMISS' ? 'DISMISSED' : 'ACTIONED', resolverId: req.user.id, resolutionNote: note || null, resolvedAt: new Date() } });
      await audit(req.user, `community.${action.toLowerCase()}`, report.targetType === 'POST' ? 'CommunityPost' : 'CommunityComment', report.targetId, `Moderation: ${action} (${report.reason})`, { note }, tx);
    });
    if (target && action !== 'DISMISS') await notify(target.authorId, { type: 'COMMUNITY', title: `Your ${report.targetType.toLowerCase()} was ${action === 'HIDE' ? 'hidden' : 'removed'} by a moderator`, body: note, link: '/community' });
    ok(res, null, { message: action === 'DISMISS' ? 'Report dismissed.' : 'Content moderated.' });
  } catch (e) { next(e); }
};

// Restore previously hidden content (moderators only; recorded in the audit log).
exports.restore = async (req, res, next) => {
  try {
    const type = oneOf(req.params.type, ['post', 'comment'], 'type');
    const id = uuid(req.params.id);
    const model = type === 'post' ? db.communityPost : db.communityComment;
    const target = await model.findUnique({ where: { id } });
    if (!target) throw new HttpError(404, 'NOT_FOUND', 'Content not found.');
    if (target.status !== 'HIDDEN') throw new HttpError(409, 'NOT_HIDDEN', 'Only hidden content can be restored.');
    await model.update({ where: { id }, data: { status: 'VISIBLE' } });
    await audit(req.user, 'community.restore', type === 'post' ? 'CommunityPost' : 'CommunityComment', id, 'Moderation: restored hidden content');
    ok(res, null, { message: 'Content restored.' });
  } catch (e) { next(e); }
};

// ------------------------------------------------------------------ clubs and project groups
const clubShape = (c, mine) => ({ id: c.id, name: c.name, kind: c.kind, category: c.category, description: c.description, joinPolicy: c.joinPolicy, contactLink: c.contactLink, coverUrl: c.coverUrl, verified: c.verified, status: c.status, createdAt: c.createdAt, memberCount: c._count?.members, myMembership: mine ? { role: mine.role, status: mine.status } : null });

exports.listClubs = async (req, res, next) => {
  try {
    const { page, size, skip, take } = pageParams(req.query, { defaultSize: 12, maxSize: 30 });
    const kind = oneOf(req.query.kind, KINDS, 'kind');
    const category = oneOf(req.query.category, TOPICS, 'category');
    const q = text(req.query.q, 60);
    const where = { status: 'PUBLISHED' };
    if (kind) where.kind = kind;
    if (category) where.category = category;
    if (q) where.OR = [{ name: { contains: q, mode: 'insensitive' } }, { description: { contains: q, mode: 'insensitive' } }];
    if (req.query.mine === '1') { if (!req.user) throw new HttpError(401, 'UNAUTHENTICATED', 'Sign in to see your groups.'); where.members = { some: { userId: req.user.id } }; }
    const [total, rows] = await Promise.all([db.club.count({ where }), db.club.findMany({ where, orderBy: [{ verified: 'desc' }, { name: 'asc' }], skip, take, include: { _count: { select: { members: { where: { status: 'ACTIVE' } } } } } })]);
    const mine = req.user && rows.length ? await db.clubMember.findMany({ where: { userId: req.user.id, clubId: { in: rows.map((r) => r.id) } } }) : [];
    const byId = new Map(mine.map((m) => [m.clubId, m]));
    ok(res, { groups: rows.map((c) => clubShape(c, byId.get(c.id))), page, pageSize: size, total });
  } catch (e) { next(e); }
};

exports.getClub = async (req, res, next) => {
  try {
    const club = await loadClub(req.params.id);
    const mine = await membership(club.id, req.user?.id);
    const readable = await canReadGroup(club, req.user);
    if (club.status !== 'PUBLISHED' && !activeManager(mine) && !can(req.user, 'content:manage')) throw new HttpError(404, 'NOT_FOUND', 'Group not found.');
    const memberCount = await db.clubMember.count({ where: { clubId: club.id, status: 'ACTIVE' } });
    const managers = await db.clubMember.findMany({ where: { clubId: club.id, status: 'ACTIVE', role: 'MANAGER' }, include: { user: { select: { id: true, name: true } } } });
    const members = activeMember(mine) || isMod(req.user)
      ? (await db.clubMember.findMany({ where: { clubId: club.id, status: 'ACTIVE' }, include: { user: { select: { id: true, name: true, department: true } } }, orderBy: { createdAt: 'asc' } })).map((m) => ({ userId: m.userId, name: m.user.name, department: m.user.department, role: m.role }))
      : null;
    ok(res, { group: { ...clubShape({ ...club, _count: { members: memberCount } }, mine), managers: managers.map((m) => ({ id: m.userId, name: m.user.name })), canReadDiscussion: readable, canManage: activeManager(mine) || can(req.user, 'content:manage'), members } });
  } catch (e) { next(e); }
};

function readClubBody(body, req, existing) {
  const errors = {};
  const name = clean(body?.name ?? existing?.name, 80); const description = clean(body?.description ?? existing?.description, 1500);
  const kind = body?.kind ?? existing?.kind ?? 'CLUB'; const category = body?.category ?? existing?.category ?? 'GENERAL'; const joinPolicy = body?.joinPolicy ?? existing?.joinPolicy ?? 'REQUEST';
  if (name.length < 3) errors.name = 'Enter a name of at least 3 characters.';
  if (description.length < 10) errors.description = 'Describe the group in at least 10 characters.';
  if (!KINDS.includes(kind)) errors.kind = 'Choose club or project group.';
  if (!TOPICS.includes(category)) errors.category = 'Choose a category.';
  if (!POLICIES.includes(joinPolicy)) errors.joinPolicy = 'Choose how people join.';
  const data = { name, description, kind, category, joinPolicy };
  if (body?.contactLink !== undefined) {
    const link = clean(body.contactLink, 300);
    if (link && !/^https:\/\/[^\s]+$/i.test(link)) errors.contactLink = 'Use a full https:// link.';
    data.contactLink = link || null;
  }
  if (Object.keys(errors).length) fail(errors);
  // Verification and cover images are administrator-only, so a student cannot present a group as official.
  if (can(req.user, 'content:manage')) {
    if (typeof body?.verified === 'boolean') data.verified = body.verified;
    if (body?.coverUrl !== undefined) {
      const url = clean(body.coverUrl, 400);
      if (url && !/^https:\/\/[^\s]+$/i.test(url)) fail({ coverUrl: 'Use a full https:// image link.' });
      data.coverUrl = url || null;
    }
  }
  return data;
}

exports.createClub = async (req, res, next) => {
  try {
    const data = readClubBody(req.body, req);
    if (await db.club.findFirst({ where: { name: { equals: data.name, mode: 'insensitive' } } })) fail({ name: 'A group with this name already exists.' });
    const club = await db.club.create({ data: { ...data, createdById: req.user.id, members: { create: { userId: req.user.id, role: 'MANAGER', status: 'ACTIVE' } } } });
    ok(res, { group: clubShape(club, { role: 'MANAGER', status: 'ACTIVE' }) }, { status: 201, message: 'Group created. It is not marked as official until an administrator verifies it.' });
  } catch (e) { next(e); }
};

async function requireManager(req) {
  const club = await loadClub(req.params.id);
  const m = await membership(club.id, req.user.id);
  if (!activeManager(m) && !can(req.user, 'content:manage')) throw new HttpError(403, 'FORBIDDEN', 'Only group managers can do that.');
  return club;
}

exports.updateClub = async (req, res, next) => {
  try {
    const club = await requireManager(req);
    const data = readClubBody(req.body, req, club);
    const clash = await db.club.findFirst({ where: { name: { equals: data.name, mode: 'insensitive' }, id: { not: club.id } } });
    if (clash) fail({ name: 'A group with this name already exists.' });
    const updated = await db.club.update({ where: { id: club.id }, data });
    if (data.verified !== undefined && data.verified !== club.verified) await audit(req.user, data.verified ? 'club.verify' : 'club.unverify', 'Club', club.id, `${data.verified ? 'Verified' : 'Unverified'} group "${club.name}"`);
    ok(res, { group: clubShape(updated) }, { message: 'Group updated.' });
  } catch (e) { next(e); }
};

exports.archiveClub = async (req, res, next) => {
  try {
    const club = await requireManager(req);
    await db.club.update({ where: { id: club.id }, data: { status: 'ARCHIVED' } });
    if (can(req.user, 'content:manage')) await audit(req.user, 'club.archive', 'Club', club.id, `Archived group "${club.name}"`);
    ok(res, null, { message: 'Group archived.' });
  } catch (e) { next(e); }
};

exports.join = async (req, res, next) => {
  try {
    const club = await loadClub(req.params.id);
    if (club.status !== 'PUBLISHED') throw new HttpError(409, 'ARCHIVED', 'This group is archived.');
    const existing = await membership(club.id, req.user.id);
    if (existing) throw new HttpError(409, 'ALREADY_MEMBER', existing.status === 'PENDING' ? 'Your request is already waiting for approval.' : 'You are already a member.');
    const open = club.joinPolicy === 'OPEN';
    const message = clean(req.body?.message, 300) || null;
    await db.clubMember.create({ data: { clubId: club.id, userId: req.user.id, status: open ? 'ACTIVE' : 'PENDING', message } });
    if (!open) {
      const managers = await db.clubMember.findMany({ where: { clubId: club.id, role: 'MANAGER', status: 'ACTIVE' }, select: { userId: true } });
      await notifyMany(managers.map((m) => m.userId), { type: 'COMMUNITY', title: `${req.user.name} asked to join ${club.name}`, body: message || undefined, link: `/community/groups/${club.id}` });
    }
    ok(res, { status: open ? 'ACTIVE' : 'PENDING' }, { status: 201, message: open ? `You joined ${club.name}.` : 'Request sent. A group manager will review it.' });
  } catch (e) { next(e); }
};

exports.leave = async (req, res, next) => {
  try {
    const club = await loadClub(req.params.id);
    const m = await membership(club.id, req.user.id);
    if (!m) throw new HttpError(404, 'NOT_FOUND', 'You are not a member of this group.');
    if (activeManager(m) && (await db.clubMember.count({ where: { clubId: club.id, role: 'MANAGER', status: 'ACTIVE' } })) <= 1) throw new HttpError(409, 'LAST_MANAGER', 'You are the only manager. Promote another member or archive the group first.');
    await db.clubMember.delete({ where: { clubId_userId: { clubId: club.id, userId: req.user.id } } });
    ok(res, null, { message: m.status === 'PENDING' ? 'Request withdrawn.' : `You left ${club.name}.` });
  } catch (e) { next(e); }
};

exports.requests = async (req, res, next) => {
  try {
    const club = await requireManager(req);
    const rows = await db.clubMember.findMany({ where: { clubId: club.id, status: 'PENDING' }, orderBy: { createdAt: 'asc' }, include: { user: { select: { id: true, name: true, department: true } } } });
    ok(res, { requests: rows.map((m) => ({ userId: m.userId, name: m.user.name, department: m.user.department, message: m.message, createdAt: m.createdAt })) });
  } catch (e) { next(e); }
};

exports.decide = async (req, res, next) => {
  try {
    const club = await requireManager(req);
    const decision = oneOf(req.body?.decision, ['approve', 'reject'], 'decision');
    if (!decision) fail({ decision: 'Choose approve or reject.' });
    const userId = uuid(req.params.userId);
    const m = await membership(club.id, userId);
    if (!m || m.status !== 'PENDING') throw new HttpError(404, 'NOT_FOUND', 'There is no pending request from that person.');
    if (userId === req.user.id) throw new HttpError(403, 'FORBIDDEN', 'You cannot decide your own request.');
    if (decision === 'approve') await db.clubMember.update({ where: { clubId_userId: { clubId: club.id, userId } }, data: { status: 'ACTIVE' } });
    else await db.clubMember.delete({ where: { clubId_userId: { clubId: club.id, userId } } });
    await notify(userId, { type: 'COMMUNITY', title: decision === 'approve' ? `You were accepted into ${club.name}` : `Your request to join ${club.name} was declined`, link: `/community/groups/${club.id}` });
    ok(res, null, { message: decision === 'approve' ? 'Member approved.' : 'Request declined.' });
  } catch (e) { next(e); }
};

exports.removeMember = async (req, res, next) => {
  try {
    const club = await requireManager(req);
    const userId = uuid(req.params.userId);
    if (userId === req.user.id) throw new HttpError(400, 'USE_LEAVE', 'Use "Leave group" to remove yourself.');
    const m = await membership(club.id, userId);
    if (!m || m.status !== 'ACTIVE') throw new HttpError(404, 'NOT_FOUND', 'That person is not a member.');
    if (m.role === 'MANAGER' && !can(req.user, 'content:manage')) throw new HttpError(403, 'FORBIDDEN', 'Managers can only be removed by an administrator.');
    await db.clubMember.delete({ where: { clubId_userId: { clubId: club.id, userId } } });
    await notify(userId, { type: 'COMMUNITY', title: `You were removed from ${club.name}`, link: '/community' });
    ok(res, null, { message: 'Member removed.' });
  } catch (e) { next(e); }
};

exports.setRole = async (req, res, next) => {
  try {
    const club = await requireManager(req);
    const role = oneOf(req.body?.role, ['MEMBER', 'MANAGER'], 'role');
    if (!role) fail({ role: 'Choose a role.' });
    const userId = uuid(req.params.userId);
    const m = await membership(club.id, userId);
    if (!m || m.status !== 'ACTIVE') throw new HttpError(404, 'NOT_FOUND', 'That person is not a member.');
    if (role === 'MEMBER' && m.role === 'MANAGER' && (await db.clubMember.count({ where: { clubId: club.id, role: 'MANAGER', status: 'ACTIVE' } })) <= 1) throw new HttpError(409, 'LAST_MANAGER', 'A group needs at least one manager.');
    await db.clubMember.update({ where: { clubId_userId: { clubId: club.id, userId } }, data: { role } });
    ok(res, null, { message: 'Role updated.' });
  } catch (e) { next(e); }
};
