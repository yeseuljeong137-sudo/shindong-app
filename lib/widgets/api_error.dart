import 'package:flutter/material.dart';

import '../config/api_config.dart';
import '../services/api_client.dart';

/// 서버 에러를 화면 아래 스낵바로 보여줌
void showApiError(BuildContext context, Object error) {
  if (!context.mounted) return;
  final message = error is ApiException ? error.message : '문제가 발생했어요. ($error)';
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(message)));
}

/// 이미지 경로에 맞는 ImageProvider
/// - assets/... → 앱에 들어있는 이미지
/// - /uploads/... 또는 http... → 서버 이미지
ImageProvider appImageProvider(String path) {
  if (path.startsWith('assets/')) return AssetImage(path);
  return NetworkImage(ApiConfig.resolveUrl(path));
}
