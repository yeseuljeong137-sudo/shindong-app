require('dotenv').config();
const express = require('express');
const cors = require('cors');

const { HttpError } = require('./lib/http');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const homeRoutes = require('./routes/home');
const clubRoutes = require('./routes/clubs');
const applicationRoutes = require('./routes/applications');
const postRoutes = require('./routes/posts');
const news = require('./routes/news');
const notificationRoutes = require('./routes/notifications');
const clubRequestRoutes = require('./routes/clubRequests');
const surveyRoutes = require('./routes/survey');
const uploads = require('./routes/uploads');
const manageRoutes = require('./routes/manage');

if (!process.env.JWT_SECRET) {
  console.error('❌ .env 파일에 JWT_SECRET 이 없습니다. .env.example 을 복사해서 .env 를 만들어 주세요.');
  process.exit(1);
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// 업로드한 사진/파일 제공: GET /uploads/파일명
app.use('/uploads', express.static(uploads.UPLOAD_DIR));

// 서버가 살아있는지 확인용
app.get('/health', (req, res) => res.json({ ok: true }));

// ───── API ─────
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api', homeRoutes); // /api/banners, /api/faqs
app.use('/api/clubs', clubRoutes);
app.use('/api/clubs/:clubId', postRoutes); // 게시판
app.use('/api/clubs/:clubId', news.router); // 소식 피드
app.use('/api/clubs/:clubId', manageRoutes); // 모집 공고 / 회비 / 장부
app.use('/api/news', news.feedRouter);
app.use('/api', applicationRoutes); // /api/clubs/:clubId/applications, /api/applications/...
app.use('/api/notifications', notificationRoutes);
app.use('/api/club-requests', clubRequestRoutes);
app.use('/api/survey', surveyRoutes);
app.use('/api/uploads', uploads.router);

// 없는 주소
app.use((req, res) => res.status(404).json({ message: `없는 API입니다: ${req.method} ${req.path}` }));

// 에러 처리 — 앱에서는 항상 { message } 로 받으면 됨
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof HttpError) return res.status(err.status).json({ message: err.message });
  if (err.name === 'MulterError') {
    const msg = err.code === 'LIMIT_FILE_SIZE' ? '파일은 10MB까지 올릴 수 있어요.' : `업로드 오류: ${err.message}`;
    return res.status(400).json({ message: msg });
  }
  if (err.type === 'entity.parse.failed') return res.status(400).json({ message: 'JSON 형식이 올바르지 않습니다.' });
  if (err.code === 'P2002') return res.status(409).json({ message: '이미 존재하는 데이터입니다.' });
  if (err.code === 'P2025') return res.status(404).json({ message: '데이터를 찾을 수 없습니다.' });
  console.error(err);
  res.status(500).json({ message: '서버 오류가 발생했습니다.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`서버 실행: http://localhost:${PORT}`));
