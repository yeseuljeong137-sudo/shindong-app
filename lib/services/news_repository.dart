import 'api_client.dart';

/// 동아리 소식 피드 (백엔드 /api/clubs/:clubId/news ...)
/// 화면(ClubNewsScreen)이 Map 형태를 그대로 쓰기 때문에 Map으로 돌려줌
/// { newsId, clubId, clubName, isPinned, timeAgo, image: [], content, likes, isLiked, shareUrl,
///   comments: [{ commentId, user, time, text, likes, isLiked, isMine }] }
class NewsRepository {
  NewsRepository._();
  static final NewsRepository instance = NewsRepository._();

  final ApiClient _api = ApiClient.instance;

  Future<List<Map<String, dynamic>>> fetchClubNews(int clubId) async {
    return asJsonList(await _api.get('/api/clubs/$clubId/news'));
  }

  Future<Map<String, dynamic>> createNews(
    int clubId, {
    required String content,
    required List<String> images,
  }) async {
    return asJsonMap(
      await _api.post(
        '/api/clubs/$clubId/news',
        body: {'content': content, 'images': images},
      ),
    );
  }

  Future<Map<String, dynamic>> togglePin(int clubId, int newsId) async {
    return asJsonMap(await _api.post('/api/clubs/$clubId/news/$newsId/pin'));
  }

  Future<void> deleteNews(int clubId, int newsId) async {
    await _api.delete('/api/clubs/$clubId/news/$newsId');
  }

  Future<Map<String, dynamic>> toggleLike(int clubId, int newsId) async {
    return asJsonMap(await _api.post('/api/clubs/$clubId/news/$newsId/like'));
  }

  Future<Map<String, dynamic>> addComment(
    int clubId,
    int newsId,
    String text,
  ) async {
    return asJsonMap(
      await _api.post(
        '/api/clubs/$clubId/news/$newsId/comments',
        body: {'text': text},
      ),
    );
  }

  Future<Map<String, dynamic>> deleteComment(
    int clubId,
    int newsId,
    int commentId,
  ) async {
    return asJsonMap(
      await _api.delete('/api/clubs/$clubId/news/$newsId/comments/$commentId'),
    );
  }

  Future<Map<String, dynamic>> toggleCommentLike(
    int clubId,
    int newsId,
    int commentId,
  ) async {
    return asJsonMap(
      await _api.post(
        '/api/clubs/$clubId/news/$newsId/comments/$commentId/like',
      ),
    );
  }
}
