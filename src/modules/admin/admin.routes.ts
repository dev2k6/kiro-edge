import { Hono } from 'hono';
import { getAdminStatus, getSettings, updateSettings, getAccounts, addAccount, deleteAccount } from './admin.controller';
import { AccountPool } from '../account/pool.service';

const router = new Hono();

router.get('/status', (c) => getAdminStatus(c, new AccountPool(c.env as any)));
router.get('/settings', (c) => getSettings(c));
router.post('/settings', (c) => updateSettings(c));

router.get('/accounts', (c) => getAccounts(c, new AccountPool(c.env as any)));
router.post('/accounts', (c) => addAccount(c, new AccountPool(c.env as any)));
router.delete('/accounts/:id', (c) => deleteAccount(c, new AccountPool(c.env as any), c.req.param('id')));

export default router;
