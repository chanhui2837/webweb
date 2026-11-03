import { Router } from 'express';
import auth from './auth.js';
import users from './users.js';
import uploads from './uploads.js';
import webtoons from './webtoons.js';
import episodes from './episodes.js';
import editorDocs from './editorDocs.js';
import illustrations from './illustrations.js';
import social from './social.js';
import home from './home.js';
import admin from './admin.js';
import { cookiesRouter, inboxRouter, notificationsRouter } from './cookies.js';

const router = Router();

router.use('/auth', auth);
router.use('/users', users);
router.use('/uploads', uploads);
router.use('/home', home);
router.use('/webtoons', webtoons);
router.use('/episodes', episodes);
router.use('/editor-docs', editorDocs);
router.use('/illustrations', illustrations);
router.use('/cookies', cookiesRouter);
router.use('/inbox', inboxRouter);
router.use('/notifications', notificationsRouter);
router.use('/admin', admin);
router.use('/', social); // /likes, /bookmarks, /comments, /reports

export default router;
