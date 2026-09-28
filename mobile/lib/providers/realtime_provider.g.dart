// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'realtime_provider.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// Live updates from the backend (SignalR hub at /hubs/applications) while a citizen is signed in.
/// The server only says "something changed"; this refreshes the affected providers, which refetch
/// through the normal REST endpoints. Replaces the old 2-4 second polling timers.
///
/// Read once from the app root (`ref.listen`); it reconnects on its own when the token changes.

@ProviderFor(realtime)
final realtimeProvider = RealtimeProvider._();

/// Live updates from the backend (SignalR hub at /hubs/applications) while a citizen is signed in.
/// The server only says "something changed"; this refreshes the affected providers, which refetch
/// through the normal REST endpoints. Replaces the old 2-4 second polling timers.
///
/// Read once from the app root (`ref.listen`); it reconnects on its own when the token changes.

final class RealtimeProvider
    extends
        $FunctionalProvider<
          RealtimeConnection?,
          RealtimeConnection?,
          RealtimeConnection?
        >
    with $Provider<RealtimeConnection?> {
  /// Live updates from the backend (SignalR hub at /hubs/applications) while a citizen is signed in.
  /// The server only says "something changed"; this refreshes the affected providers, which refetch
  /// through the normal REST endpoints. Replaces the old 2-4 second polling timers.
  ///
  /// Read once from the app root (`ref.listen`); it reconnects on its own when the token changes.
  RealtimeProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'realtimeProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$realtimeHash();

  @$internal
  @override
  $ProviderElement<RealtimeConnection?> $createElement(
    $ProviderPointer pointer,
  ) => $ProviderElement(pointer);

  @override
  RealtimeConnection? create(Ref ref) {
    return realtime(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(RealtimeConnection? value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<RealtimeConnection?>(value),
    );
  }
}

String _$realtimeHash() => r'6030bae1d40d21a1e3e95ffe2b9223818be9a61e';
