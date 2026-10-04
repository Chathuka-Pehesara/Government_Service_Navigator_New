import 'dart:async';
import 'package:flutter/widgets.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';
import '../models/verification_models.dart';
import '../services/notification_api_service.dart';
import '../services/verification_api_service.dart';
import 'service_providers.dart';
import 'session_provider.dart';

part 'application_providers.g.dart';

/// The signed-in citizen's applications. Shared by the home and applications tabs,
/// so refreshing one (`ref.invalidate(myApplicationsProvider)`) updates both.
/// Officer decisions arrive instantly through the realtime hub (see realtime_provider.dart);
/// this slow poll is only a fallback for missed messages, and it skips while the app is in
/// the background. Screens must not add their own timers on top of this one.
@Riverpod(keepAlive: true)
Future<List<ApplicationItemModel>> myApplications(Ref ref) async {
  final token = ref.watch(authTokenProvider);
  if (token.isEmpty) return const [];

  final timer = Timer.periodic(const Duration(seconds: 4), (_) {
    final state = WidgetsBinding.instance.lifecycleState;
    if (state == null || state == AppLifecycleState.resumed) {
      ref.invalidateSelf();
    }
  });
  ref.onDispose(timer.cancel);

  return VerificationApiService.fetchApplications(token: token);
}

@riverpod
Future<List<AuditLogModel>> auditLogs(Ref ref, int applicationId) =>
    VerificationApiService.fetchAuditLogs(applicationId, token: ref.watch(authTokenProvider));

/// In-app notifications, newest first.
@riverpod
class Notifications extends _$Notifications {
  @override
  Future<List<CitizenNotification>> build() async {
    if (ref.watch(authTokenProvider).isEmpty) return [];
    return ref.watch(notificationApiServiceProvider).fetchMine();
  }

  /// Marks everything read on the server but keeps the loaded list as-is, so the open
  /// screen still highlights what was new. The badge updates on the next refresh.
  Future<void> markAllRead() => ref.read(notificationApiServiceProvider).markAllRead();
}

/// Unread badge count; 0 while loading or if notifications fail (the badge is optional).
@riverpod
int unreadNotificationCount(Ref ref) =>
    ref.watch(notificationsProvider).value?.where((n) => !n.isRead).length ?? 0;
