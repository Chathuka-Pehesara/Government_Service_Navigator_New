// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'refund_providers.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning

@ProviderFor(myRefunds)
final myRefundsProvider = MyRefundsProvider._();

final class MyRefundsProvider
    extends
        $FunctionalProvider<
          AsyncValue<List<RefundRequest>>,
          List<RefundRequest>,
          FutureOr<List<RefundRequest>>
        >
    with
        $FutureModifier<List<RefundRequest>>,
        $FutureProvider<List<RefundRequest>> {
  MyRefundsProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'myRefundsProvider',
        isAutoDispose: true,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$myRefundsHash();

  @$internal
  @override
  $FutureProviderElement<List<RefundRequest>> $createElement(
    $ProviderPointer pointer,
  ) => $FutureProviderElement(pointer);

  @override
  FutureOr<List<RefundRequest>> create(Ref ref) {
    return myRefunds(ref);
  }
}

String _$myRefundsHash() => r'92e2dc0265a03edc23abca3155c7f98a5ab4f043';

/// One refund request. Staff decisions arrive through the realtime hub; this slow poll only
/// covers missed messages and skips while the app is in the background.

@ProviderFor(RefundDetail)
final refundDetailProvider = RefundDetailFamily._();

/// One refund request. Staff decisions arrive through the realtime hub; this slow poll only
/// covers missed messages and skips while the app is in the background.
final class RefundDetailProvider
    extends $AsyncNotifierProvider<RefundDetail, RefundRequest> {
  /// One refund request. Staff decisions arrive through the realtime hub; this slow poll only
  /// covers missed messages and skips while the app is in the background.
  RefundDetailProvider._({
    required RefundDetailFamily super.from,
    required String super.argument,
  }) : super(
         retry: null,
         name: r'refundDetailProvider',
         isAutoDispose: true,
         dependencies: null,
         $allTransitiveDependencies: null,
       );

  @override
  String debugGetCreateSourceHash() => _$refundDetailHash();

  @override
  String toString() {
    return r'refundDetailProvider'
        ''
        '($argument)';
  }

  @$internal
  @override
  RefundDetail create() => RefundDetail();

  @override
  bool operator ==(Object other) {
    return other is RefundDetailProvider && other.argument == argument;
  }

  @override
  int get hashCode {
    return argument.hashCode;
  }
}

String _$refundDetailHash() => r'f81492b32a49661f5ee9419fcde3f1f613acb51d';

/// One refund request. Staff decisions arrive through the realtime hub; this slow poll only
/// covers missed messages and skips while the app is in the background.

final class RefundDetailFamily extends $Family
    with
        $ClassFamilyOverride<
          RefundDetail,
          AsyncValue<RefundRequest>,
          RefundRequest,
          FutureOr<RefundRequest>,
          String
        > {
  RefundDetailFamily._()
    : super(
        retry: null,
        name: r'refundDetailProvider',
        dependencies: null,
        $allTransitiveDependencies: null,
        isAutoDispose: true,
      );

  /// One refund request. Staff decisions arrive through the realtime hub; this slow poll only
  /// covers missed messages and skips while the app is in the background.

  RefundDetailProvider call(String refundId) =>
      RefundDetailProvider._(argument: refundId, from: this);

  @override
  String toString() => r'refundDetailProvider';
}

/// One refund request. Staff decisions arrive through the realtime hub; this slow poll only
/// covers missed messages and skips while the app is in the background.

abstract class _$RefundDetail extends $AsyncNotifier<RefundRequest> {
  late final _$args = ref.$arg as String;
  String get refundId => _$args;

  FutureOr<RefundRequest> build(String refundId);
  @$mustCallSuper
  @override
  WhenComplete runBuild() {
    final ref = this.ref as $Ref<AsyncValue<RefundRequest>, RefundRequest>;
    final element =
        ref.element
            as $ClassProviderElement<
              AnyNotifier<AsyncValue<RefundRequest>, RefundRequest>,
              AsyncValue<RefundRequest>,
              Object?,
              Object?
            >;
    return element.handleCreate(ref, () => build(_$args));
  }
}
