import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';
import 'package:signalr_netcore/signalr_client.dart';
import '../config/app_config.dart';
import 'application_providers.dart';
import 'refund_providers.dart';
import 'session_provider.dart';

part 'realtime_provider.g.dart';

/// Live updates from the backend (SignalR hub at /hubs/applications) while a citizen is signed in.
/// The server only says "something changed"; this refreshes the affected providers, which refetch
/// through the normal REST endpoints. Replaces the old 2-4 second polling timers.
///
/// Read once from the app root (`ref.listen`); it reconnects on its own when the token changes.
@Riverpod(keepAlive: true)
RealtimeConnection? realtime(Ref ref) {
  final token = ref.watch(authTokenProvider);
  if (token.isEmpty) return null;

  final connection = RealtimeConnection(ref, token);
  ref.onDispose(connection.dispose);
  connection.start();
  return connection;
}

class RealtimeConnection with WidgetsBindingObserver {
  RealtimeConnection(this._ref, this._token) {
    WidgetsBinding.instance.addObserver(this);
  }

  static const _retryDelay = Duration(seconds: 10);

  final Ref _ref;
  final String _token;
  HubConnection? _hub;
  Timer? _retryTimer;
  bool _disposed = false;

  static String get _hubUrl {
    final api = AppConfig.baseUrl;
    final root = api.endsWith('/api') ? api.substring(0, api.length - 4) : api;
    return '$root/hubs/applications';
  }

  Future<void> start() async {
    if (_disposed || _hub != null) return;
    _retryTimer?.cancel();

    final hub = HubConnectionBuilder()
        .withUrl(_hubUrl, options: HttpConnectionOptions(accessTokenFactory: () async => _token))
        .withAutomaticReconnect()
        .build();

    hub.on('applicationsChanged', (_) => _refreshApplications());
    hub.on('refundUpdated', (_) => _refreshRefunds());
    // Anything may have changed while the connection was down
    hub.onreconnected(({connectionId}) => _refreshAll());
    hub.onclose(({error}) {
      _hub = null;
      _scheduleRetry();
    });

    _hub = hub;
    try {
      await hub.start();
    } catch (e) {
      // The 30 s fallback poll in myApplicationsProvider keeps the app correct meanwhile
      if (kDebugMode) debugPrint('Realtime connection failed: $e');
      _hub = null;
      _scheduleRetry();
    }
  }

  Future<void> _stop() async {
    _retryTimer?.cancel();
    final hub = _hub;
    _hub = null;
    if (hub != null) {
      try {
        await hub.stop();
      } catch (_) {}
    }
  }

  void _scheduleRetry() {
    if (_disposed) return;
    final state = WidgetsBinding.instance.lifecycleState;
    if (state != null && state != AppLifecycleState.resumed) return;
    _retryTimer?.cancel();
    _retryTimer = Timer(_retryDelay, start);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (_disposed) return;
    if (state == AppLifecycleState.resumed) {
      // Catch up on anything missed while in the background, then listen again
      _refreshAll();
      start();
    } else if (state == AppLifecycleState.paused) {
      // No open socket (or battery use) while the app is not on screen
      _stop();
    }
  }

  void _refreshApplications() {
    if (_disposed || !_ref.mounted) return;
    _ref.invalidate(myApplicationsProvider);
    _ref.invalidate(notificationsProvider);
  }

  void _refreshRefunds() {
    if (_disposed || !_ref.mounted) return;
    _ref.invalidate(myRefundsProvider);
    _ref.invalidate(refundDetailProvider);
  }

  void _refreshAll() {
    _refreshApplications();
    _refreshRefunds();
  }

  void dispose() {
    _disposed = true;
    WidgetsBinding.instance.removeObserver(this);
    _stop();
  }
}
