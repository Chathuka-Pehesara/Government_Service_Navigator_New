import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import '../services/supervisor_agent_service.dart';
import '../theme/app_colors.dart';
import 'booking_options_screen.dart';

class ChatMessageItem {
  final String text;
  final bool isUser;
  final DateTime timestamp;
  final List<AgentExecutionTraceItemModel>? trace;
  final SupervisorRecommendationModel? recommendation;
  final List<String>? followups;

  ChatMessageItem({
    required this.text,
    required this.isUser,
    required this.timestamp,
    this.trace,
    this.recommendation,
    this.followups,
  });
}

class CitizenAssistantChatScreen extends StatefulWidget {
  final int? applicationId;
  final int? serviceProcedureId;
  final String? serviceName;
  final int? stage;

  const CitizenAssistantChatScreen({
    super.key,
    this.applicationId,
    this.serviceProcedureId,
    this.serviceName,
    this.stage,
  });

  @override
  State<CitizenAssistantChatScreen> createState() => _CitizenAssistantChatScreenState();
}

class _CitizenAssistantChatScreenState extends State<CitizenAssistantChatScreen> {
  final TextEditingController _controller = TextEditingController();
  final ScrollController _scrollController = ScrollController();
  final List<ChatMessageItem> _messages = [];
  bool _isLoading = false;

  @override
  void initState() {
    super.initState();
    _messages.add(
      ChatMessageItem(
        text: widget.serviceName != null
            ? 'Hello! I am your GovNavigator Assistant for **${widget.serviceName}**.\n\nI can help you check mandatory documents, calculate service fees, find counter appointments, or guide you through each step of the process.'
            : 'Hello! I am your official GovNavigator Service Guide.\n\nDescribe what you need in simple words (e.g., "I need to renew my passport urgently" or "What documents do I need for driving license?"), and our 4 specialized guides will assist you.',
        isUser: false,
        timestamp: DateTime.now(),
        followups: [
          'What documents do I need to bring?',
          'How much is the total statutory fee?',
          'Can I book a counter appointment?',
          'What happens after I submit?',
        ],
      ),
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });
  }

  Future<void> _sendMessage([String? presetText]) async {
    final text = (presetText ?? _controller.text).trim();
    if (text.isEmpty || _isLoading) return;

    _controller.clear();
    setState(() {
      _messages.add(ChatMessageItem(
        text: text,
        isUser: true,
        timestamp: DateTime.now(),
      ));
      _isLoading = true;
    });
    _scrollToBottom();

    try {
      final history = _messages
          .where((m) => m.text.isNotEmpty)
          .take(6)
          .map((m) => {'role': m.isUser ? 'user' : 'assistant', 'content': m.text})
          .toList();

      final res = await SupervisorAgentService.ask(
        query: text,
        applicationId: widget.applicationId,
        serviceProcedureId: widget.serviceProcedureId,
        stage: widget.stage,
        history: history,
      );

      setState(() {
        _messages.add(ChatMessageItem(
          text: res.answer,
          isUser: false,
          timestamp: DateTime.now(),
          trace: res.collaborationTrace,
          recommendation: res.recommendation,
          followups: res.suggestedFollowups,
        ));
        _isLoading = false;
      });
      _scrollToBottom();
    } catch (e) {
      setState(() {
        _messages.add(ChatMessageItem(
          text: 'I apologize, but I am temporarily unable to reach the public service registry. Please check your internet connection or try again shortly.',
          isUser: false,
          timestamp: DateTime.now(),
        ));
        _isLoading = false;
      });
      _scrollToBottom();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF7F9FC),
      appBar: AppBar(
        elevation: 0.5,
        backgroundColor: Colors.white,
        leading: IconButton(
          icon: const Icon(CupertinoIcons.back, color: AppColors.dark),
          onPressed: () => Navigator.pop(context),
        ),
        title: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(6),
              decoration: BoxDecoration(
                color: AppColors.primary.withValues(alpha: 0.1),
                shape: BoxShape.circle,
              ),
              child: const Icon(
                CupertinoIcons.sparkles,
                color: AppColors.primary,
                size: 20,
              ),
            ),
            const SizedBox(width: 10),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'GovNavigator Guide',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    color: AppColors.dark,
                  ),
                ),
                Text(
                  widget.serviceName ?? 'Official Citizen Support',
                  style: const TextStyle(
                    fontSize: 11,
                    color: AppColors.secondaryLabel,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
      body: Column(
        children: [
          // 4 Sub-Agent Status Bar
          Container(
            color: Colors.white,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceAround,
              children: [
                _buildAgentChip('1. Pathway', CupertinoIcons.compass, true),
                _buildAgentChip('2. Documents', CupertinoIcons.doc_text, true),
                _buildAgentChip('3. Fees & Slots', CupertinoIcons.creditcard, true),
                _buildAgentChip('4. Safety', CupertinoIcons.shield_lefthalf_fill, true),
              ],
            ),
          ),
          const Divider(height: 1, thickness: 1, color: Color(0xFFE8EEF5)),

          // Chat Messages List
          Expanded(
            child: ListView.builder(
              controller: _scrollController,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              itemCount: _messages.length,
              itemBuilder: (context, index) {
                final msg = _messages[index];
                return _buildMessageBubble(msg);
              },
            ),
          ),

          if (_isLoading)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: Row(
                children: const [
                  CupertinoActivityIndicator(radius: 8),
                  SizedBox(width: 8),
                  Text(
                    'Our guides are checking official regulations...',
                    style: TextStyle(fontSize: 12, color: AppColors.secondaryLabel),
                  ),
                ],
              ),
            ),

          // Input Bar
          Container(
            padding: EdgeInsets.only(
              left: 16,
              right: 16,
              top: 10,
              bottom: MediaQuery.of(context).padding.bottom + 10,
            ),
            decoration: BoxDecoration(
              color: Colors.white,
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.04),
                  blurRadius: 10,
                  offset: const Offset(0, -2),
                ),
              ],
            ),
            child: Row(
              children: [
                Expanded(
                  child: Container(
                    decoration: BoxDecoration(
                      color: const Color(0xFFF0F4F8),
                      borderRadius: BorderRadius.circular(24),
                    ),
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: TextField(
                      controller: _controller,
                      minLines: 1,
                      maxLines: 4,
                      style: const TextStyle(fontSize: 14, color: AppColors.dark),
                      decoration: const InputDecoration(
                        hintText: 'Ask about requirements, fees, or steps...',
                        hintStyle: TextStyle(fontSize: 13, color: AppColors.secondaryLabel),
                        border: InputBorder.none,
                      ),
                      onSubmitted: (_) => _sendMessage(),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                IconButton(
                  icon: Container(
                    padding: const EdgeInsets.all(10),
                    decoration: const BoxDecoration(
                      color: AppColors.primary,
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(
                      CupertinoIcons.arrow_up,
                      color: Colors.white,
                      size: 16,
                    ),
                  ),
                  onPressed: _sendMessage,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildAgentChip(String label, IconData icon, bool active) {
    return Row(
      children: [
        Icon(icon, size: 12, color: active ? AppColors.primary : Colors.grey),
        const SizedBox(width: 4),
        Text(
          label,
          style: TextStyle(
            fontSize: 10,
            fontWeight: active ? FontWeight.w600 : FontWeight.w400,
            color: active ? AppColors.primary : Colors.grey,
          ),
        ),
      ],
    );
  }

  Widget _buildMessageBubble(ChatMessageItem msg) {
    final isUser = msg.isUser;
    return Padding(
      padding: const EdgeInsets.only(bottom: 12.0),
      child: Column(
        crossAxisAlignment: isUser ? CrossAxisAlignment.end : CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: isUser ? MainAxisAlignment.end : MainAxisAlignment.start,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (!isUser) ...[
                const CircleAvatar(
                  radius: 14,
                  backgroundColor: AppColors.primary,
                  child: Icon(CupertinoIcons.sparkles, color: Colors.white, size: 14),
                ),
                const SizedBox(width: 8),
              ],
              Flexible(
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  decoration: BoxDecoration(
                    color: isUser ? AppColors.primary : Colors.white,
                    borderRadius: BorderRadius.only(
                      topLeft: const Radius.circular(16),
                      topRight: const Radius.circular(16),
                      bottomLeft: Radius.circular(isUser ? 16 : 4),
                      bottomRight: Radius.circular(isUser ? 4 : 16),
                    ),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withValues(alpha: 0.03),
                        blurRadius: 6,
                        offset: const Offset(0, 2),
                      ),
                    ],
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        msg.text,
                        style: TextStyle(
                          fontSize: 13.5,
                          height: 1.4,
                          color: isUser ? Colors.white : AppColors.dark,
                        ),
                      ),
                      if (msg.recommendation != null) ...[
                        const SizedBox(height: 8),
                        Container(
                          padding: const EdgeInsets.all(10),
                          decoration: BoxDecoration(
                            color: const Color(0xFFF0FDF4),
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(color: const Color(0xFF86EFAC)),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  const Icon(CupertinoIcons.checkmark_circle_fill, color: Colors.green, size: 16),
                                  const SizedBox(width: 6),
                                  Expanded(
                                    child: Text(
                                      msg.recommendation!.title,
                                      style: const TextStyle(
                                        fontSize: 12,
                                        fontWeight: FontWeight.w600,
                                        color: Color(0xFF166534),
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                              if (msg.recommendation!.rationale.isNotEmpty) ...[
                                const SizedBox(height: 4),
                                Text(
                                  msg.recommendation!.rationale,
                                  style: const TextStyle(fontSize: 11, color: Color(0xFF15803D)),
                                ),
                              ],
                              if (msg.recommendation!.actionType == 'BookAppointment' && widget.applicationId != null) ...[
                                const SizedBox(height: 8),
                                SizedBox(
                                  width: double.infinity,
                                  height: 32,
                                  child: ElevatedButton.icon(
                                    style: ElevatedButton.styleFrom(
                                      backgroundColor: AppColors.primary,
                                      foregroundColor: Colors.white,
                                      elevation: 0,
                                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
                                      padding: const EdgeInsets.symmetric(horizontal: 10),
                                    ),
                                    icon: const Icon(CupertinoIcons.calendar, size: 14),
                                    label: const Text('Book Counter Appointment', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600)),
                                    onPressed: () {
                                      Navigator.push(
                                        context,
                                        MaterialPageRoute(
                                          builder: (context) => BookingOptionsScreen(
                                            applicationId: widget.applicationId.toString(),
                                            serviceName: widget.serviceName ?? 'Government Service',
                                          ),
                                        ),
                                      );
                                    },
                                  ),
                                ),
                              ],
                            ],
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ),
            ],
          ),

          // Follow-up chips
          if (msg.followups != null && msg.followups!.isNotEmpty && !isUser) ...[
            const SizedBox(height: 8),
            Padding(
              padding: const EdgeInsets.only(left: 36.0),
              child: Wrap(
                spacing: 6,
                runSpacing: 6,
                children: msg.followups!.map((chip) {
                  return InkWell(
                    onTap: () => _sendMessage(chip),
                    borderRadius: BorderRadius.circular(14),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: AppColors.primary.withValues(alpha: 0.3)),
                      ),
                      child: Text(
                        chip,
                        style: const TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w500,
                          color: AppColors.primary,
                        ),
                      ),
                    ),
                  );
                }).toList(),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
