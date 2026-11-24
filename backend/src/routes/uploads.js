// 사진 / 첨부파일 업로드
// POST /api/uploads  (multipart/form-data, 필드 이름 "files", 최대 10개, 파일당 10MB)
// 응답: [{ fileName, fileUrl, fileSizeBytes, mimeType, type }]  → 게시글 attachments / 소식 images 에 그대로 사용
// fileUrl은 "/uploads/파일명" 형태(상대 경로)라서 앱에서는 서버 주소를 앞에 붙여서 Image.network로 보여주면 됨
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { HttpError } = require('../lib/http');
const { requireAuth } = require('../middleware/auth');

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED = /^(image\/(png|jpe?g|gif|webp|heic)|application\/pdf|application\/zip|text\/plain|application\/(msword|vnd\.openxmlformats-officedocument\..+|vnd\.ms-.+|haansofthwp|x-hwp))$/;

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase().slice(0, 10);
      cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024, files: 10 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED.test(file.mimetype)) cb(null, true);
    else cb(new HttpError(400, `업로드할 수 없는 파일 형식입니다: ${file.mimetype}`));
  },
});

const router = express.Router();

router.post('/', requireAuth, upload.array('files', 10), (req, res) => {
  if (!req.files?.length) throw new HttpError(400, '"files" 필드로 파일을 보내 주세요.');
  res.status(201).json(
    req.files.map((f) => ({
      // multer는 한글 파일명을 latin1로 읽어서 깨지므로 utf8로 되돌림
      fileName: Buffer.from(f.originalname, 'latin1').toString('utf8'),
      fileUrl: `/uploads/${f.filename}`,
      fileSizeBytes: f.size,
      mimeType: f.mimetype,
      type: f.mimetype.startsWith('image/') ? 'image' : 'file',
    })),
  );
});

module.exports = { router, UPLOAD_DIR };
