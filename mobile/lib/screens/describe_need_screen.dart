import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../providers/agent_providers.dart';
import '../utils/validators.dart';
import 'intake_plan_result_screen.dart';

class DescribeNeedScreen extends ConsumerStatefulWidget {
  const DescribeNeedScreen({super.key});

  @override
  ConsumerState<DescribeNeedScreen> createState() => _DescribeNeedScreenState();
}

class _DescribeNeedScreenState extends ConsumerState<DescribeNeedScreen> {
  final _textController = TextEditingController();

  Future<void> _submitNeed() async {
    final queryText = _textController.text.trim();
    // Same limits as the backend's UserQueryDto
    final problem = queryText.isEmpty
        ? 'Please describe what service you need.'
        : Validators.text(queryText, field: 'Your description', min: 2, max: 1000);
    if (problem != null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(problem)),
      );
      return;
    }

    final intakePlan = await ref.read(intakeAgentControllerProvider.notifier).ask(queryText);
    if (!mounted) return;

    if (intakePlan != null) {
      Navigator.push(
        context,
        MaterialPageRoute(
          builder: (context) => IntakePlanResultScreen(intakePlan: intakePlan),
        ),
      );
    } else {
      final error = ref.read(intakeAgentControllerProvider).error;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to consult agent: $error')),
      );
    }
  }

  @override
  void dispose() {
    _textController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isLoading = ref.watch(intakeAgentControllerProvider).isLoading;

    return Scaffold(
      appBar: AppBar(title: const Text('Describe Your Need')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text(
              'Tell us what you need help with, and our navigator will match you to the right procedure.',
              style: TextStyle(fontSize: 16),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _textController,
              maxLines: 5,
              maxLength: 1000,
              enabled: !isLoading,
              decoration: const InputDecoration(
                hintText: 'e.g., I need to travel next month but my passport is expired...',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 24),
            ElevatedButton(
              onPressed: isLoading ? null : _submitNeed,
              style: ElevatedButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 14),
              ),
              child: isLoading
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text('Find Matching Services', style: TextStyle(fontSize: 16)),
            ),
          ],
        ),
      ),
    );
  }
}
