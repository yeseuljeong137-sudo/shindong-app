import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../config/app_role.dart';
import '../../services/news_repository.dart';
import '../../widgets/api_error.dart';
import 'club_news_photo_picker_screen.dart';

class ClubNewsScreen extends StatefulWidget {
  final int clubId;
  final String clubName;
  final String clubLogo;
  final bool? isPresident;

  // AppRole.isPresident와 동기화
  static bool get isPresidentMode => AppRole.isPresident;
  static set isPresidentMode(bool value) => AppRole.isPresident = value;

  const ClubNewsScreen({
    super.key,
    required this.clubId,
    required this.clubName,
    this.clubLogo = 'assets/images/logo-dforce.png',
    this.isPresident,
  });

  bool get effectiveIsPresident => isPresident ?? AppRole.isPresidentOf(clubId);

  // 서버에서 받아온 소식 캐시 (동아리 상세 화면 그리드와 공유)
  static final List savedNewsList = [];

  /// 서버에서 이 동아리의 소식을 다시 받아와 savedNewsList를 갱신
  static Future<void> loadClubNews(int clubId, String clubName) async {
    final list = await NewsRepository.instance.fetchClubNews(clubId);
    savedNewsList.removeWhere((post) {
      final map = post as Map;
      return map['clubId'] == clubId || map['clubName'] == clubName;
    });
    for (final item in list) {
      item['clubName'] = clubName; // 화면에서 쓰는 이름과 맞춤
      savedNewsList.add(item);
    }
  }

  static List getPostsForClub(String clubName) {
    final posts = savedNewsList
        .where((post) => (post as Map)['clubName'] == clubName)
        .toList();

    posts.sort((a, b) {
      final bool aPinned = (a as Map)['isPinned'] == true;
      final bool bPinned = (b as Map)['isPinned'] == true;
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;
      return 0;
    });

    return posts;
  }

  // 예전 목업용 함수 (이제 데이터는 서버에서 옴). 호출하는 곳 호환용으로 남겨둠
  static void ensureClubInitialized(String clubName, List? seedImages) {}

  @override
  State createState() => _ClubNewsScreenState();
}

class _ClubNewsScreenState extends State {
  bool _isLoading = true;

  ClubNewsScreen get _screen => widget as ClubNewsScreen;

  @override
  void initState() {
    super.initState();
    _reload();
  }

  Future<void> _reload() async {
    try {
      await ClubNewsScreen.loadClubNews(_screen.clubId, _screen.clubName);
    } catch (e) {
      if (mounted) showApiError(context, e);
    }
    if (mounted) setState(() => _isLoading = false);
  }

  /// 서버가 돌려준 최신 데이터로 화면의 Map을 그대로 교체 (참조 유지)
  void _applyUpdated(Map post, Map<String, dynamic> updated) {
    updated['clubName'] = _screen.clubName;
    post
      ..clear()
      ..addAll(updated);
  }

  Future _navigateAndAddNewPost() async {
    final screenWidget = widget as ClubNewsScreen;

    final result = await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (context) => ClubNewsPhotoPickerScreen(
          clubName: screenWidget.clubName,
          clubLogo: screenWidget.clubLogo,
        ),
      ),
    );

    if (result != null && result is Map) {
      try {
        final images = (result['image'] is List)
            ? (result['image'] as List).map((e) => e.toString()).toList()
            : <String>[];
        await NewsRepository.instance.createNews(
          screenWidget.clubId,
          content: result['content']?.toString() ?? '',
          images: images,
        );
        await _reload();
      } catch (e) {
        if (mounted) showApiError(context, e);
      }
    }
  }

  void _showPinConfirmDialog(Map post) {
    final bool currentlyPinned = post['isPinned'] == true;
    final screenWidget = widget as ClubNewsScreen;

    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(
          currentlyPinned ? '게시물을 메인에서 내릴까요?' : '게시물을 메인에 올릴까요?',
          style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18.0),
        ),
        content: Text(
          currentlyPinned
              ? '더 이상 동아리 소식 상단에 자동으로 나타나지 않습니다.'
              : '동아리 소식 상단에 고정되며, 기존에 고정되어 있던 메인 게시물은 해제됩니다.',
        ),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16.0),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('취소', style: TextStyle(color: Color(0xFF9E9E9E))),
          ),
          TextButton(
            onPressed: () async {
              Navigator.pop(context);
              try {
                await NewsRepository.instance.togglePin(
                  screenWidget.clubId,
                  post['newsId'] as int,
                );
                await _reload(); // 다른 고정글 해제까지 반영
              } catch (e) {
                if (mounted) showApiError(this.context, e);
                return;
              }
              if (!mounted) return;
              ScaffoldMessenger.of(this.context).showSnackBar(
                SnackBar(
                  content: Text(
                    currentlyPinned ? '게시물이 메인에서 내려갔습니다.' : '게시물이 메인에 올라왔습니다.',
                  ),
                  duration: const Duration(seconds: 1),
                ),
              );
            },
            child: Text(
              currentlyPinned ? '메인에서 내리기' : '메인에 올리기',
              style: const TextStyle(
                color: Color(0xFF8CC63F),
                fontWeight: FontWeight.bold,
              ),
            ),
          ),
        ],
      ),
    );
  }

  void _showDeleteConfirmDialog(Map post) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text(
          '게시물 삭제',
          style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18.0),
        ),
        content: const Text('정말로 이 게시물을 삭제하시겠습니까?\n삭제된 게시물은 복구할 수 없습니다.'),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16.0),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('취소', style: TextStyle(color: Color(0xFF9E9E9E))),
          ),
          TextButton(
            onPressed: () async {
              Navigator.pop(context);
              try {
                await NewsRepository.instance.deleteNews(
                  _screen.clubId,
                  post['newsId'] as int,
                );
              } catch (e) {
                if (mounted) showApiError(this.context, e);
                return;
              }
              if (!mounted) return;
              setState(() {
                ClubNewsScreen.savedNewsList.remove(post);
              });
              ScaffoldMessenger.of(this.context).showSnackBar(
                const SnackBar(
                  content: Text('게시물이 삭제되었습니다.'),
                  duration: Duration(seconds: 1),
                ),
              );
            },
            child: const Text(
              '삭제',
              style: TextStyle(color: Colors.red, fontWeight: FontWeight.bold),
            ),
          ),
        ],
      ),
    );
  }

  void _showCommentDeleteDialog({
    required Map post,
    required BuildContext sheetContext,
    required List comments,
    required int index,
    required StateSetter setModalState,
  }) {
    showDialog(
      context: sheetContext,
      builder: (dialogContext) => AlertDialog(
        title: const Text(
          '댓글 삭제',
          style: TextStyle(fontWeight: FontWeight.bold, fontSize: 17.0),
        ),
        content: const Text('이 댓글을 삭제하시겠습니까?'),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16.0),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('취소', style: TextStyle(color: Color(0xFF9E9E9E))),
          ),
          TextButton(
            onPressed: () async {
              Navigator.pop(dialogContext);
              try {
                final updated = await NewsRepository.instance.deleteComment(
                  _screen.clubId,
                  post['newsId'] as int,
                  (comments[index] as Map)['commentId'] as int,
                );
                _applyUpdated(post, updated);
                setModalState(() {
                  comments
                    ..clear()
                    ..addAll(post['comments'] as List);
                });
              } catch (e) {
                if (mounted) showApiError(this.context, e);
                return;
              }
              if (!mounted) return;
              setState(() {});
              ScaffoldMessenger.of(this.context).showSnackBar(
                const SnackBar(
                  content: Text('댓글이 삭제되었습니다.'),
                  duration: Duration(seconds: 1),
                ),
              );
            },
            child: const Text(
              '삭제',
              style: TextStyle(color: Colors.red, fontWeight: FontWeight.bold),
            ),
          ),
        ],
      ),
    );
  }

  void _showCommentsBottomSheet(BuildContext context, Map post) {
    final screenWidget = widget as ClubNewsScreen;
    final bool isPresident = screenWidget.effectiveIsPresident;
    final TextEditingController commentController = TextEditingController();
    // post['comments']는 서버 응답으로 교체될 수 있어서 별도 리스트로 들고 있음
    final List comments = List.from(post['comments'] as List);

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20.0)),
      ),
      builder: (sheetContext) {
        return StatefulBuilder(
          builder: (BuildContext modalContext, StateSetter setModalState) {
            return Padding(
              padding: EdgeInsets.only(
                bottom: MediaQuery.of(modalContext).viewInsets.bottom,
              ),
              child: Container(
                height: MediaQuery.of(modalContext).size.height * 0.65,
                padding: const EdgeInsets.fromLTRB(20.0, 12.0, 20.0, 16.0),
                child: Column(
                  children: [
                    Container(
                      width: 36.0,
                      height: 4.0,
                      margin: const EdgeInsets.only(bottom: 16.0),
                      decoration: BoxDecoration(
                        color: const Color(0xFFE0E0E0),
                        borderRadius: BorderRadius.circular(2.0),
                      ),
                    ),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          '댓글 ${comments.length}',
                          style: const TextStyle(
                            fontSize: 18.0,
                            fontWeight: FontWeight.bold,
                            color: Color(0xFF191919),
                          ),
                        ),
                        IconButton(
                          icon: const Icon(
                            Icons.close,
                            size: 22,
                            color: Color(0xFF191919),
                          ),
                          padding: EdgeInsets.zero,
                          constraints: const BoxConstraints(),
                          onPressed: () => Navigator.pop(modalContext),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16.0),
                    Expanded(
                      child: comments.isEmpty
                          ? const Center(
                              child: Text(
                                '첫 번째 댓글을 남겨보세요!',
                                style: TextStyle(
                                  color: Color(0xFF9E9E9E),
                                  fontSize: 14.0,
                                ),
                              ),
                            )
                          : ListView.separated(
                              itemCount: comments.length,
                              separatorBuilder: (context, index) =>
                                  const SizedBox(height: 16.0),
                              itemBuilder: (context, index) {
                                final comment = comments[index] as Map;
                                final bool isCommentLiked =
                                    comment['isLiked'] == true;
                                final bool isMyComment =
                                    comment['isMine'] == true;
                                final bool canDeleteComment =
                                    isMyComment || isPresident;

                                return Row(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Container(
                                      width: 36.0,
                                      height: 36.0,
                                      decoration: const BoxDecoration(
                                        color: Color(0xFFF1F8E9),
                                        shape: BoxShape.circle,
                                      ),
                                      child: const Icon(
                                        Icons.person_outline,
                                        color: Color(0xFF8CC63F),
                                        size: 20.0,
                                      ),
                                    ),
                                    const SizedBox(width: 12.0),
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: [
                                          Row(
                                            children: [
                                              Text(
                                                comment['user'].toString(),
                                                style: const TextStyle(
                                                  fontSize: 13.0,
                                                  fontWeight: FontWeight.bold,
                                                  color: Color(0xFF191919),
                                                ),
                                              ),
                                              const SizedBox(width: 6.0),
                                              Text(
                                                comment['time'].toString(),
                                                style: const TextStyle(
                                                  fontSize: 11.0,
                                                  color: Color(0xFF9E9E9E),
                                                ),
                                              ),
                                              if (canDeleteComment) ...[
                                                const SizedBox(width: 8.0),
                                                GestureDetector(
                                                  onTap: () =>
                                                      _showCommentDeleteDialog(
                                                        post: post,
                                                        sheetContext:
                                                            modalContext,
                                                        comments: comments,
                                                        index: index,
                                                        setModalState:
                                                            setModalState,
                                                      ),
                                                  child: const Text(
                                                    '삭제',
                                                    style: TextStyle(
                                                      fontSize: 11.0,
                                                      color: Color(0xFF9E9E9E),
                                                      fontWeight:
                                                          FontWeight.w600,
                                                    ),
                                                  ),
                                                ),
                                              ],
                                            ],
                                          ),
                                          const SizedBox(height: 4.0),
                                          Text(
                                            comment['text'].toString(),
                                            style: const TextStyle(
                                              fontSize: 13.0,
                                              color: Color(0xFF333333),
                                              height: 1.4,
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                    GestureDetector(
                                      onTap: () async {
                                        try {
                                          final updated = await NewsRepository
                                              .instance
                                              .toggleCommentLike(
                                                _screen.clubId,
                                                post['newsId'] as int,
                                                comment['commentId'] as int,
                                              );
                                          _applyUpdated(post, updated);
                                          setModalState(() {
                                            comments
                                              ..clear()
                                              ..addAll(post['comments'] as List);
                                          });
                                        } catch (e) {
                                          if (modalContext.mounted) {
                                            showApiError(modalContext, e);
                                          }
                                        }
                                      },
                                      child: Padding(
                                        padding: const EdgeInsets.only(
                                          left: 8.0,
                                          top: 4.0,
                                        ),
                                        child: Icon(
                                          isCommentLiked
                                              ? Icons.favorite
                                              : Icons.favorite_border,
                                          size: 16.0,
                                          color: isCommentLiked
                                              ? Colors.red
                                              : const Color(0xFFBDBDBD),
                                        ),
                                      ),
                                    ),
                                  ],
                                );
                              },
                            ),
                    ),
                    const SizedBox(height: 12.0),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 16.0,
                        vertical: 6.0,
                      ),
                      decoration: BoxDecoration(
                        color: const Color(0xFFF7F7F7),
                        borderRadius: BorderRadius.circular(24.0),
                        border: Border.all(color: const Color(0xFFEEEEEE)),
                      ),
                      child: Row(
                        children: [
                          Expanded(
                            child: TextField(
                              controller: commentController,
                              decoration: const InputDecoration(
                                hintText: '댓글을 입력해 주세요.',
                                hintStyle: TextStyle(
                                  fontSize: 13.0,
                                  color: Color(0xFF9E9E9E),
                                ),
                                border: InputBorder.none,
                                isDense: true,
                              ),
                              style: const TextStyle(fontSize: 13.0),
                            ),
                          ),
                          GestureDetector(
                            onTap: () async {
                              final text = commentController.text.trim();
                              if (text.isEmpty) return;
                              try {
                                final updated = await NewsRepository.instance
                                    .addComment(
                                      _screen.clubId,
                                      post['newsId'] as int,
                                      text,
                                    );
                                _applyUpdated(post, updated);
                                commentController.clear();
                                setModalState(() {
                                  comments
                                    ..clear()
                                    ..addAll(post['comments'] as List);
                                });
                                if (mounted) setState(() {});
                              } catch (e) {
                                if (modalContext.mounted) {
                                  showApiError(modalContext, e);
                                }
                              }
                            },
                            child: Container(
                              width: 32.0,
                              height: 32.0,
                              decoration: const BoxDecoration(
                                color: Color(0xFF8CC63F),
                                shape: BoxShape.circle,
                              ),
                              child: const Icon(
                                Icons.arrow_upward,
                                color: Colors.white,
                                size: 18.0,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }

  void _showShareBottomSheet(BuildContext context, String shareUrl) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20.0)),
      ),
      builder: (context) {
        return Padding(
          padding: const EdgeInsets.fromLTRB(24.0, 12.0, 24.0, 28.0),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 36.0,
                height: 4.0,
                margin: const EdgeInsets.only(bottom: 16.0),
                decoration: BoxDecoration(
                  color: const Color(0xFFE0E0E0),
                  borderRadius: BorderRadius.circular(2.0),
                ),
              ),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text(
                    '게시물 공유',
                    style: TextStyle(
                      fontSize: 18.0,
                      fontWeight: FontWeight.bold,
                      color: Color(0xFF191919),
                    ),
                  ),
                  IconButton(
                    icon: const Icon(
                      Icons.close,
                      size: 22,
                      color: Color(0xFF191919),
                    ),
                    padding: EdgeInsets.zero,
                    constraints: const BoxConstraints(),
                    onPressed: () => Navigator.pop(context),
                  ),
                ],
              ),
              const SizedBox(height: 16.0),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 16.0,
                  vertical: 10.0,
                ),
                decoration: BoxDecoration(
                  color: const Color(0xFFF7F7F7),
                  borderRadius: BorderRadius.circular(12.0),
                  border: Border.all(color: const Color(0xFFEEEEEE)),
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        shareUrl,
                        style: const TextStyle(
                          fontSize: 13.0,
                          color: Color(0xFF757575),
                        ),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    GestureDetector(
                      onTap: () {
                        Clipboard.setData(ClipboardData(text: shareUrl));
                        Navigator.pop(context);
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(
                            content: Text('게시물 링크가 복사되었습니다.'),
                            duration: Duration(seconds: 1),
                          ),
                        );
                      },
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 12.0,
                          vertical: 6.0,
                        ),
                        decoration: BoxDecoration(
                          color: const Color(0xFFF1F8E9),
                          borderRadius: BorderRadius.circular(8.0),
                        ),
                        child: const Text(
                          '링크 복사',
                          style: TextStyle(
                            fontSize: 12.0,
                            fontWeight: FontWeight.bold,
                            color: Color(0xFF8CC63F),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 24.0),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceAround,
                children: [
                  _buildShareIcon(
                    Icons.camera_alt,
                    '인스타그램',
                    const Color(0xFFE1306C),
                  ),
                  _buildShareIcon(
                    Icons.chat_bubble,
                    '카카오톡',
                    const Color(0xFFFFEB3B),
                  ),
                  _buildShareIcon(Icons.link, '링크 복사', const Color(0xFF555555)),
                  _buildShareIcon(
                    Icons.facebook,
                    'Facebook',
                    const Color(0xFF1877F2),
                  ),
                ],
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildShareIcon(IconData icon, String label, Color color) {
    return Column(
      children: [
        Container(
          width: 52.0,
          height: 52.0,
          decoration: BoxDecoration(
            color: color.withValues(alpha: 0.1),
            shape: BoxShape.circle,
          ),
          child: Icon(icon, color: color, size: 24.0),
        ),
        const SizedBox(height: 8.0),
        Text(
          label,
          style: const TextStyle(fontSize: 11.0, color: Color(0xFF757575)),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final screenWidget = widget as ClubNewsScreen;
    final bool canManage = screenWidget.effectiveIsPresident;
    final clubPosts = ClubNewsScreen.getPostsForClub(screenWidget.clubName);

    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios, color: Colors.black, size: 20),
          onPressed: () => Navigator.pop(context),
        ),
        title: const Text(
          '동아리 소식',
          style: TextStyle(
            color: Color(0xFF191919),
            fontWeight: FontWeight.bold,
            fontSize: 18.0,
          ),
        ),
        centerTitle: false,
        titleSpacing: 0,
      ),
      body: _isLoading && clubPosts.isEmpty
          ? const Center(
              child: CircularProgressIndicator(color: Color(0xFF8CC63F)),
            )
          : clubPosts.isEmpty
          ? const Center(
              child: Text(
                '등록된 동아리 소식이 없습니다.',
                style: TextStyle(color: Color(0xFF9E9E9E), fontSize: 15.0),
              ),
            )
          : ListView.separated(
              itemCount: clubPosts.length,
              separatorBuilder: (context, index) => const Divider(
                height: 8.0,
                thickness: 8.0,
                color: Color(0xFFF5F5F5),
              ),
              itemBuilder: (context, index) {
                final post = clubPosts[index] as Map;
                return _PostItem(
                  post: post,
                  clubName: screenWidget.clubName,
                  clubLogo: screenWidget.clubLogo,
                  isPresident: canManage,
                  onShowComments: () => _showCommentsBottomSheet(context, post),
                  onShowShare: () => _showShareBottomSheet(
                    context,
                    post['shareUrl'].toString(),
                  ),
                  onPinToggle: () => _showPinConfirmDialog(post),
                  onDelete: () => _showDeleteConfirmDialog(post),
                );
              },
            ),
      floatingActionButton: canManage
          ? FloatingActionButton(
              onPressed: _navigateAndAddNewPost,
              backgroundColor: const Color(0xFF8CC63F),
              elevation: 4.0,
              shape: const CircleBorder(),
              child: const Icon(Icons.add, color: Colors.white, size: 28.0),
            )
          : null,
    );
  }
}

class _PostItem extends StatefulWidget {
  final Map post;
  final String clubName;
  final String clubLogo;
  final bool isPresident;
  final VoidCallback onShowComments;
  final VoidCallback onShowShare;
  final VoidCallback onPinToggle;
  final VoidCallback onDelete;

  const _PostItem({
    required this.post,
    required this.clubName,
    required this.clubLogo,
    required this.isPresident,
    required this.onShowComments,
    required this.onShowShare,
    required this.onPinToggle,
    required this.onDelete,
  });

  @override
  State createState() => _PostItemState();
}

class _PostItemState extends State {
  int _currentPage = 0;

  @override
  Widget build(BuildContext context) {
    final itemWidget = widget as _PostItem;
    final post = itemWidget.post;
    final bool isPinned = post['isPinned'] == true;
    final bool isLiked = post['isLiked'] == true;
    final int likeCount = post['likes'] as int;
    final int commentCount = (post['comments'] as List).length;
    final dynamic imageInfo = post['image'];

    final List images = imageInfo is List
        ? List.from(imageInfo)
        : [imageInfo.toString()];
    final bool isMultiImage = images.length > 1;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (isPinned)
          const Padding(
            padding: EdgeInsets.fromLTRB(20.0, 14.0, 20.0, 0.0),
            child: Row(
              children: [
                Icon(Icons.push_pin, size: 15.0, color: Color(0xFF8CC63F)),
                SizedBox(width: 4.0),
                Text(
                  '메인에 올림',
                  style: TextStyle(
                    fontSize: 12.0,
                    fontWeight: FontWeight.normal,
                    color: Color(0xFF8CC63F),
                  ),
                ),
              ],
            ),
          ),
        Padding(
          padding: EdgeInsets.fromLTRB(20.0, isPinned ? 8.0 : 16.0, 20.0, 12.0),
          child: Row(
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(8.0),
                child: Image.asset(
                  itemWidget.clubLogo,
                  width: 40.0,
                  height: 40.0,
                  fit: BoxFit.cover,
                  errorBuilder: (context, error, stackTrace) => Container(
                    width: 40.0,
                    height: 40.0,
                    color: const Color(0xFF263238),
                    child: const Icon(
                      Icons.group,
                      color: Colors.white,
                      size: 20,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 12.0),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      itemWidget.clubName,
                      style: const TextStyle(
                        fontSize: 15.0,
                        fontWeight: FontWeight.bold,
                        color: Color(0xFF191919),
                      ),
                    ),
                    const SizedBox(height: 2.0),
                    Text(
                      post['timeAgo'].toString(),
                      style: const TextStyle(
                        fontSize: 12.0,
                        color: Color(0xFF9E9E9E),
                      ),
                    ),
                  ],
                ),
              ),
              if (itemWidget.isPresident)
                PopupMenuButton(
                  icon: const Icon(
                    Icons.menu,
                    color: Color(0xFF555555),
                    size: 22.0,
                  ),
                  color: Colors.white,
                  elevation: 3.0,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12.0),
                  ),
                  onSelected: (value) {
                    if (value == 'pin') {
                      itemWidget.onPinToggle();
                    } else if (value == 'delete') {
                      itemWidget.onDelete();
                    }
                  },
                  itemBuilder: (context) => [
                    PopupMenuItem(
                      value: 'pin',
                      child: Row(
                        children: [
                          Icon(
                            isPinned ? Icons.push_pin_outlined : Icons.push_pin,
                            size: 18.0,
                            color: const Color(0xFF191919),
                          ),
                          const SizedBox(width: 10.0),
                          Text(
                            isPinned ? '메인에서 내리기' : '메인에 올리기',
                            style: const TextStyle(
                              fontSize: 14.0,
                              color: Color(0xFF191919),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const PopupMenuItem(
                      value: 'delete',
                      child: Row(
                        children: [
                          Icon(
                            Icons.delete_outline,
                            size: 18.0,
                            color: Colors.red,
                          ),
                          SizedBox(width: 10.0),
                          Text(
                            '게시물 삭제',
                            style: TextStyle(fontSize: 14.0, color: Colors.red),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
            ],
          ),
        ),
        AspectRatio(
          aspectRatio: 1.0,
          child: PageView.builder(
            itemCount: images.length,
            onPageChanged: (index) {
              setState(() {
                _currentPage = index;
              });
            },
            itemBuilder: (context, index) {
              return Image(
                image: appImageProvider(images[index].toString()),
                width: double.infinity,
                fit: BoxFit.cover,
                errorBuilder: (context, error, stackTrace) => Container(
                  width: double.infinity,
                  color: const Color(0xFFEEEEEE),
                  child: const Center(
                    child: Icon(
                      Icons.image_outlined,
                      size: 48,
                      color: Colors.black26,
                    ),
                  ),
                ),
              );
            },
          ),
        ),
        if (isMultiImage)
          Padding(
            padding: const EdgeInsets.only(top: 12.0),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: List.generate(
                images.length,
                (index) => Container(
                  margin: const EdgeInsets.symmetric(horizontal: 3.0),
                  width: _currentPage == index ? 8.0 : 6.0,
                  height: _currentPage == index ? 8.0 : 6.0,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: _currentPage == index
                        ? const Color(0xFF8CC63F)
                        : const Color(0xFFE0E0E0),
                  ),
                ),
              ),
            ),
          ),
        Padding(
          padding: EdgeInsets.fromLTRB(
            20.0,
            isMultiImage ? 12.0 : 16.0,
            20.0,
            16.0,
          ),
          child: Text(
            post['content'].toString(),
            style: const TextStyle(
              fontSize: 14.0,
              color: Color(0xFF191919),
              height: 1.5,
            ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(20.0, 0.0, 20.0, 20.0),
          child: Row(
            children: [
              GestureDetector(
                onTap: () async {
                  try {
                    final updated = await NewsRepository.instance.toggleLike(
                      post['clubId'] as int,
                      post['newsId'] as int,
                    );
                    final clubName = post['clubName'];
                    if (!mounted) return;
                    setState(() {
                      post
                        ..clear()
                        ..addAll(updated)
                        ..['clubName'] = clubName;
                    });
                  } catch (e) {
                    if (context.mounted) showApiError(context, e);
                  }
                },
                child: Row(
                  children: [
                    Icon(
                      isLiked ? Icons.favorite : Icons.favorite_border,
                      size: 22.0,
                      color: isLiked ? Colors.red : const Color(0xFF333333),
                    ),
                    const SizedBox(width: 6.0),
                    Text(
                      '$likeCount',
                      style: const TextStyle(
                        fontSize: 14.0,
                        fontWeight: FontWeight.w600,
                        color: Color(0xFF333333),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 18.0),
              GestureDetector(
                onTap: itemWidget.onShowComments,
                child: Row(
                  children: [
                    const Icon(
                      Icons.chat_bubble_outline,
                      size: 21.0,
                      color: Color(0xFF333333),
                    ),
                    const SizedBox(width: 6.0),
                    Text(
                      '$commentCount',
                      style: const TextStyle(
                        fontSize: 14.0,
                        fontWeight: FontWeight.w600,
                        color: Color(0xFF333333),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 18.0),
              GestureDetector(
                onTap: itemWidget.onShowShare,
                child: const Icon(
                  Icons.share_outlined,
                  size: 21.0,
                  color: Color(0xFF333333),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
