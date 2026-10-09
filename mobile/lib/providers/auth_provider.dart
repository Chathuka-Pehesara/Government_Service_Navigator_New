import 'package:riverpod_annotation/riverpod_annotation.dart';
import '../services/onboarding_prefs.dart';
import 'service_providers.dart';
import 'session_provider.dart';

part 'auth_provider.g.dart';

/// Whether this device has finished onboarding (slides, terms, first sign-in).
@Riverpod(keepAlive: true)
Future<bool> onboardingCompleted(Ref ref) => OnboardingPrefs.isCompleted();

/// Login / sign-up actions. The state is the in-flight request: `isLoading` while
/// talking to the server, `AsyncError` carrying the message to show on failure.
@riverpod
class AuthController extends _$AuthController {
  @override
  FutureOr<void> build() {}

  /// Returns true when the user is now signed in.
  Future<bool> login({required String email, required String password}) async {
    state = const AsyncLoading();
    final result = await ref.read(authServiceProvider).login(email: email, password: password);
    return _complete(result.success, result.token, email, result.user, result.errorMessage ?? 'Login failed');
  }

  /// Returns true when the new account is created.
  Future<bool> signUp({
    required String fullName,
    required String email,
    required String password,
    required String nicNumber,
  }) async {
    state = const AsyncLoading();
    final result = await ref.read(authServiceProvider).signUp(
          fullName: fullName,
          email: email,
          password: password,
          nicNumber: nicNumber,
        );
    if (!result.success) {
      if (ref.mounted) state = AsyncError(result.errorMessage ?? 'Sign up failed', StackTrace.current);
      return false;
    }
    await OnboardingPrefs.markCompleted();
    if (ref.mounted) state = const AsyncData(null);
    return true;
  }

  Future<bool> _complete(
    bool success,
    String? token,
    String email,
    Map<String, dynamic>? user,
    String errorMessage,
  ) async {
    if (!success) {
      if (ref.mounted) state = AsyncError(errorMessage, StackTrace.current);
      return false;
    }
    await OnboardingPrefs.markCompleted();
    ref.read(sessionProvider.notifier).signIn(token: token ?? '', email: email, user: user);
    if (ref.mounted) state = const AsyncData(null);
    return true;
  }

  void signOut() => ref.read(sessionProvider.notifier).signOut();
}
