import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';
import '../services/session_storage.dart';
import 'service_providers.dart';

part 'session_provider.g.dart';

/// The signed-in citizen: the backend bearer token plus the identity returned at login.
class SessionState {
  final String token;
  final String email;
  final Map<String, dynamic>? user;

  const SessionState({required this.token, required this.email, this.user});

  const SessionState.signedOut()
      : token = '',
        email = '',
        user = null;

  bool get isSignedIn => token.isNotEmpty;

  /// Display name from the login payload, if the backend sent one.
  String? get fullName => user?['fullName']?.toString();
}

/// App-wide auth session. Kept alive for the whole app run so every screen and
/// service provider can read the token instead of having it passed down by hand.
/// It is also saved on the device, so closing the app keeps the user signed in
/// until they sign out (or the token expires).
@Riverpod(keepAlive: true)
class Session extends _$Session {
  @override
  SessionState build() => const SessionState.signedOut();

  /// Restores the session saved by an earlier run. Returns true when the user is signed in.
  Future<bool> restore() async {
    final saved = await SessionStorage.load();
    if (saved != null) {
      state = SessionState(token: saved.token, email: saved.email, user: saved.user);
    }
    return state.isSignedIn;
  }

  void signIn({required String token, required String email, Map<String, dynamic>? user}) {
    state = SessionState(token: token, email: email, user: user);
    SessionStorage.save(token: token, email: email, user: user);
  }

  void signOut() {
    final token = state.token;
    state = const SessionState.signedOut();
    SessionStorage.clear();
    if (token.isNotEmpty) ref.read(authServiceProvider).logout(token);
  }
}

/// Just the bearer token. Service providers watch this so they rebuild on login/logout.
@Riverpod(keepAlive: true)
String authToken(Ref ref) => ref.watch(sessionProvider.select((s) => s.token));
