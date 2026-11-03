const fs = require('fs');
const path = require('path');

// تحميل إعدادات .env دون تثبيت أي مكتبة
const envFile = path.join(__dirname, '.env');

if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || line.trim().startsWith('#')) continue;

    let value = match[2];
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (process.env[match[1]] === undefined) {
      process.env[match[1]] = value;
    }
  }
}

const express = require('express');
const app = express();
const PORT = Number(process.env.PORT || 3000);

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'www')));

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    app: 'ATLAS CLIMATE AI',
    aiConfigured: !!(
      process.env.AI_API_KEY &&
      process.env.AI_API_KEY !== 'YOUR_API_KEY'
    )
  });
});

app.post('/api/chat', async (req, res) => {
  const key = process.env.AI_API_KEY;

  if (!key || key === 'YOUR_API_KEY') {
    return res.status(503).json({
      error: 'المساعد الذكي غير مفعّل. أضف مفتاح API في ملف .env.'
    });
  }

  const body = req.body || {};
  const messages = body.messages;
  const place = String(body.place || 'العالم').slice(0, 150);

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'الرسالة فارغة.' });
  }

  const cleanMessages = messages.slice(-12).map(m => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: String(m.content || '').slice(0, 4000)
  })).filter(m => m.content.trim());

  if (!cleanMessages.length) {
    return res.status(400).json({ error: 'لا توجد رسالة صالحة.' });
  }

  const base = (
    process.env.AI_BASE_URL || 'https://api.openai.com/v1'
  ).replace(/\/+$/, '');

  const system = `
أنت ATLAS CLIMATE AI.
تخصصك الطقس والمناخ والجغرافيا والثقافة العامة.
أجب بالعربية الواضحة أو الدارجة المغربية حسب لغة المستخدم.
لا تخترع بيانات الطقس الحية أو الأخبار.
إذا لم تتوفر بيانات مباشرة فصرّح بذلك.
المنطقة المحددة: ${place}
`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(base + '/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: process.env.AI_MODEL || 'gpt-4o-mini',
        temperature: 0.4,
        messages: [
          { role: 'system', content: system },
          ...cleanMessages
        ]
      })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error('AI provider error:', response.status);
      return res.status(502).json({
        error: 'خدمة الذكاء الاصطناعي لم تستجب بشكل صحيح. تحقق من إعدادات المزود.'
      });
    }

    const reply = data.choices?.[0]?.message?.content;

    if (typeof reply !== 'string' || !reply.trim()) {
      return res.status(502).json({ error: 'لم يصل رد مفهوم.' });
    }

    res.json({ reply });
  } catch (error) {
    console.error('AI request failed:', error.name);
    res.status(502).json({
      error: error.name === 'AbortError'
        ? 'انتهت مهلة الاتصال. حاول مجدداً.'
        : 'تعذر الاتصال بخدمة الذكاء الاصطناعي.'
    });
  } finally {
    clearTimeout(timeout);
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`ATLAS CLIMATE AI running on port ${PORT}`);
});
