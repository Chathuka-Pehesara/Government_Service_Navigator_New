import 'dart:convert';
import 'package:http/http.dart' as http;
import '../config/app_config.dart';

class AgentExecutionTraceItemModel {
  final String agentId;
  final String agentName;
  final String action;
  final String status;
  final bool isDeterministic;
  final int latencyMs;
  final String summary;

  AgentExecutionTraceItemModel({
    required this.agentId,
    required this.agentName,
    required this.action,
    required this.status,
    required this.isDeterministic,
    required this.latencyMs,
    required this.summary,
  });

  factory AgentExecutionTraceItemModel.fromJson(Map<String, dynamic> json) {
    return AgentExecutionTraceItemModel(
      agentId: json['agentId'] as String? ?? '',
      agentName: json['agentName'] as String? ?? '',
      action: json['action'] as String? ?? '',
      status: json['status'] as String? ?? 'Completed',
      isDeterministic: json['isDeterministic'] as bool? ?? false,
      latencyMs: (json['latencyMs'] as num?)?.toInt() ?? 0,
      summary: json['summary'] as String? ?? '',
    );
  }
}

class SupervisorRecommendationModel {
  final String actionType;
  final String title;
  final String rationale;
  final String riskLevel;

  SupervisorRecommendationModel({
    required this.actionType,
    required this.title,
    required this.rationale,
    required this.riskLevel,
  });

  factory SupervisorRecommendationModel.fromJson(Map<String, dynamic> json) {
    return SupervisorRecommendationModel(
      actionType: json['actionType'] as String? ?? '',
      title: json['title'] as String? ?? '',
      rationale: json['rationale'] as String? ?? '',
      riskLevel: json['riskLevel'] as String? ?? 'Low',
    );
  }
}

class SupervisorResponseModel {
  final String answer;
  final String tone;
  final List<AgentExecutionTraceItemModel> collaborationTrace;
  final SupervisorRecommendationModel? recommendation;
  final List<String> suggestedFollowups;

  SupervisorResponseModel({
    required this.answer,
    required this.tone,
    required this.collaborationTrace,
    this.recommendation,
    required this.suggestedFollowups,
  });

  factory SupervisorResponseModel.fromJson(Map<String, dynamic> json) {
    return SupervisorResponseModel(
      answer: json['answer'] as String? ?? '',
      tone: json['tone'] as String? ?? 'CitizenSupportive',
      collaborationTrace: (json['collaborationTrace'] as List? ?? [])
          .map((item) => AgentExecutionTraceItemModel.fromJson(item as Map<String, dynamic>))
          .toList(),
      recommendation: json['recommendation'] != null
          ? SupervisorRecommendationModel.fromJson(json['recommendation'] as Map<String, dynamic>)
          : null,
      suggestedFollowups: (json['suggestedFollowups'] as List? ?? [])
          .map((f) => f.toString())
          .toList(),
    );
  }
}

class SupervisorAgentService {
  static String get _chatUrl => '${AppConfig.baseUrl}/orchestrator/chat';

  static Future<SupervisorResponseModel> ask({
    required String query,
    int? applicationId,
    int? serviceProcedureId,
    int? stage,
    List<Map<String, String>>? history,
  }) async {
    final response = await http.post(
      Uri.parse(_chatUrl),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({
        'query': query,
        'applicationId': applicationId,
        'serviceProcedureId': serviceProcedureId,
        'stage': stage,
        'platformContext': 'mobile',
        'history': history,
      }),
    );

    if (response.statusCode == 200) {
      final Map<String, dynamic> data = jsonDecode(response.body);
      return SupervisorResponseModel.fromJson(data);
    }
    throw Exception('Failed to reach AI assistant: ${response.statusCode}');
  }
}
