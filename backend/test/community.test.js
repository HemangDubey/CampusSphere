// Student community: posts, comments, likes, bookmarks, clubs, project groups, reports and moderation.
process.env.AUTH_RATE_LIMIT_MAX = '1000';
const assert = require('assert');
const { createServer } = require('../src/server');
const db = require('../src/db');
const { start, client, signUp } = require('./helpers');

const PREFIX = `test-${Date.now()}`;

(async () => {
  const server = await start(createServer);
  const anon = client(server);
  let failed = false;
  try {
    const a = await signUp(server, db, PREFIX, 'a');
    const b = await signUp(server, db, PREFIX, 'b');
    const c = await signUp(server, db, PREFIX, 'c');
    const mod = await signUp(server, db, PREFIX, 'mod', 'CAMPUS_ADMIN');
    const mod2 = await signUp(server, db, PREFIX, 'mod2', 'CAMPUS_ADMIN');
    const post = (o = {}) => ({ title: `${PREFIX} hello`, body: 'First post body', topic: 'TECHNOLOGY', ...o });

    // ---- Anonymous: read-only
    assert.equal((await anon.get('/api/community/posts')).status, 200);
    assert.equal((await anon.get('/api/community/groups')).status, 200);
    assert.equal((await anon.post('/api/community/posts', post())).status, 401);
    assert.equal((await anon.put(`/api/community/posts/${'1'.repeat(8)}-1111-4111-8111-111111111111/like`)).status, 401);
    assert.equal((await anon.get('/api/community/posts?saved=1')).status, 401);
    assert.equal((await anon.get('/api/manage/community/reports')).status, 401);
    assert.equal((await a.api.get('/api/manage/community/reports')).status, 403, 'students are not moderators');

    // ---- Posts: validation, create, read, search, sort
    let r = await a.api.post('/api/community/posts', { title: 'x', body: '', topic: 'NOPE' });
    assert.equal(r.status, 400);
    ['title', 'body', 'topic'].forEach((f) => assert.ok(r.body.error.details[f], `error for ${f}`));
    r = await a.api.post('/api/community/posts', post());
    assert.equal(r.status, 201);
    const p1 = r.body.data.post;
    assert.equal(p1.author.id, a.id);
    assert.equal(p1.likeCount, 0);
    assert.equal(p1.mine, true);
    const p2 = (await b.api.post('/api/community/posts', post({ title: `${PREFIX} second`, body: 'Looking for teammates', topic: 'PROJECTS' }))).body.data.post;
    r = await anon.get(`/api/community/posts?q=${PREFIX}`);
    assert.equal(r.body.data.total, 2);
    assert.equal(r.body.data.posts[0].id, p2.id, 'recent first');
    assert.equal((await anon.get(`/api/community/posts?q=${PREFIX}&topic=PROJECTS`)).body.data.total, 1);
    assert.equal((await anon.get('/api/community/posts?topic=BOGUS')).status, 400);
    assert.equal((await anon.get('/api/community/posts?page=0')).status, 400);
    assert.equal((await anon.get(`/api/community/posts?q=zzzz-no-match-${PREFIX}`)).body.data.posts.length, 0, 'empty result');
    assert.ok((await anon.get('/api/community/trending')).body.data.topics.some((t) => t.topic === 'TECHNOLOGY'));

    // ---- Edit / delete permissions
    assert.equal((await b.api.patch(`/api/community/posts/${p1.id}`, post())).status, 403, 'only the author can edit');
    assert.equal((await a.api.patch(`/api/community/posts/${p1.id}`, post({ title: `${PREFIX} edited` }))).body.data.post.title, `${PREFIX} edited`);
    assert.equal((await b.api.del(`/api/community/posts/${p1.id}`)).status, 403);
    assert.equal((await mod.api.del(`/api/community/posts/${p1.id}`)).status, 403, 'moderators use the audited tools, not plain delete');

    // ---- Likes: idempotent, no duplicates
    r = await b.api.put(`/api/community/posts/${p1.id}/like`);
    assert.equal(r.body.data.likeCount, 1);
    r = await b.api.put(`/api/community/posts/${p1.id}/like`);
    assert.equal(r.body.data.likeCount, 1, 'liking twice does not double count');
    assert.equal(await db.postLike.count({ where: { postId: p1.id } }), 1);
    assert.equal((await b.api.get(`/api/community/posts/${p1.id}`)).body.data.post.liked, true);
    assert.equal((await c.api.get(`/api/community/posts/${p1.id}`)).body.data.post.liked, false, 'liked state is per user');
    await c.api.put(`/api/community/posts/${p1.id}/like`);
    assert.equal((await anon.get(`/api/community/posts?q=${PREFIX}&sort=popular`)).body.data.posts[0].id, p1.id, 'popular sorts by real likes');
    assert.equal((await c.api.del(`/api/community/posts/${p1.id}/like`)).body.data.likeCount, 1);

    // ---- Bookmarks are private to each user
    assert.equal((await b.api.put(`/api/community/posts/${p1.id}/bookmark`)).status, 200);
    assert.equal((await b.api.get('/api/community/posts?saved=1')).body.data.total, 1);
    assert.equal((await c.api.get('/api/community/posts?saved=1')).body.data.total, 0);
    await b.api.del(`/api/community/posts/${p1.id}/bookmark`);
    assert.equal((await b.api.get('/api/community/posts?saved=1')).body.data.total, 0);

    // ---- Comments, replies, notifications
    assert.equal((await b.api.post(`/api/community/posts/${p1.id}/comments`, { body: '' })).status, 400);
    r = await b.api.post(`/api/community/posts/${p1.id}/comments`, { body: 'Nice post' });
    assert.equal(r.status, 201);
    const c1 = r.body.data.comment;
    assert.ok(await db.notification.findFirst({ where: { userId: a.id, title: { contains: 'commented on your post' } } }), 'post author is notified');
    r = await a.api.post(`/api/community/posts/${p1.id}/comments`, { body: 'Thanks!', parentId: c1.id });
    assert.equal(r.status, 201);
    assert.ok(await db.notification.findFirst({ where: { userId: b.id, title: { contains: 'replied to your comment' } } }), 'comment author is notified of a reply');
    assert.equal(await db.notification.count({ where: { userId: a.id, title: { contains: 'commented on your post' } } }), 1, 'own reply does not notify yourself');
    assert.equal((await a.api.patch(`/api/community/comments/${c1.id}`, { body: 'hijack' })).status, 403);
    assert.equal((await b.api.patch(`/api/community/comments/${c1.id}`, { body: 'Nice post, edited' })).body.data.comment.body, 'Nice post, edited');
    const detail = (await anon.get(`/api/community/posts/${p1.id}`)).body.data;
    assert.equal(detail.comments.length, 2);
    assert.equal(detail.post.commentCount, 2);
    assert.equal((await a.api.post(`/api/community/posts/${p1.id}/comments`, { body: 'x', parentId: '11111111-1111-4111-8111-111111111111' })).status, 404);
    assert.equal((await a.api.del(`/api/community/comments/${c1.id}`)).status, 403);

    // ---- Reports and moderation
    assert.equal((await a.api.post('/api/community/reports', { targetType: 'POST', targetId: p1.id, reason: 'SPAM' })).status, 400, 'cannot report your own post');
    assert.equal((await b.api.post('/api/community/reports', { targetType: 'POST', targetId: p1.id })).status, 400, 'reason is required');
    assert.equal((await b.api.post('/api/community/reports', { targetType: 'POST', targetId: p1.id, reason: 'SPAM', details: 'looks off' })).status, 201);
    assert.equal((await b.api.post('/api/community/reports', { targetType: 'POST', targetId: p1.id, reason: 'SPAM' })).status, 409, 'no duplicate reports');
    r = await mod.api.get('/api/manage/community/reports');
    const rep = r.body.data.reports.find((x) => x.targetId === p1.id);
    assert.ok(rep && rep.target.title);
    assert.equal((await a.api.post(`/api/manage/community/reports/${rep.id}/resolve`, { action: 'HIDE', note: 'no' })).status, 403, 'students cannot resolve');
    assert.equal((await mod.api.post(`/api/manage/community/reports/${rep.id}/resolve`, { action: 'HIDE' })).status, 400, 'a note is required to hide');
    assert.equal((await mod.api.post(`/api/manage/community/reports/${rep.id}/resolve`, { action: 'HIDE', note: 'Violates guidelines' })).status, 200);
    assert.equal((await anon.get(`/api/community/posts/${p1.id}`)).status, 404, 'hidden posts disappear for the public');
    assert.equal((await a.api.get(`/api/community/posts/${p1.id}`)).status, 200, 'the author can still see their hidden post');
    assert.equal((await anon.get(`/api/community/posts?q=${PREFIX}`)).body.data.total, 1);
    assert.ok(await db.notification.findFirst({ where: { userId: a.id, title: { contains: 'hidden by a moderator' } } }), 'author is told');
    assert.ok(await db.auditLog.findFirst({ where: { action: 'community.hide', entityId: p1.id } }), 'moderation is audited');
    assert.equal((await mod.api.post(`/api/manage/community/reports/${rep.id}/resolve`, { action: 'DISMISS' })).status, 409, 'already resolved');
    assert.equal((await b.api.put(`/api/community/posts/${p1.id}/like`)).status, 404, 'cannot interact with hidden posts');
    assert.equal((await mod.api.post(`/api/manage/community/restore/post/${p1.id}`)).status, 200);
    assert.equal((await anon.get(`/api/community/posts/${p1.id}`)).status, 200);

    // moderators cannot resolve their own reports or moderate their own content
    const mp = (await mod.api.post('/api/community/posts', post({ title: `${PREFIX} mod post` }))).body.data.post;
    await c.api.post('/api/community/reports', { targetType: 'POST', targetId: mp.id, reason: 'OTHER' });
    const mrep = (await mod.api.get('/api/manage/community/reports')).body.data.reports.find((x) => x.targetId === mp.id);
    assert.equal((await mod.api.post(`/api/manage/community/reports/${mrep.id}/resolve`, { action: 'REMOVE', note: 'self' })).status, 403, 'no self-moderation');
    assert.equal((await mod2.api.post(`/api/manage/community/reports/${mrep.id}/resolve`, { action: 'DISMISS' })).status, 200);
    await mod.api.post('/api/community/reports', { targetType: 'COMMENT', targetId: c1.id, reason: 'HARASSMENT' });
    const crep = (await mod2.api.get('/api/manage/community/reports')).body.data.reports.find((x) => x.targetId === c1.id);
    assert.equal((await mod.api.post(`/api/manage/community/reports/${crep.id}/resolve`, { action: 'REMOVE', note: 'filed by me' })).status, 403, 'cannot resolve a report you filed');
    assert.equal((await mod2.api.post(`/api/manage/community/reports/${crep.id}/resolve`, { action: 'REMOVE', note: 'Abusive comment' })).status, 200);
    assert.equal((await anon.get(`/api/community/posts/${p1.id}`)).body.data.comments.length, 1, 'removed comment is gone');

    // ---- Clubs
    r = await a.api.post('/api/community/groups', { name: 'x', description: 'short' });
    assert.equal(r.status, 400);
    r = await a.api.post('/api/community/groups', { name: `${PREFIX} Robotics`, description: 'Build and race small robots together.', category: 'TECHNOLOGY', joinPolicy: 'REQUEST', verified: true, coverUrl: 'https://example.test/x.jpg' });
    assert.equal(r.status, 201);
    const club = r.body.data.group;
    assert.equal(club.verified, false, 'a student cannot mark a club as official');
    assert.equal(club.coverUrl, null, 'students cannot set cover images');
    assert.equal((await b.api.post('/api/community/groups', { name: `${PREFIX} robotics`, description: 'Duplicate name check.' })).body.error.details.name.includes('exists'), true);
    assert.equal((await a.api.patch(`/api/community/groups/${club.id}`, { contactLink: 'http://insecure.test' })).status, 400, 'https links only');
    assert.equal((await b.api.patch(`/api/community/groups/${club.id}`, { description: 'Taking over this group now.' })).status, 403);
    assert.equal((await anon.get(`/api/community/groups?q=${PREFIX}`)).body.data.groups.length, 1);

    // membership request workflow
    assert.equal((await anon.post(`/api/community/groups/${club.id}/join`, {})).status, 401);
    r = await b.api.post(`/api/community/groups/${club.id}/join`, { message: 'I love robots' });
    assert.equal(r.body.data.status, 'PENDING');
    assert.equal((await b.api.post(`/api/community/groups/${club.id}/join`, {})).status, 409, 'no duplicate requests');
    assert.ok(await db.notification.findFirst({ where: { userId: a.id, title: { contains: 'asked to join' } } }), 'managers are notified');
    assert.equal((await b.api.get(`/api/community/groups/${club.id}/requests`)).status, 403);
    assert.equal((await a.api.get(`/api/community/groups/${club.id}/requests`)).body.data.requests.length, 1);
    assert.equal((await b.api.post(`/api/community/groups/${club.id}/requests/${b.id}`, { decision: 'approve' })).status, 403, 'cannot approve yourself');
    assert.equal((await a.api.post(`/api/community/groups/${club.id}/requests/${b.id}`, { decision: 'maybe' })).status, 400);
    assert.equal((await a.api.post(`/api/community/groups/${club.id}/requests/${b.id}`, { decision: 'approve' })).status, 200);
    assert.ok(await db.notification.findFirst({ where: { userId: b.id, title: { contains: 'accepted into' } } }), 'requester is told');
    assert.equal((await b.api.get(`/api/community/groups/${club.id}`)).body.data.group.myMembership.status, 'ACTIVE');
    assert.equal((await anon.get(`/api/community/groups/${club.id}`)).body.data.group.members, null, 'member list is private');

    // club discussion and announcements
    assert.equal((await c.api.post('/api/community/posts', post({ clubId: club.id }))).status, 403, 'non-members cannot post in a group');
    assert.equal((await b.api.post('/api/community/posts', post({ clubId: club.id, isAnnouncement: true }))).status, 403, 'only managers announce');
    assert.equal((await a.api.post('/api/community/posts', post({ title: `${PREFIX} Meeting Friday`, clubId: club.id, isAnnouncement: true }))).status, 201);
    assert.ok(await db.notification.findFirst({ where: { userId: b.id, title: { contains: 'Meeting Friday' } } }), 'members get announcements');
    assert.equal((await anon.get(`/api/community/posts?clubId=${club.id}`)).body.data.total, 1);

    // leaving, last manager, removal, roles
    assert.equal((await a.api.del(`/api/community/groups/${club.id}/join`)).status, 409, 'the only manager cannot leave');
    assert.equal((await a.api.put(`/api/community/groups/${club.id}/members/${b.id}/role`, { role: 'MANAGER' })).status, 200);
    assert.equal((await a.api.del(`/api/community/groups/${club.id}/join`)).status, 200, 'can leave once another manager exists');
    assert.equal((await b.api.del(`/api/community/groups/${club.id}/members/${b.id}`)).status, 400);
    assert.equal((await b.api.get(`/api/community/groups/${club.id}`)).body.data.group.members.length, 1);

    // ---- Project groups are members-only
    r = await a.api.post('/api/community/groups', { name: `${PREFIX} Capstone`, kind: 'PROJECT_GROUP', description: 'Final-year project team workspace.', joinPolicy: 'OPEN' });
    const pg = r.body.data.group;
    assert.equal((await a.api.post('/api/community/posts', post({ title: `${PREFIX} private plan`, clubId: pg.id }))).status, 201);
    assert.equal((await c.api.get(`/api/community/posts?clubId=${pg.id}`)).status, 403, 'outsiders cannot read a project group');
    assert.equal((await anon.get(`/api/community/posts?q=${PREFIX} private`)).body.data.total, 0, 'project-group posts stay out of the public feed');
    assert.equal((await c.api.post(`/api/community/groups/${pg.id}/join`, {})).body.data.status, 'ACTIVE', 'open groups admit immediately');
    assert.equal((await c.api.get(`/api/community/posts?clubId=${pg.id}`)).body.data.total, 1);
    assert.equal((await a.api.del(`/api/community/groups/${pg.id}/members/${c.id}`)).status, 200);
    assert.equal((await c.api.get(`/api/community/posts?clubId=${pg.id}`)).status, 403, 'removed members lose access');

    // ---- Administrators verify and archive groups
    assert.equal((await mod.api.patch(`/api/community/groups/${club.id}`, { verified: true, coverUrl: 'https://example.test/cover.jpg' })).body.data.group.verified, true);
    assert.ok(await db.auditLog.findFirst({ where: { action: 'club.verify', entityId: club.id } }));
    assert.equal((await b.api.post(`/api/community/groups/${club.id}/archive`)).status, 200);
    assert.equal((await anon.get(`/api/community/groups?q=${PREFIX} Robotics`)).body.data.groups.length, 0, 'archived groups leave the directory');

    // ---- Deleting your own post and cleanup of dependants
    assert.equal((await b.api.del(`/api/community/posts/${p2.id}`)).status, 200);
    assert.equal(await db.communityPost.count({ where: { id: p2.id } }), 0);
    console.log('Community tests passed');
  } catch (e) {
    failed = true;
    console.error(e);
  } finally {
    await db.club.deleteMany({ where: { name: { startsWith: PREFIX } } });
    await db.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
    await db.$disconnect();
    server.close();
    if (failed) process.exitCode = 1;
  }
})();
