import 'package:riverpod_annotation/riverpod_annotation.dart';
import '../models/analytics.dart';
import '../models/eligibility_agent_model.dart';
import '../models/intake_plan_model.dart';
import '../services/eligibility_agent_service.dart';
import '../services/intake_agent_service.dart';
import 'service_providers.dart';

part 'agent_providers.g.dart';

// On-demand requests the user triggers from a form. Each controller starts idle
// (`AsyncData(null)`), goes to `AsyncLoading` while the request runs, then holds
// the result or the error for the screen to render.

@riverpod
class ApprovalLikelihoodController extends _$ApprovalLikelihoodController {
  @override
  FutureOr<ApprovalLikelihood?> build() => null;

  Future<void> check(String serviceProcedureId) async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(
      () => ref.read(analyticsServiceProvider).getApprovalLikelihood(serviceProcedureId),
    );
  }
}

@riverpod
class EligibilityCheckController extends _$EligibilityCheckController {
  @override
  FutureOr<EligibilityAgentResponse?> build() => null;

  Future<EligibilityAgentResponse?> evaluate({
    required String serviceName,
    required int serviceId,
    required int age,
    required String citizenshipStatus,
    required double annualIncome,
    required String employmentStatus,
    required List<String> providedDocuments,
  }) async {
    state = const AsyncLoading();
    try {
      final res = await EligibilityAgentService.evaluateEligibility(
        serviceName: serviceName,
        serviceId: serviceId,
        age: age,
        citizenshipStatus: citizenshipStatus,
        annualIncome: annualIncome,
        employmentStatus: employmentStatus,
        providedDocuments: providedDocuments,
      );
      if (ref.mounted) {
        state = AsyncData(res);
      }
      return res;
    } catch (e, st) {
      if (ref.mounted) {
        state = AsyncError(e, st);
      }
      return null;
    }
  }
}

@riverpod
class IntakeAgentController extends _$IntakeAgentController {
  @override
  FutureOr<IntakePlanModel?> build() => null;

  /// Returns the plan so the caller can navigate to it, or null on failure (error is in `state`).
  Future<IntakePlanModel?> ask(String text) async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(() => IntakeAgentService.ask(text));
    return state.value;
  }
}
