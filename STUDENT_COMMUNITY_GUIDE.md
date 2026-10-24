# Student Community guide

Pages: `/community` (feed), `/community/posts/:id`, `/community/groups` (directory), `/community/groups/:id`, `/admin/moderation` (moderators).
Code: `backend/src/controllers/community.js`, `routes/community.js`, `frontend/js/community-ui.js`, `frontend/js/pages/{community,community-post,groups,group-detail,admin-moderation}.js`.
Tests: `backend/test/community.test.js` (112 assertion lines against the real database).

## What works

- **Feed:** posts by topic (Academics, Projects, Technology, Campus life, Clubs, Careers, General), search, sort by recent or popular, "Load more", Saved and My posts tabs. Trending topics are real post counts for the last 30 days. Nothing is simulated: an empty community shows empty states.
- **Posts and comments:** create, edit and delete your own posts; comments with one level of replies; edit and delete your own comments; like/unlike and save/unsave (duplicates are impossible, enforced by the primary key).
- **Clubs and project groups (one model, `Club.kind`):** directory with search and category filters, join (open groups) or request to join (managers approve or decline), leave or withdraw, member list (members only), role changes, removal, edit, archive. A creator becomes the first manager. A group needs at least one manager.
- **Group discussion:** club discussion is public. Project-group discussion and member lists are visible to active members and moderators only, and its posts never appear in the public feed. Managers can publish announcements that notify every active member.
- **Verification:** new groups are shown as "Not verified". Only users with `content:manage` (campus and super administrators) can set `verified` or a cover image, and verification is audited.
- **Safety:** report a post or comment with a reason (one report per user per item, never your own content); moderators hide, remove or dismiss with a note, and can restore hidden content. Every moderation action writes an audit log entry and notifies the author. A moderator cannot resolve a report they filed or moderate their own content.
- **Notifications (from real actions only):** comment on your post, reply to your comment, membership request (to managers), membership decision, removal from a group, group announcement, moderation outcome.
- **Anti-spam:** writes are limited per user per minute (`COMMUNITY_RATE_LIMIT_MAX`, default 30). Text is length-limited and control characters are stripped; the UI escapes all output.

## Roles

| Capability | Student / any signed-in user | Group manager | Moderator (`community:moderate`) | Admin (`content:manage`) |
| --- | --- | --- | --- | --- |
| Read feed, public clubs | yes (also anonymous) | yes | yes | yes |
| Post, comment, like, save, report | yes | yes | yes | yes |
| Edit/delete own content | yes | yes | no override (uses moderation tools) | no override |
| Create a group | yes | | | |
| Approve requests, remove members, edit/archive group, announce | | own group | | any group |
| Hide/remove/restore content, resolve reports | | | yes | yes |
| Mark a group verified, set cover image | | | | yes |

`community:moderate` is held by Campus Admin and Super Admin. It was added to the existing permission map; no second authorization model exists.

## API (all under `/api`, JSON envelope)

`GET /community/posts` (`q`, `topic`, `sort`, `clubId`, `saved=1`, `mine=1`, `page`, `pageSize`), `GET /community/trending`, `GET|PATCH|DELETE /community/posts/:id`, `POST /community/posts`,
`PUT|DELETE /community/posts/:id/{like,bookmark}`, `POST /community/posts/:id/comments`, `PATCH|DELETE /community/comments/:id`, `POST /community/reports`,
`GET|POST /community/groups`, `GET|PATCH /community/groups/:id`, `POST /community/groups/:id/archive`, `POST|DELETE /community/groups/:id/join`, `GET /community/groups/:id/requests`,
`POST /community/groups/:id/requests/:userId`, `DELETE /community/groups/:id/members/:userId`, `PUT /community/groups/:id/members/:userId/role`,
`GET /manage/community/reports`, `POST /manage/community/reports/:id/resolve`, `POST /manage/community/restore/:type/:id`.

## Database (migration `20261025000000_community`)

`Club`, `ClubMember`, `CommunityPost`, `CommunityComment`, `PostLike`, `PostBookmark`, `ContentReport`, enums `PostTopic`, `ContentStatus`, `GroupKind`, `JoinPolicy`, `GroupStatus`, `MemberRole`, `MemberStatus`, `ReportTarget`, `ReportReason`, `ReportStatus`; `NotificationType` gained `COMMUNITY`.
Indexes cover feed ordering, per-club posts, topics and the report queue.

## Not implemented (and why)

- **Image attachments on posts, club logos uploaded by students:** there is no secure upload pipeline. Only administrators can set an https cover image URL.
- **Block/mute users, community guidelines acceptance:** not built. Guidelines are shown in the composer, report dialog and sidebar.
- **Events inside the community (RSVP, add to calendar, reminders):** not connected. The existing Events module is unchanged; clubs do not yet publish events.
- **Project-group shared notes/resources:** discussion threads only.
- **Real-time chat:** none. Discussion is persistent threads.
- **Official clubs:** none are seeded. No club, membership count or discussion is invented.
