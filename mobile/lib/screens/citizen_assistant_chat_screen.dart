import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import '../services/supervisor_agent_service.dart';
import '../theme/app_colors.dart';
import 'agent2_statutory_auditor_screen.dart';
import 'application_form_screen.dart';
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
  String? _activeServiceName;
  int? _activeServiceProcedureId;

  @override
  void initState() {
    super.initState();
    _activeServiceName = widget.serviceName;
    _activeServiceProcedureId = widget.serviceProcedureId;
    _messages.add(
      ChatMessageItem(
        text: widget.serviceName != null
            ? 'Hello! I am your GovNavigator Assistant for **${widget.serviceName}**.\n\nI can help you check mandatory documents, calculate service fees, find counter appointments, or guide you through each step of the process.'
            : 'Hello! I am your official GovNavigator Service Guide.\n\nDescribe what you need in simple words (e.g., "I need to renew my passport urgently" or "What documents do I need for driving license?"), and our 4 specialized guides will assist you.',
        isUser: false,
        timestamp: DateTime.now(),
        followups: widget.serviceName != null
            ? [
                'What documents do I need to bring?',
                'How much is the total statutory fee?',
                'Can I book a counter appointment?',
                'What happens after I submit?',
              ]
            : [
                'What documents for Passport Renewal?',
                'How do I apply for National Identity Card?',
                'What are the fees for Driving License?',
                'How do I get a Birth Certificate?',
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
        serviceProcedureId: _activeServiceProcedureId ?? widget.serviceProcedureId,
        serviceName: _activeServiceName ?? widget.serviceName,
        stage: widget.stage,
        history: history,
      );

      setState(() {
        if (res.serviceName != null && res.serviceName!.isNotEmpty) {
          _activeServiceName = res.serviceName;
        }
        if (res.serviceProcedureId != null && res.serviceProcedureId! > 0) {
          _activeServiceProcedureId = res.serviceProcedureId;
        }
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
      debugPrint('SupervisorAgentService error: $e');
      setState(() {
        _messages.add(ChatMessageItem(
          text: 'I apologize, but I am temporarily unable to reach the public service registry. Please check your internet connection or try again shortly.\n(Details: $e)',
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
                      _buildFormattedText(msg.text, isUser),
                      if (msg.recommendation != null) ...[
                        const SizedBox(height: 10),
                        _buildRecommendationCard(msg.recommendation!),
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

  Widget _buildRecommendationCard(SupervisorRecommendationModel rec) {
    Color bgColor;
    Color borderColor;
    Color textColor;
    IconData icon;

    if (rec.actionType == 'ExploreCatalog') {
      bgColor = const Color(0xFFF0F9FF);
      borderColor = const Color(0xFFBAE6FD);
      textColor = const Color(0xFF0369A1);
      icon = CupertinoIcons.info_circle_fill;
    } else if (rec.actionType == 'CheckEligibility' || rec.actionType == 'AuditEligibility' || rec.actionType == 'ReviewEligibility') {
      bgColor = const Color(0xFFEFF6FF);
      borderColor = const Color(0xFF93C5FD);
      textColor = const Color(0xFF1D4ED8);
      icon = CupertinoIcons.checkmark_shield_fill;
    } else if (rec.actionType == 'UploadDocument' || rec.actionType == 'RequestRevision') {
      bgColor = const Color(0xFFFFFBEB);
      borderColor = const Color(0xFFFDE68A);
      textColor = const Color(0xFFB45309);
      icon = CupertinoIcons.exclamationmark_circle_fill;
    } else {
      bgColor = const Color(0xFFF0FDF4);
      borderColor = const Color(0xFF86EFAC);
      textColor = const Color(0xFF166534);
      icon = CupertinoIcons.checkmark_circle_fill;
    }

    final currentServiceName = _activeServiceName ?? widget.serviceName ?? 'Certificate of Police Clearance';
    final int currentServiceId = (_activeServiceProcedureId != null && _activeServiceProcedureId! > 0)
        ? _activeServiceProcedureId!
        : (widget.serviceProcedureId != null && widget.serviceProcedureId! > 0
            ? widget.serviceProcedureId!
            : 37);

    final bool isEligibilityAction = rec.actionType == 'CheckEligibility' ||
        rec.actionType == 'AuditEligibility' ||
        rec.actionType == 'ReviewEligibility' ||
        rec.actionType == 'UploadDocument' ||
        rec.actionType == 'RequestRevision';

    final bool isBookAppointment = rec.actionType == 'BookAppointment';

    void launchEligibilityCheck() {
      Navigator.push(
        context,
        MaterialPageRoute(
          builder: (context) => Agent2StatutoryAuditorScreen(
            serviceId: currentServiceId,
            serviceName: currentServiceName,
          ),
        ),
      );
    }

    void launchApplication() {
      Navigator.push(
        context,
        MaterialPageRoute(
          builder: (context) => ApplicationFormScreen(
            serviceId: currentServiceId,
            serviceName: currentServiceName,
            stageNumber: widget.stage ?? 1,
            applicationId: widget.applicationId,
          ),
        ),
      );
    }

    void launchBooking() {
      Navigator.push(
        context,
        MaterialPageRoute(
          builder: (context) => BookingOptionsScreen(
            applicationId: widget.applicationId?.toString() ?? '1',
            serviceName: currentServiceName,
          ),
        ),
      );
    }

    final VoidCallback primaryCardTap = isEligibilityAction
        ? launchEligibilityCheck
        : (isBookAppointment ? launchBooking : launchApplication);

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: primaryCardTap,
        borderRadius: BorderRadius.circular(10),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(
            color: bgColor,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: borderColor),
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
              Row(
                children: [
                  Icon(icon, color: textColor, size: 18),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      rec.title,
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        color: textColor,
                      ),
                    ),
                  ),
                  Icon(CupertinoIcons.chevron_right, size: 14, color: textColor.withValues(alpha: 0.7)),
                ],
              ),
              if (rec.rationale.isNotEmpty) ...[
                const SizedBox(height: 6),
                Padding(
                  padding: const EdgeInsets.only(left: 26.0),
                  child: Text(
                    rec.rationale,
                    style: TextStyle(
                      fontSize: 12,
                      height: 1.4,
                      color: textColor.withValues(alpha: 0.95),
                    ),
                  ),
                ),
              ],

              // Action: For all pre-application service inquiries, require Launch Eligibility Check UI first
              if (isBookAppointment) ...[
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: ElevatedButton.icon(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppColors.primary,
                          foregroundColor: Colors.white,
                          elevation: 0,
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
                        ),
                        icon: const Icon(CupertinoIcons.calendar, size: 15),
                        label: const Text(
                          'Book Counter Appointment',
                          style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
                        ),
                        onPressed: launchBooking,
                      ),
                    ),
                    const SizedBox(width: 8),
                    OutlinedButton.icon(
                      style: OutlinedButton.styleFrom(
                        foregroundColor: const Color(0xFF1D4ED8),
                        side: const BorderSide(color: Color(0xFF1D4ED8), width: 1.2),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
                      ),
                      icon: const Icon(CupertinoIcons.checkmark_shield, size: 14),
                      label: const Text(
                        'Audit',
                        style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
                      ),
                      onPressed: launchEligibilityCheck,
                    ),
                  ],
                ),
              ] else if (widget.applicationId != null) ...[
                // If citizen has an existing submitted/draft application
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        style: OutlinedButton.styleFrom(
                          foregroundColor: const Color(0xFF1D4ED8),
                          side: const BorderSide(color: Color(0xFF1D4ED8), width: 1.2),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
                        ),
                        icon: const Icon(CupertinoIcons.checkmark_shield, size: 15),
                        label: const Text(
                          'Eligibility Audit UI',
                          style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
                        ),
                        onPressed: launchEligibilityCheck,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: ElevatedButton.icon(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppColors.primary,
                          foregroundColor: Colors.white,
                          elevation: 0,
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
                        ),
                        icon: const Icon(CupertinoIcons.doc_text, size: 15),
                        label: const Text(
                          'View Application',
                          style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
                        ),
                        onPressed: launchApplication,
                      ),
                    ),
                  ],
                ),
              ] else ...[
                // Statutory Gatekeeper: Citizen must verify statutory eligibility before starting application
                const SizedBox(height: 10),
                SizedBox(
                  width: double.infinity,
                  height: 40,
                  child: ElevatedButton.icon(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF1D4ED8),
                      foregroundColor: Colors.white,
                      elevation: 0,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                    ),
                    icon: const Icon(CupertinoIcons.checkmark_shield_fill, size: 18),
                    label: const Text(
                      'Launch Eligibility Check UI',
                      style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold),
                    ),
                    onPressed: launchEligibilityCheck,
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildFormattedText(String text, bool isUser) {
    if (isUser) {
      return Text(
        text,
        style: const TextStyle(fontSize: 13.5, height: 1.4, color: Colors.white),
      );
    }

    final lines = text.split('\n');
    final widgets = <Widget>[];

    for (int i = 0; i < lines.length; i++) {
      final line = lines[i].trim();
      if (line.isEmpty) {
        widgets.add(const SizedBox(height: 6));
        continue;
      }

      // Heading: ### Heading or ## Heading or # Heading
      if (line.startsWith('### ') || line.startsWith('## ') || line.startsWith('# ')) {
        final headingText = line.replaceFirst(RegExp(r'^#+\s*'), '').trim();
        widgets.add(
          Padding(
            padding: const EdgeInsets.only(top: 4, bottom: 6),
            child: Text(
              headingText,
              style: const TextStyle(
                fontSize: 14.5,
                fontWeight: FontWeight.w700,
                color: Color(0xFF0F172A),
                letterSpacing: -0.2,
              ),
            ),
          ),
        );
        continue;
      }

      // Numbered items: 1. Item, 2. Item
      final numMatch = RegExp(r'^(\d+)\.\s+(.*)$').firstMatch(line);
      if (numMatch != null) {
        final numStr = numMatch.group(1)!;
        final itemText = numMatch.group(2)!;
        widgets.add(
          Padding(
            padding: const EdgeInsets.only(left: 4, bottom: 5),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 18,
                  height: 18,
                  margin: const EdgeInsets.only(top: 2, right: 8),
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: AppColors.primary.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(9),
                  ),
                  child: Text(
                    numStr,
                    style: const TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                      color: AppColors.primary,
                    ),
                  ),
                ),
                Expanded(child: _buildRichInline(itemText, false)),
              ],
            ),
          ),
        );
        continue;
      }

      // Blockquotes or official notices: > text or *Notice:*
      if (line.startsWith('> ') || line.startsWith('*Notice') || line.startsWith('*Administrative')) {
        final quoteText = line.startsWith('> ') ? line.substring(2).trim() : line;
        widgets.add(
          Container(
            margin: const EdgeInsets.symmetric(vertical: 4),
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
            decoration: BoxDecoration(
              color: const Color(0xFFF1F5F9),
              borderRadius: BorderRadius.circular(6),
              border: const Border(
                left: BorderSide(color: AppColors.primary, width: 3),
              ),
            ),
            child: _buildRichInline(quoteText, false),
          ),
        );
        continue;
      }

      // Bullet points: - item, * item, • item
      if (line.startsWith('- ') || line.startsWith('* ') || line.startsWith('• ')) {
        final bulletText = line.substring(2).trim();
        widgets.add(
          Padding(
            padding: const EdgeInsets.only(left: 4, bottom: 4),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Padding(
                  padding: EdgeInsets.only(top: 6, right: 8),
                  child: Icon(Icons.circle, size: 5, color: AppColors.primary),
                ),
                Expanded(
                  child: _buildRichInline(bulletText, false),
                ),
              ],
            ),
          ),
        );
        continue;
      }

      // Standard paragraph line with inline markdown bold (**text**)
      widgets.add(
        Padding(
          padding: const EdgeInsets.only(bottom: 4),
          child: _buildRichInline(line, false),
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: widgets,
    );
  }

  Widget _buildRichInline(String text, bool isUser) {
    final spans = <TextSpan>[];
    final parts = text.split('**');
    for (int i = 0; i < parts.length; i++) {
      if (parts[i].isEmpty) continue;
      final isBold = i % 2 == 1;
      spans.add(
        TextSpan(
          text: parts[i],
          style: TextStyle(
            fontSize: 13.5,
            height: 1.45,
            fontWeight: isBold ? FontWeight.w700 : FontWeight.w400,
            color: isUser
                ? Colors.white
                : (isBold ? const Color(0xFF0F172A) : const Color(0xFF334155)),
          ),
        ),
      );
    }

    return Text.rich(
      TextSpan(children: spans),
    );
  }
}
