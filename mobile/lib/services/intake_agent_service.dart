import 'dart:convert';
import 'package:http/http.dart' as http;
import '../config/app_config.dart';
import '../models/intake_plan_model.dart';

class IntakeAgentService {
  static String get _backendUrl => '${AppConfig.baseUrl}/intakeagent/ask';

  /// Sends the citizen's plain-language need to the intake agent and returns the matched plan.
  static Future<IntakePlanModel> ask(String text) async {
    final response = await http.post(
      Uri.parse(_backendUrl),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'text': text}),
    );

    if (response.statusCode == 200) {
      final Map<String, dynamic> data = jsonDecode(response.body);
      return IntakePlanModel.fromJson(data);
    }
    throw Exception('Server error: ${response.statusCode}');
  }
}
