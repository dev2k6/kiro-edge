import { Hono } from 'hono';
import { handleChatCompletions, handleMessages } from './chat.controller';

const router = new Hono();

router.post('/chat/completions', handleChatCompletions);
router.post('/messages', handleMessages);

export default router;
