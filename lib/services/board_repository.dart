import '../models/board_post_models.dart';
import 'api_client.dart';

typedef PostList = List<BoardPostModel>;
typedef DraftList = List<BoardPostDraftModel>;

/// 동아리 게시판 데이터 (백엔드 /api/clubs/:clubId/posts ...)
class BoardRepository {
  BoardRepository._();
  static final BoardRepository instance = BoardRepository._();

  final ApiClient _api = ApiClient.instance;

  BoardPostModel _post(dynamic data) => BoardPostModel.fromJson(asJsonMap(data));

  Future<PostList> fetchPosts(
    int clubId, {
    String clubName = '',
    String? category,
  }) async {
    final list = asJsonList(
      await _api.get('/api/clubs/$clubId/posts', query: {'category': category}),
    );
    return list.map(BoardPostModel.fromJson).toList();
  }

  Future<BoardPostModel> fetchPostDetail(int clubId, int postId) async {
    return _post(await _api.get('/api/clubs/$clubId/posts/$postId'));
  }

  /// [authorName] 이 '익명' 이면 익명 글로 올라감 (실제 작성자 이름은 서버가 로그인 정보로 채움)
  Future<BoardPostModel> createPost(
    CreatePostRequestDto dto, {
    required String authorName,
    bool? isAnonymous,
  }) async {
    final body = dto.toJson()
      ..['isAnonymous'] = isAnonymous ?? (authorName == '익명');
    return _post(await _api.post('/api/clubs/${dto.clubId}/posts', body: body));
  }

  Future<BoardPostModel> togglePostLike(int clubId, int postId) async {
    return _post(await _api.post('/api/clubs/$clubId/posts/$postId/like'));
  }

  Future<BoardPostModel> togglePostPin(int clubId, int postId) async {
    return _post(await _api.post('/api/clubs/$clubId/posts/$postId/pin'));
  }

  Future<void> deletePost(int clubId, int postId) async {
    await _api.delete('/api/clubs/$clubId/posts/$postId');
  }

  Future<BoardPostModel> addComment(
    int clubId,
    int postId, {
    String authorName = '',
    required String content,
    bool isAnonymous = false,
  }) async {
    return _post(
      await _api.post(
        '/api/clubs/$clubId/posts/$postId/comments',
        body: {'content': content, 'isAnonymous': isAnonymous},
      ),
    );
  }

  Future<BoardPostModel> deleteComment(int clubId, int postId, int commentId) async {
    return _post(
      await _api.delete('/api/clubs/$clubId/posts/$postId/comments/$commentId'),
    );
  }

  Future<BoardPostModel> toggleCommentLike(
    int clubId,
    int postId,
    int commentId,
  ) async {
    return _post(
      await _api.post(
        '/api/clubs/$clubId/posts/$postId/comments/$commentId/like',
      ),
    );
  }

  // ───── 임시저장 (서버에 저장되므로 다른 기기에서도 보임) ─────

  Future<DraftList> getDrafts(int clubId) async {
    final list = asJsonList(await _api.get('/api/clubs/$clubId/post-drafts'));
    return list.map(BoardPostDraftModel.fromJson).toList();
  }

  Future<BoardPostDraftModel> saveDraft({
    required int clubId,
    String? boardCategory,
    required String title,
    required String content,
    required List<String> tags,
    required List<BoardAttachmentModel> attachments,
    required bool isPinned,
  }) async {
    final data = await _api.post(
      '/api/clubs/$clubId/post-drafts',
      body: {
        'boardCategory': boardCategory,
        'title': title,
        'content': content,
        'tags': tags,
        'attachments': attachments.map((e) => e.toJson()).toList(),
        'isPinned': isPinned,
      },
    );
    return BoardPostDraftModel.fromJson(asJsonMap(data));
  }

  Future<void> deleteDraft(int clubId, int draftId) async {
    await _api.delete('/api/clubs/$clubId/post-drafts/$draftId');
  }
}
