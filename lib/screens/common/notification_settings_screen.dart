import 'package:flutter/material.dart';

import '../../services/api_client.dart';
import '../../widgets/api_error.dart';

class NotificationSettingsScreen extends StatefulWidget {
  const NotificationSettingsScreen({super.key});

  @override
  State createState() => _NotificationSettingsScreenState();
}

class _NotificationSettingsScreenState extends State {
  // 서버의 알림 설정 [{ key, title, subtitle, enabled }] — GET /api/notifications/settings
  List _settings = [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final list = asJsonList(
        await ApiClient.instance.get('/api/notifications/settings'),
      );
      if (!mounted) return;
      setState(() => _settings = list);
    } catch (e) {
      if (mounted) showApiError(context, e);
    }
  }

  Future<void> _toggle(Map item) async {
    final bool next = item['enabled'] != true;
    setState(() => item['enabled'] = next); // 화면 먼저 바꾸고
    try {
      await ApiClient.instance.put(
        '/api/notifications/settings',
        body: {item['key'].toString(): next},
      );
    } catch (e) {
      if (!mounted) return;
      setState(() => item['enabled'] = !next); // 실패하면 되돌림
      showApiError(context, e);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF8F9FA),
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        scrolledUnderElevation: 0,
        leading: IconButton(
          icon: const Icon(
            Icons.arrow_back_ios,
            color: Color(0xFF191919),
            size: 20.0,
          ),
          onPressed: () => Navigator.pop(context),
        ),
        title: const Text(
          '알림 설정',
          style: TextStyle(
            color: Color(0xFF191919),
            fontWeight: FontWeight.bold,
            fontSize: 18.0,
          ),
        ),
        centerTitle: false,
        titleSpacing: 0,
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(1.0),
          child: Container(color: const Color(0xFFEEEEEE), height: 1.0),
        ),
      ),
      body: Padding(
        padding: const EdgeInsets.all(20.0),
        child: Container(
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(16.0),
            border: Border.all(color: const Color(0xFFEEEEEE)),
          ),
          child: ListView.separated(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: _settings.length,
            separatorBuilder: (context, index) => const Divider(
              height: 1.0,
              thickness: 1.0,
              indent: 20.0,
              endIndent: 20.0,
              color: Color(0xFFF2F2F2),
            ),
            itemBuilder: (context, index) {
              final item = _settings[index] as Map;
              final bool isEnabled = item['enabled'] == true;

              return Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: 20.0,
                  vertical: 18.0,
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            item['title'].toString(),
                            style: const TextStyle(
                              fontSize: 15.0,
                              fontWeight: FontWeight.bold,
                              color: Color(0xFF191919),
                            ),
                          ),
                          const SizedBox(height: 4.0),
                          Text(
                            item['subtitle'].toString(),
                            style: const TextStyle(
                              fontSize: 12.0,
                              color: Color(0xFF757575),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 12.0),
                    GestureDetector(
                      onTap: () => _toggle(item),
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 180),
                        width: 48.0,
                        height: 28.0,
                        padding: const EdgeInsets.all(3.0),
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(20.0),
                          color: isEnabled
                              ? const Color(0xFF8CC63F)
                              : const Color(0xFF94A3B8),
                        ),
                        child: AnimatedAlign(
                          duration: const Duration(milliseconds: 180),
                          alignment: isEnabled
                              ? Alignment.centerRight
                              : Alignment.centerLeft,
                          child: Container(
                            width: 22.0,
                            height: 22.0,
                            decoration: const BoxDecoration(
                              shape: BoxShape.circle,
                              color: Colors.white,
                            ),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              );
            },
          ),
        ),
      ),
    );
  }
}
