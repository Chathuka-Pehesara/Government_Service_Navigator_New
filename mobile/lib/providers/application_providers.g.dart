// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'application_providers.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// The signed-in citizen's applications. Shared by the home and applications tabs,
/// so refreshing one (`ref.invalidate(myApplicationsProvider)`) updates both.
/// Officer decisions arrive instantly through the realtime hub (see realtime_provider.dart);
/// this slow poll is only a fallback for missed messages, and it skips while the app is in
/// the background. Screens must not add their own timers on top of this one.

@ProviderFor(myApplications)
final myApplicationsProvider = MyApplicationsProvider._();

/// The signed-in citizen's applications. Shared by the home and applications tabs,
/// so refreshing one (`ref.invalidate(myApplicationsProvider)`) updates both.
/// Officer decisions arrive instantly through the realtime hub (see realtime_provider.dart);
/// this slow poll is only a fallback for missed messages, and it skips while the app is in
/// the background. Screens must not add their own timers on top of this one.

final class MyApplicationsProvider
    extends
        $FunctionalProvider<
          AsyncValue<List<ApplicationItemModel>>,
          List<ApplicationItemModel>,
          FutureOr<List<ApplicationItemModel>>
        >
    with
        $FutureModifier<List<ApplicationItemModel>>,
        $FutureProvider<List<ApplicationItemModel>> {
  /// The signed-in citizen's applications. Shared by the home and applications tabs,
  /// so refreshing one (`ref.invalidate(myApplicationsProvider)`) updates both.
  /// Officer decisions arrive instantly through the realtime hub (see realtime_provider.dart);
  /// this slow poll is only a fallback for missed messages, and it skips while the app is in
  /// the background. Screens must not add their own timers on top of this one.
  MyApplicationsProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'myApplicationsProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$myApplicationsHash();

  @$internal
  @override
  $FutureProviderElement<List<ApplicationItemModel>> $createElement(
    $ProviderPointer pointer,
  ) => $FutureProviderElement(pointer);

  @override
  FutureOr<List<ApplicationItemModel>> create(Ref ref) {
    return myApplications(ref);
  }
}

String _$myApplicationsHash() => r'4868acfd5faa1ffd9937bc2336589c9ddfc8cc6c';

@ProviderFor(auditLogs)
final auditLogsProvider = AuditLogsFamily._();

final class AuditLogsProvider
    extends
        $FunctionalProvider<
          AsyncValue<List<AuditLogModel>>,
          List<AuditLogModel>,
          FutureOr<List<AuditLogModel>>
        >
    with
        $FutureModifier<List<AuditLogModel>>,
        $FutureProvider<List<AuditLogModel>> {
  AuditLogsProvider._({
    required AuditLogsFamily super.from,
    required int super.argument,
  }) : super(
         retry: null,
         name: r'auditLogsProvider',
         isAutoDispose: true,
         dependencies: null,
         $allTransitiveDependencies: null,
       );

  @override
  String debugGetCreateSourceHash() => _$auditLogsHash();

  @override
  String toString() {
    return r'auditLogsProvider'
        ''
        '($argument)';
  }

  @$internal
  @override
  $FutureProviderElement<List<AuditLogModel>> $createElement(
    $ProviderPointer pointer,
  ) => $FutureProviderElement(pointer);

  @override
  FutureOr<List<AuditLogModel>> create(Ref ref) {
    final argument = this.argument as int;
    return auditLogs(ref, argument);
  }

  @override
  bool operator ==(Object other) {
    return other is AuditLogsProvider && other.argument == argument;
  }

  @override
  int get hashCode {
    return argument.hashCode;
  }
}

String _$auditLogsHash() => r'2109c408066cb4749ae1255f1eef0616c1d68620';

final class AuditLogsFamily extends $Family
    with $FunctionalFamilyOverride<FutureOr<List<AuditLogModel>>, int> {
  AuditLogsFamily._()
    : super(
        retry: null,
        name: r'auditLogsProvider',
        dependencies: null,
        $allTransitiveDependencies: null,
        isAutoDispose: true,
      );

  AuditLogsProvider call(int applicationId) =>
      AuditLogsProvider._(argument: applicationId, from: this);

  @override
  String toString() => r'auditLogsProvider';
}

/// In-app notifications, newest first.

@ProviderFor(Notifications)
final notificationsProvider = NotificationsProvider._();

/// In-app notifications, newest first.
final class NotificationsProvider
    extends $AsyncNotifierProvider<Notifications, List<CitizenNotification>> {
  /// In-app notifications, newest first.
  NotificationsProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'notificationsProvider',
        isAutoDispose: true,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$notificationsHash();

  @$internal
  @override
  Notifications create() => Notifications();
}

String _$notificationsHash() => r'd7de2a50521e00efa6b49f7e0eba2ee3029c88ab';

/// In-app notifications, newest first.

abstract class _$Notifications
    extends $AsyncNotifier<List<CitizenNotification>> {
  FutureOr<List<CitizenNotification>> build();
  @$mustCallSuper
  @override
  WhenComplete runBuild() {
    final ref =
        this.ref
            as $Ref<
              AsyncValue<List<CitizenNotification>>,
              List<CitizenNotification>
            >;
    final element =
        ref.element
            as $ClassProviderElement<
              AnyNotifier<
                AsyncValue<List<CitizenNotification>>,
                List<CitizenNotification>
              >,
              AsyncValue<List<CitizenNotification>>,
              Object?,
              Object?
            >;
    return element.handleCreate(ref, build);
  }
}

/// Unread badge count; 0 while loading or if notifications fail (the badge is optional).

@ProviderFor(unreadNotificationCount)
final unreadNotificationCountProvider = UnreadNotificationCountProvider._();

/// Unread badge count; 0 while loading or if notifications fail (the badge is optional).

final class UnreadNotificationCountProvider
    extends $FunctionalProvider<int, int, int>
    with $Provider<int> {
  /// Unread badge count; 0 while loading or if notifications fail (the badge is optional).
  UnreadNotificationCountProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'unreadNotificationCountProvider',
        isAutoDispose: true,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$unreadNotificationCountHash();

  @$internal
  @override
  $ProviderElement<int> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  int create(Ref ref) {
    return unreadNotificationCount(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(int value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<int>(value),
    );
  }
}

String _$unreadNotificationCountHash() =>
    r'f39820e3ce38573c184769e655147e45c5735850';
