# club-backend

신구대 동아리 앱(Flutter `semi`)의 백엔드예요. Node.js + Express + Prisma로 만들었고, DB는 Supabase(PostgreSQL)를 써요.
`lib/screens/common` 화면들에 하드코딩돼 있던 데이터를 API로 바꿨고, 목업 데이터(동아리 12개, 게시글, 소식, 배너, 알림, 지원 현황)는 seed로 DB에 넣어 둬요.

## 처음 실행 / 새 버전으로 업데이트했을 때

```bash
cd ~/shindong/semi/backend
npm install                              # 새 패키지(multer) 설치
cp .env.example .env                     # .env가 없을 때만. JWT_SECRET 값은 아무 긴 문자열로 변경
npx prisma migrate dev --name app_schema # 새 DB 구조 적용 (데이터가 지워진다고 물어보면 y)
npm run db:seed                          # 초기 데이터 넣기
npm run dev                              # http://localhost:3000/health → {"ok":true}
```

DB를 처음 상태로 되돌리고 싶을 때는 `npm run db:reset`을 실행하면 돼요. 테이블을 다시 만들고 seed까지 자동으로 넣어 줘요.
DB 안을 눈으로 보고 싶으면 `npm run db:studio`를 실행하세요. 브라우저에서 표처럼 볼 수 있어요.

### 테스트 계정
| 계정 | 학번 | 비밀번호 | 설명 |
|---|---|---|---|
| 김신구 | `20241234` | `1234` | HelloWorld 회장, 오프레임 회원. 지원 현황·알림 목업 데이터의 주인 |
| 관리자 | `000000` | `admin1234` | 동아리 개설 요청 승인 |
| 그 외 | 아무 학번 | `1234` | seed로 만든 일반 학생/각 동아리 회장 |

## 폴더 구조
```
prisma/schema.prisma      DB 테이블 정의 (회원, 동아리, 지원, 게시판, 소식, 알림, 배너 ...)
prisma/seed.js            초기 데이터 (seed-data/clubs.json = club_repository.dart 목업)
src/index.js              서버 시작점, 라우터 연결
src/routes/               API (화면별로 파일이 나뉘어 있음)
src/lib/serializers.js    DB → Flutter 모델 JSON 변환 (필드 이름을 여기서 맞춤)
src/middleware/auth.js    로그인(JWT) 검사, 회원/회장 권한 확인
uploads/                  업로드된 사진·파일 (자동 생성)
```

## Flutter에서 연결하는 방법

1. `pubspec.yaml`에 `http`(또는 `dio`), `flutter_secure_storage`를 추가해요.
2. 서버 주소는 실행 환경마다 달라요.
   - iOS 시뮬레이터 / 웹 / macOS: `http://localhost:3000`
   - 안드로이드 에뮬레이터: `http://10.0.2.2:3000`
   - 실제 폰: 맥의 와이파이 IP를 써야 해요(예: `http://192.168.0.12:3000`). 폰과 맥이 같은 와이파이에 있어야 해요.
3. 로그인하면 받은 `token`을 저장해 두고, 이후 요청마다 `Authorization: Bearer <token>` 헤더를 붙이면 돼요.
4. 에러 응답은 항상 `{ "message": "..." }` 형태라서 그대로 스낵바에 띄우면 돼요.
5. 이미지 경로 규칙
   - `assets/...`로 시작하면 seed 데이터예요 → `Image.asset(path)`
   - `/uploads/...`로 시작하면 업로드한 파일이에요 → `Image.network(baseUrl + path)`
6. `ClubRepository` / `BoardRepository`의 `Future.delayed` 목업 부분을 아래 API 호출로 바꾸면 돼요. 응답 JSON은 각 모델의 `fromJson`과 키 이름이 같아요(`ClubModel`은 `club_id`, `BoardPostModel`은 `postId` 등).

예시 (`ClubRepository.fetchClubs`):
```dart
Future<ClubList> fetchClubs() async {
  final res = await http.get(Uri.parse('$baseUrl/api/clubs'));
  final list = jsonDecode(res.body) as List;
  return list.map((e) => ClubModel.fromJson(e)).toList();
}
```

## API 목록

🔓 로그인 없이 가능 · 🔑 로그인 필요 · 👑 동아리 회장 · 🛡 앱 관리자

### 로그인 / 마이 페이지 (login_screen, my_page_screen)
| | 메서드 | 경로 | 설명 |
|---|---|---|---|
| 🔓 | POST | `/api/auth/register` | `{ stId, password, name, department }` → `{ token, user }` |
| 🔓 | POST | `/api/auth/login` | `{ stId, password }` → `{ token, user }` |
| 🔑 | GET | `/api/auth/me` | 토큰 확인(자동 로그인) |
| 🔑 | GET | `/api/users/me` | 이름·학과·학번, 내 동아리 수/요약, 지원 현황 건수 |
| 🔑 | PATCH | `/api/users/me` | `{ name?, department?, profileImg? }` |

### 홈 / FAQ (home_screen, banner_detail_screen, faq_screen)
| | 메서드 | 경로 | 설명 |
|---|---|---|---|
| 🔓 | GET | `/api/banners` | 홈 배너 (`_bannerData`와 같은 키) |
| 🔓 | GET | `/api/banners/:id` | 배너 상세 |
| 🔓 | GET | `/api/faqs` | 앱 FAQ |

### 동아리 (explore_screen, club_detail_screen, my_clubs_screen, board_screen)
| | 메서드 | 경로 | 설명 |
|---|---|---|---|
| 🔓 | GET | `/api/clubs?category=학술&q=검색어` | 동아리 목록 → `ClubModel[]` |
| 🔓 | GET | `/api/clubs/:clubId` | 상세 + `faqs`, `news_images`, (로그인 시) `is_joined`, `my_role`, `has_applied` |
| 🔑 | GET | `/api/clubs/me/joined` | 내 동아리 (`MyClubsScreen.joinedClubs`와 같은 키 + `role`) |
| 🔓 | GET | `/api/clubs/boards/summaries?scope=all\|mine` | 게시판 탭 → `BoardSummaryModel[]` |
| 🔑 | DELETE | `/api/clubs/:clubId/membership` | 탈퇴 `{ reason }` |
| 👑 | PATCH | `/api/clubs/:clubId` | 소개·모임시간·장소·모집 여부/마감일·활동 수정 |
| 👑 | PUT | `/api/clubs/:clubId/faqs` | 동아리 FAQ 전체 교체 `{ faqs: [{question, answer}] }` |
| 👑 | GET | `/api/clubs/:clubId/members` | 회원 목록 |
| 👑 | PATCH | `/api/clubs/:clubId/members/:userId` | 역할 변경 `{ role: "PRESIDENT" \| "MEMBER" }` |

### 지원 (club_apply_screen, application_status_screen)
| | 메서드 | 경로 | 설명 |
|---|---|---|---|
| 🔑 | POST | `/api/clubs/:clubId/applications` | `{ motive, interests[], tools, experience, preparation }` |
| 🔑 | GET | `/api/applications/me` | `{ inProgress: [...], history: [...] }` (화면 Map과 같은 키: `statusText`, `steps`, `currentStep`, `result` ...) |
| 🔑 | GET | `/api/applications/:id` | 지원서 내용 (본인 또는 회장) |
| 🔑 | PATCH | `/api/applications/:id/cancel` | 지원 취소 |
| 👑 | GET | `/api/clubs/:clubId/applications?status=SUBMITTED` | 지원자 목록 |
| 👑 | PATCH | `/api/applications/:id/status` | `{ status: INTERVIEW\|ACCEPTED\|REJECTED, noticeTitle?, noticeDetail? }`. 합격하면 자동으로 회원 등록되고 지원자에게 알림이 가요 |

### 동아리 게시판 (club_board_screen, club_post_detail_screen, club_post_write_screen)
| | 메서드 | 경로 | 설명 |
|---|---|---|---|
| 🔓 | GET | `/api/clubs/:clubId/posts?category=자유게시판&q=` | 목록 (고정글 먼저) → `BoardPostModel[]` |
| 🔓 | GET | `/api/clubs/:clubId/posts/:postId` | 상세 (조회수 +1) |
| 🔑 | POST | `/api/clubs/:clubId/posts` | `CreatePostRequestDto` + `isAnonymous`. 공지사항/고정은 👑만 가능 |
| 🔑 | PATCH | `/api/clubs/:clubId/posts/:postId` | 수정 (작성자) |
| 🔑 | DELETE | `/api/clubs/:clubId/posts/:postId` | 삭제 (작성자 또는 👑) |
| 🔑 | POST | `/api/clubs/:clubId/posts/:postId/like` | 좋아요 토글 → 갱신된 게시글 |
| 👑 | POST | `/api/clubs/:clubId/posts/:postId/pin` | 고정 토글 (동아리당 1개) |
| 🔑 | POST | `/api/clubs/:clubId/posts/:postId/comments` | `{ content, isAnonymous }` |
| 🔑 | DELETE | `/api/clubs/:clubId/posts/:postId/comments/:commentId` | 댓글 삭제 |
| 🔑 | POST | `/api/clubs/:clubId/posts/:postId/comments/:commentId/like` | 댓글 좋아요 토글 |
| 🔑 | GET/POST | `/api/clubs/:clubId/post-drafts` | 임시저장 목록 / 저장 |
| 🔑 | DELETE | `/api/clubs/:clubId/post-drafts/:draftId` | 임시저장 삭제 |

### 동아리 소식 피드 (club_news_screen, club_news_write_screen, club_news_drafts_screen)
| | 메서드 | 경로 | 설명 |
|---|---|---|---|
| 🔓 | GET | `/api/news?scope=all\|mine` | 전체 / 내 동아리 소식 모아보기 |
| 🔓 | GET | `/api/clubs/:clubId/news` | 동아리 소식 (`savedNewsList`와 같은 키: `image`, `likes`, `comments[{user,time,text}]`) |
| 👑 | POST | `/api/clubs/:clubId/news` | `{ content, images[] }` |
| 👑 | PATCH / DELETE | `/api/clubs/:clubId/news/:newsId` | 수정 / 삭제 |
| 👑 | POST | `/api/clubs/:clubId/news/:newsId/pin` | 고정 토글 |
| 🔑 | POST | `/api/clubs/:clubId/news/:newsId/like` | 좋아요 토글 |
| 🔑 | POST | `/api/clubs/:clubId/news/:newsId/comments` | `{ text }` |
| 🔑 | DELETE | `/api/clubs/:clubId/news/:newsId/comments/:commentId` | 댓글 삭제 |
| 🔑 | POST | `/api/clubs/:clubId/news/:newsId/comments/:commentId/like` | 댓글 좋아요 |
| 👑 | GET/POST | `/api/clubs/:clubId/news-drafts` | 소식 임시저장 목록 / 저장 |
| 👑 | DELETE | `/api/clubs/:clubId/news-drafts` | 여러 개 삭제 `{ draftIds: [] }` |
| 👑 | DELETE | `/api/clubs/:clubId/news-drafts/:draftId` | 하나 삭제 |

### 알림 (notification_screen, notification_settings_screen)
| | 메서드 | 경로 | 설명 |
|---|---|---|---|
| 🔑 | GET | `/api/notifications?type=지원 상태` | `{ unreadCount, notifications: [{type,time,title,content,timestamp,isRead}] }` |
| 🔑 | PATCH | `/api/notifications/:id/read` · `/api/notifications/read-all` | 읽음 처리 |
| 🔑 | DELETE | `/api/notifications/:id` | 삭제 |
| 🔑 | GET | `/api/notifications/settings` | `[{ key, title, subtitle, enabled }]` |
| 🔑 | PUT | `/api/notifications/settings` | `{ applicationResult, schedule, clubActivity, newFeed, marketing }` 중 바꿀 것만 |

알림은 자동으로 만들어져요: 지원 결과 처리, 새 지원서(회장에게), 공지사항 작성, 새 소식(알림 설정에서 켠 사람만), 내 글에 댓글, 개설 요청 처리.

### 동아리 개설 요청 (club_create_request_screen, submission_complete_screen)
| | 메서드 | 경로 | 설명 |
|---|---|---|---|
| 🔑 | POST | `/api/club-requests` | `{ name, category, etcCategory?, purpose, advisor, leaderInfo }` |
| 🔑 | GET | `/api/club-requests/me` | 내 요청 |
| 🛡 | GET | `/api/club-requests?status=PENDING` | 전체 요청 |
| 🛡 | PATCH | `/api/club-requests/:id` | `{ status: APPROVED\|REJECTED }`. 승인하면 동아리가 생기고 요청자가 회장이 돼요 |

### 추천 설문 (survey_screen)
| | 메서드 | 경로 | 설명 |
|---|---|---|---|
| 🔑 | POST | `/api/survey` | `{ q1[], q2[], q3, q4[], q5 }` (화면의 선택지 문자열 그대로) → `{ recommendations: ClubModel[] + match_score, match_reasons }` |
| 🔑 | GET | `/api/survey/recommendations` | 마지막 설문 기준으로 다시 추천 |

추천은 진짜 AI가 아니라 규칙으로 점수를 매겨요. 관심 분야, 활동 키워드, 초보자 환영 여부, 모임 시간대, 빈도를 비교해요(`src/routes/survey.js`).

### 업로드
| | 메서드 | 경로 | 설명 |
|---|---|---|---|
| 🔑 | POST | `/api/uploads` | multipart, 필드명 `files`(최대 10개, 10MB). 응답 `[{fileName, fileUrl, fileSizeBytes, mimeType, type}]`. 게시글 `attachments`나 소식 `images`에 그대로 넣으면 돼요 |

## 나중에 바꿀 것
- **학교 포털 로그인**: 지금은 앱 자체 계정(학번+비밀번호)이에요. 포털 연동은 `src/routes/auth.js`의 `/login`만 바꾸면 돼요.
- **배포**: DB는 이미 Supabase에 있어서, Express 서버만 Render 같은 곳에 올리면 돼요. 업로드 파일은 서버 디스크 대신 Supabase Storage 같은 저장소로 옮기는 게 좋아요.
- **앱의 회장/회원 UI 전환**(`AppRole.isPresident`): `/api/clubs/:clubId`의 `my_role` 또는 `/api/clubs/me/joined`의 `isPresident`로 바꾸면 돼요.
