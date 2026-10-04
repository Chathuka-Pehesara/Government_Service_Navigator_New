import 'dart:convert';
import 'package:flutter/foundation.dart';
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
  final String? serviceName;
  final int? serviceProcedureId;

  SupervisorResponseModel({
    required this.answer,
    required this.tone,
    required this.collaborationTrace,
    this.recommendation,
    required this.suggestedFollowups,
    this.serviceName,
    this.serviceProcedureId,
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
      serviceName: json['serviceName'] as String?,
      serviceProcedureId: json['serviceProcedureId'] as int?,
    );
  }
}

class SupervisorAgentService {
  static List<String> get _candidateUrls {
    final primary = '${AppConfig.baseUrl}/orchestrator/chat';
    final list = <String>[primary];
    const local1 = 'http://localhost:5119/api/orchestrator/chat';
    const local2 = 'http://127.0.0.1:5119/api/orchestrator/chat';

    if (!list.contains(local1)) list.add(local1);
    if (!list.contains(local2)) list.add(local2);
    if (!kIsWeb) {
      const emulator = 'http://10.0.2.2:5119/api/orchestrator/chat';
      if (!list.contains(emulator)) list.add(emulator);
    }
    return list;
  }

  static Future<SupervisorResponseModel> ask({
    required String query,
    int? applicationId,
    int? serviceProcedureId,
    String? serviceName,
    int? stage,
    List<Map<String, String>>? history,
  }) async {
    final payload = jsonEncode({
      'query': query,
      'applicationId': applicationId,
      'serviceProcedureId': serviceProcedureId,
      'serviceName': serviceName,
      'stage': stage,
      'platformContext': 'mobile',
      'history': history,
    });

    String lastError = 'No endpoints reachable';
    for (final url in _candidateUrls) {
      try {
        final response = await http
            .post(
              Uri.parse(url),
              headers: {'Content-Type': 'application/json'},
              body: payload,
            )
            .timeout(const Duration(seconds: 25));

        if (response.statusCode == 200) {
          final Map<String, dynamic> data = jsonDecode(response.body);
          return SupervisorResponseModel.fromJson(data);
        } else {
          lastError = 'Endpoint $url returned HTTP ${response.statusCode}';
        }
      } catch (err) {
        lastError = 'Endpoint $url connection error: $err';
      }
    }

    throw Exception(lastError);
  }
}
