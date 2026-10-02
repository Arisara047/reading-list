const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const statuses = ['want-to-read', 'reading', 'finished'];

// A separate file can be injected for tests, so tests never change real books.
function createApp(dataFile = path.join(__dirname, '../data/books.json')) {
  const app = express();
  fs.mkdirSync(path.dirname(dataFile), { recursive: true });
  if (!fs.existsSync(dataFile)) fs.writeFileSync(dataFile, '[]');
  const read = () => JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  const save = books => {
    // Atomic replacement for this single-process classroom application.
    fs.writeFileSync(dataFile + '.tmp', JSON.stringify(books, null, 2));
    fs.renameSync(dataFile + '.tmp', dataFile);
  };
  app.use((req, res, next) => {
    res.on('finish', () => console.log(`${req.method} ${req.originalUrl} ${res.statusCode}`));
    next();
  });
  app.use(express.json({ limit: '32kb' }));
  function validate(body, partial = false) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return 'ข้อมูลต้องอยู่ในรูปแบบ JSON object';
    const keys = Object.keys(body);
    if (!keys.length) return 'กรุณาส่งข้อมูลอย่างน้อยหนึ่งช่อง';
    if (keys.some(k => !['title', 'author', 'status', 'notes'].includes(k))) return 'พบช่องข้อมูลที่ระบบไม่รองรับ';
    for (const [key, max] of [['title', 120], ['author', 80]]) {
      if ((!partial || key in body) && (typeof body[key] !== 'string' || !body[key].trim() || body[key].trim().length > max))
        return `กรุณากรอก${key === 'title' ? 'ชื่อหนังสือ' : 'ชื่อผู้แต่ง'} ความยาว 1–${max} ตัวอักษร`;
    }
    if ('status' in body && !statuses.includes(body.status)) return 'สถานะการอ่านไม่ถูกต้อง';
    if ('notes' in body && (typeof body.notes !== 'string' || body.notes.length > 1000)) return 'บันทึกย่อต้องเป็นข้อความไม่เกิน 1,000 ตัวอักษร';
    return null;
  }
  const clean = b => Object.fromEntries(Object.entries(b).map(([k,v]) => [k, v.trim()]));
  app.get('/api/books', (req, res) => {
    if (req.query.status !== undefined && !statuses.includes(req.query.status))
      return res.status(400).json({ error: 'สถานะที่ใช้กรองไม่ถูกต้อง' });
    const books = read();
    res.json(req.query.status ? books.filter(b => b.status === req.query.status) : books);
  });
  app.get('/api/books/:id', (req, res) => {
    const book = read().find(b => b.id === req.params.id);
    if (!book) return res.status(404).json({ error: 'ไม่พบหนังสือเล่มนี้' });
    res.json(book);
  });
  app.post('/api/books', (req, res) => {
    const error = validate(req.body);
    if (error) return res.status(400).json({ error });
    const book = { id: randomUUID(), status: 'want-to-read', notes: '', ...clean(req.body) };
    const books = read(); books.push(book); save(books);
    res.location(`/api/books/${book.id}`).status(201).json(book);
  });
  app.patch('/api/books/:id', (req, res) => {
    const books = read(); const i = books.findIndex(b => b.id === req.params.id);
    if (i < 0) return res.status(404).json({ error: 'ไม่พบหนังสือเล่มนี้' });
    const error = validate(req.body, true);
    if (error) return res.status(400).json({ error });
    books[i] = { ...books[i], ...clean(req.body) }; save(books);
    res.json(books[i]);
  });
  app.delete('/api/books/:id', (req, res) => {
    const books = read(); const i = books.findIndex(b => b.id === req.params.id);
    if (i < 0) return res.status(404).json({ error: 'ไม่พบหนังสือเล่มนี้' });
    books.splice(i, 1); save(books); res.status(204).end();
  });
  app.use('/api', (req, res) => res.status(404).json({ error: 'ไม่พบเส้นทาง API ที่เรียกใช้' }));
  app.use(express.static(path.join(__dirname, '../public')));
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'รูปแบบ JSON ไม่ถูกต้อง' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'ข้อมูลที่ส่งมีขนาดใหญ่เกินไป' });
    console.error(err); res.status(500).json({ error: 'ไม่สามารถดำเนินการได้ กรุณาลองอีกครั้ง' });
  });
  return app;
}
module.exports = { createApp };
