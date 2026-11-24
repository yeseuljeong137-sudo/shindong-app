import 'package:flutter/material.dart';

import '../../services/api_client.dart';
import '../../widgets/api_error.dart';

class NotificationScreen extends StatefulWidget {
  const NotificationScreen({super.key});

  @override
  State<NotificationScreen> createState() => _NotificationScreenState();
}

class _NotificationScreenState extends State<NotificationScreen> {
  // 서버에서 받아온 알림 (최신순) — GET /api/notifications
  List<Map<String, dynamic>> _notifications = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final data = asJsonMap(await ApiClient.instance.get('/api/notifications'));
      if (!mounted) return;
      setState(() {
        _notifications = asJsonList(data['notifications']);
        _isLoading = false;
      });
      // 화면에 보여줬으니 모두 읽음 처리 (실패해도 무시)
      if (data['unreadCount'] is int && (data['unreadCount'] as int) > 0) {
        ApiClient.instance.patch('/api/notifications/read-all').catchError((_) {});
      }
    } catch (e) {
      if (!mounted) return;
      setState(() => _isLoading = false);
      showApiError(context, e);
    }
  }

  Future<void> _delete(Map<String, dynamic> notification) async {
    setState(() => _notifications.remove(notification));
    try {
      await ApiClient.instance.delete(
        '/api/notifications/${notification['notificationId']}',
      );
    } catch (e) {
      if (mounted) showApiError(context, e);
      _load();
    }
  }

  @override
  Widget build(BuildContext context) {
    final notifications = _notifications;

    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        titleSpacing: 20.0,
        title: const Text(
          '알림',
          style: TextStyle(
            color: Color(0xFF191919),
            fontWeight: FontWeight.w800,
            fontSize: 22.0,
            letterSpacing: -0.3,
          ),
        ),
      ),
      body: _isLoading
          ? const Center(
              child: CircularProgressIndicator(color: Color(0xFF8CC63F)),
            )
          : RefreshIndicator(
              color: const Color(0xFF8CC63F),
              onRefresh: _load,
              child: notifications.isEmpty
                  ? ListView(
                      children: const [
                        SizedBox(height: 160.0),
                        Center(
                          child: Text(
                            '새로운 알림이 없어요.',
                            style: TextStyle(
                              color: Color(0xFF9E9E9E),
                              fontSize: 14.0,
                            ),
                          ),
                        ),
                      ],
                    )
                  : ListView.separated(
        itemCount: notifications.length,
        separatorBuilder: (BuildContext context, int index) {
          return const Divider(
            height: 1.0,
            thickness: 1.0,
            color: Color(0xFFF5F5F5),
          );
        },
        itemBuilder: (BuildContext context, int index) {
          final notification = notifications[index];
          final bool isUnread = notification['isRead'] != true;

          return Dismissible(
            key: ValueKey(notification['notificationId']),
            direction: DismissDirection.endToStart,
            background: Container(
              color: const Color(0xFFEF4444),
              alignment: Alignment.centerRight,
              padding: const EdgeInsets.only(right: 20.0),
              child: const Icon(Icons.delete_outline, color: Colors.white),
            ),
            onDismissed: (_) => _delete(notification),
            child: Container(
            color: isUnread ? const Color(0xFFF7FBEF) : Colors.white,
            child: Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: 20.0,
              vertical: 16.0,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      notification['type'].toString(),
                      style: const TextStyle(
                        fontSize: 12.0,
                        color: Color(0xFF9E9E9E),
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    Text(
                      notification['time'].toString(),
                      style: const TextStyle(
                        fontSize: 12.0,
                        color: Color(0xFF9E9E9E),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8.0),
                Text(
                  notification['title'].toString(),
                  style: const TextStyle(
                    fontSize: 15.0,
                    fontWeight: FontWeight.bold,
                    color: Color(0xFF333333),
                  ),
                ),
                const SizedBox(height: 6.0),
                Text(
                  notification['content'].toString(),
                  style: const TextStyle(
                    fontSize: 13.0,
                    color: Color(0xFF757575),
                    height: 1.4,
                  ),
                ),
              ],
            ),
            ),
            ),
          );
        },
      ),
            ),
    );
  }
}
