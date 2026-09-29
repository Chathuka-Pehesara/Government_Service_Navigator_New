import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/eligibility_agent_model.dart';
import '../services/eligibility_agent_service.dart';
import '../theme/app_colors.dart';
import '../utils/validators.dart';

class Agent2StatutoryAuditorScreen extends ConsumerStatefulWidget {
  final int serviceId;
  final String serviceName;

  const Agent2StatutoryAuditorScreen({
    super.key,
    this.serviceId = 24,
    this.serviceName = 'National Identity Card (NIC) Issuance & Replacement',
  });

  @override
  ConsumerState<Agent2StatutoryAuditorScreen> createState() =>
      _Agent2StatutoryAuditorScreenState();
}

class _Agent2StatutoryAuditorScreenState
    extends ConsumerState<Agent2StatutoryAuditorScreen> {
  late String _selectedService;
  late int _serviceId;

  int _age = 25;
  String _citizenship = 'Sri Lankan';
  String _employment = 'Employed';
  final TextEditingController _incomeController = TextEditingController(text: '500000');

  // Selected document proof tags
  final Set<String> _selectedDocs = {
    'National Identity Card (NIC): nic_copy.pdf',
    'Certified Birth Certificate Extract: birth_certificate.pdf',
  };

  // Quick preset catalog
  final List<({String label, String value})> _presetDocs = const [
    (label: 'NIC Copy', value: 'National Identity Card (NIC): nic_copy.pdf'),
    (label: 'Birth Certificate', value: 'Certified Birth Certificate Extract: birth_certificate.pdf'),
    (label: 'Police Loss Report', value: 'Police Complaint Report for Loss: police_report.pdf'),
    (label: 'NTMI Medical Slip', value: 'Medical Fitness Certificate (NTMI): ntmi_medical.pdf'),
    (label: 'Biometric Photo Slip', value: 'ICAO Biometric Photo Slip: photo_slip.jpg'),
    (label: 'Grama Niladhari Cert', value: 'Grama Niladhari Certificate: gn_residence.pdf'),
  ];

  // Common statutory services
  final List<({int id, String name})> _statutoryServices = const [
    (id: 24, name: 'National Identity Card (NIC) Issuance & Replacement'),
    (id: 1, name: 'Passport Issuance & Renewal (Regular / Urgent)'),
    (id: 2, name: 'Driving License New Application & Renewal'),
    (id: 3, name: 'Police Clearance Certificate Verification'),
  ];

  EligibilityAgentResponse? _auditResult;
  bool _isAuditing = false;
  String? _auditError;

  @override
  void initState() {
    super.initState();
    _serviceId = widget.serviceId;
    _selectedService = widget.serviceName;
  }

  @override
  void dispose() {
    _incomeController.dispose();
    super.dispose();
  }

  Future<void> _executeAudit() async {
    // Income is optional (0 when blank) but must be a sensible number when given
    final incomeText = _incomeController.text.trim().replaceAll(',', '');
    final incomeError = Validators.number(incomeText, field: 'Annual income', required: false, min: 0, max: 1000000000);
    if (incomeError != null) {
      setState(() => _auditError = incomeError);
      return;
    }

    setState(() {
      _isAuditing = true;
      _auditError = null;
    });

    final income = double.tryParse(incomeText) ?? 0.0;

    try {
      final response = await EligibilityAgentService.evaluateEligibility(
        serviceName: _selectedService,
        serviceId: _serviceId,
        age: _age,
        citizenshipStatus: _citizenship,
        annualIncome: income,
        employmentStatus: _employment,
        providedDocuments: _selectedDocs.toList(),
      );

      if (mounted) {
        setState(() {
          _auditResult = response;
          _isAuditing = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _auditError = e.toString().replaceFirst('Exception: ', '');
          _isAuditing = false;
        });
      }
    }
  }

  void _showAddCustomDocDialog() {
    final controller = TextEditingController();
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Add Document Reference'),
        content: TextField(
          controller: controller,
          maxLength: 200,
          decoration: const InputDecoration(
            hintText: 'e.g. Utility_Bill.pdf, Marriage_Cert.jpg',
            labelText: 'Document Name or Reference',
          ),
          autofocus: true,
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () {
              final text = controller.text.trim();
              if (text.isNotEmpty && Validators.text(text, field: 'Document name', max: 200) == null) {
                setState(() => _selectedDocs.add(text));
              }
              Navigator.pop(ctx);
            },
            child: const Text('Add'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF6F8FB),
      appBar: AppBar(
        title: const Text(
          'Agent 2: Statutory Policy Auditor',
          style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
        ),
        backgroundColor: Colors.white,
        foregroundColor: AppColors.dark,
        elevation: 0.5,
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh_rounded),
            tooltip: 'Reset Audit',
            onPressed: () {
              setState(() {
                _auditResult = null;
                _auditError = null;
                _isAuditing = false;
              });
            },
          ),
        ],
      ),
      body: SafeArea(
        child: Align(
          alignment: Alignment.topCenter,
          child: SizedBox(
            width: 760,
            child: SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 16.0),
              physics: const BouncingScrollPhysics(),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // 1. Agent 2 Identity Cockpit Header
                  _buildAgent2Header(),
                  const SizedBox(height: 16),

                  // 2. Target Government Service Selector
                  _buildServiceSelectorSection(),
                  const SizedBox(height: 16),

                  // 3. Citizen Demographics Card
                  _buildDemographicsSection(),
                  const SizedBox(height: 16),

                  // 4. Evidentiary Document Proofs Selector
                  _buildDocumentProofsSection(),
                  const SizedBox(height: 20),

                  // 5. Action Button
                  _buildAuditCTA(),
                  const SizedBox(height: 20),

                  // 6. Audit Determination Results View
                  if (_isAuditing)
                    _buildAuditingStateCard()
                  else if (_auditError != null)
                    _buildErrorCard(_auditError!)
                  else if (_auditResult != null)
                    _buildDeterminationResultCard(_auditResult!),

                  const SizedBox(height: 40),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  // --- UI Components ---

  Widget _buildAgent2Header() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFF0F2042), Color(0xFF1E3A6E), Color(0xFF2B5292)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF0F2042).withValues(alpha: 0.2),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.15),
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Icon(
              Icons.verified_user_rounded,
              size: 26,
              color: Colors.white,
            ),
          ),
          const SizedBox(width: 14),
          const Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text(
                      'Agent 2 Compliance Engine',
                      style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.bold,
                        color: Colors.white,
                      ),
                    ),
                    SizedBox(width: 8),
                    Badge(
                      label: Text('ACTIVE'),
                      backgroundColor: Color(0xFF2E7D5B),
                    ),
                  ],
                ),
                SizedBox(height: 4),
                Text(
                  'Automated pre-screening against Sri Lanka Gazettes, Ministry Circulars & PGVector embeddings.',
                  style: TextStyle(fontSize: 11, color: Colors.white70, height: 1.3),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildServiceSelectorSection() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFE2E8F0)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              Icon(Icons.account_balance, size: 16, color: Color(0xFF1E3A6E)),
              SizedBox(width: 8),
              Text(
                'Select Government Service to Audit',
                style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: Color(0xFF1A202C)),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: _statutoryServices.map((service) {
              final isSelected = _serviceId == service.id;
              return ChoiceChip(
                label: Text(
                  service.name.split('(').first.trim(),
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: isSelected ? FontWeight.bold : FontWeight.w500,
                    color: isSelected ? Colors.white : const Color(0xFF2D3748),
                  ),
                ),
                selected: isSelected,
                selectedColor: const Color(0xFF1E3A6E),
                backgroundColor: const Color(0xFFF1F5F9),
                showCheckmark: false,
                side: BorderSide(
                  color: isSelected ? const Color(0xFF1E3A6E) : const Color(0xFFE2E8F0),
                ),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                onSelected: (val) {
                  if (val) {
                    setState(() {
                      _serviceId = service.id;
                      _selectedService = service.name;
                    });
                  }
                },
              );
            }).toList(),
          ),
        ],
      ),
    );
  }

  Widget _buildDemographicsSection() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFE2E8F0)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              Icon(Icons.person_pin_rounded, size: 16, color: Color(0xFF1E3A6E)),
              SizedBox(width: 8),
              Text(
                'Applicant Statutory Profile',
                style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: Color(0xFF1A202C)),
              ),
            ],
          ),
          const SizedBox(height: 14),

          // Age and Income Row
          Row(
            children: [
              // Age Stepper
              Expanded(
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF8FAFC),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: const Color(0xFFE2E8F0)),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('Applicant Age', style: TextStyle(fontSize: 10, color: Colors.grey)),
                          Text('$_age years', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold)),
                        ],
                      ),
                      Row(
                        children: [
                          InkWell(
                            borderRadius: BorderRadius.circular(16),
                            onTap: _age > 10 ? () => setState(() => _age--) : null,
                            child: const Padding(
                              padding: EdgeInsets.all(4.0),
                              child: Icon(Icons.remove_circle_outline, size: 22, color: Colors.grey),
                            ),
                          ),
                          const SizedBox(width: 8),
                          InkWell(
                            borderRadius: BorderRadius.circular(16),
                            onTap: _age < 100 ? () => setState(() => _age++) : null,
                            child: const Padding(
                              padding: EdgeInsets.all(4.0),
                              child: Icon(Icons.add_circle_outline, size: 22, color: Color(0xFF1E3A6E)),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 10),

              // Income field
              Expanded(
                child: TextField(
                  controller: _incomeController,
                  keyboardType: TextInputType.number,
                  decoration: InputDecoration(
                    labelText: 'Annual Income (LKR)',
                    hintText: '500,000',
                    isDense: true,
                    prefixIcon: const Icon(Icons.payments_outlined, size: 18),
                    filled: true,
                    fillColor: const Color(0xFFF8FAFC),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(10),
                      borderSide: const BorderSide(color: Color(0xFFE2E8F0)),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(10),
                      borderSide: const BorderSide(color: Color(0xFFE2E8F0)),
                    ),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),

          // Citizenship Pills
          const Text('Citizenship Status:', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Colors.grey)),
          const SizedBox(height: 6),
          Wrap(
            spacing: 6,
            children: ['Sri Lankan', 'Dual Citizen', 'Foreign National'].map((c) {
              final isSel = _citizenship == c;
              return ChoiceChip(
                label: Text(c, style: TextStyle(fontSize: 11, color: isSel ? Colors.white : Colors.black87)),
                selected: isSel,
                selectedColor: const Color(0xFF1E3A6E),
                backgroundColor: const Color(0xFFF1F5F9),
                showCheckmark: false,
                onSelected: (val) {
                  if (val) setState(() => _citizenship = c);
                },
              );
            }).toList(),
          ),
          const SizedBox(height: 10),

          // Employment Status
          const Text('Employment Category:', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Colors.grey)),
          const SizedBox(height: 6),
          Wrap(
            spacing: 6,
            children: ['Employed', 'Self-Employed', 'Student', 'Unemployed'].map((e) {
              final isSel = _employment == e;
              return ChoiceChip(
                label: Text(e, style: TextStyle(fontSize: 11, color: isSel ? Colors.white : Colors.black87)),
                selected: isSel,
                selectedColor: const Color(0xFF1E3A6E),
                backgroundColor: const Color(0xFFF1F5F9),
                showCheckmark: false,
                onSelected: (val) {
                  if (val) setState(() => _employment = e);
                },
              );
            }).toList(),
          ),
        ],
      ),
    );
  }

  Widget _buildDocumentProofsSection() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFE2E8F0)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Row(
                children: [
                  Icon(Icons.inventory_2_outlined, size: 16, color: Color(0xFF1E3A6E)),
                  SizedBox(width: 8),
                  Text(
                    'Available Evidentiary Documents',
                    style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: Color(0xFF1A202C)),
                  ),
                ],
              ),
              TextButton.icon(
                onPressed: _showAddCustomDocDialog,
                icon: const Icon(Icons.add, size: 14),
                label: const Text('Custom Ref', style: TextStyle(fontSize: 11)),
                style: TextButton.styleFrom(
                  visualDensity: VisualDensity.compact,
                  foregroundColor: const Color(0xFF1E3A6E),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          const Text(
            'Select document proofs currently held by citizen (tap to toggle):',
            style: TextStyle(fontSize: 11, color: Colors.grey),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: _presetDocs.map((item) {
              final isAttached = _selectedDocs.contains(item.value);
              return FilterChip(
                avatar: Icon(
                  isAttached ? Icons.check_circle : Icons.radio_button_unchecked,
                  size: 14,
                  color: isAttached ? Colors.white : const Color(0xFF1E3A6E),
                ),
                label: Text(
                  item.label,
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: isAttached ? FontWeight.bold : FontWeight.normal,
                    color: isAttached ? Colors.white : const Color(0xFF2D3748),
                  ),
                ),
                selected: isAttached,
                selectedColor: const Color(0xFF1E3A6E),
                backgroundColor: const Color(0xFFF1F5F9),
                showCheckmark: false,
                side: BorderSide(color: isAttached ? const Color(0xFF1E3A6E) : const Color(0xFFE2E8F0)),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                onSelected: (val) {
                  setState(() {
                    if (val) {
                      _selectedDocs.add(item.value);
                    } else {
                      _selectedDocs.remove(item.value);
                    }
                  });
                },
              );
            }).toList(),
          ),
          if (_selectedDocs.isNotEmpty) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: const Color(0xFFF8FAFC),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                children: [
                  const Icon(Icons.check_circle, size: 14, color: Color(0xFF2E7D5B)),
                  const SizedBox(width: 6),
                  Text(
                    '${_selectedDocs.length} document proofs attached for statutory evaluation',
                    style: const TextStyle(fontSize: 11, color: Color(0xFF2E7D5B), fontWeight: FontWeight.bold),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildAuditCTA() {
    return ElevatedButton(
      onPressed: _isAuditing ? null : _executeAudit,
      style: ElevatedButton.styleFrom(
        backgroundColor: const Color(0xFF1E3A6E),
        foregroundColor: Colors.white,
        padding: const EdgeInsets.symmetric(vertical: 16),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        elevation: 2,
      ),
      child: _isAuditing
          ? const Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                SizedBox(
                  height: 18,
                  width: 18,
                  child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                ),
                SizedBox(width: 12),
                Text(
                  'Auditing Statutory Gazettes...',
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold),
                ),
              ],
            )
          : const Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.psychology_rounded, size: 20),
                SizedBox(width: 8),
                Text(
                  'Run Agent 2 Statutory Audit',
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold),
                ),
              ],
            ),
    );
  }

  Widget _buildAuditingStateCard() {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFE2E8F0)),
      ),
      alignment: Alignment.center,
      child: Column(
        children: [
          const CircularProgressIndicator(color: Color(0xFF1E3A6E)),
          const SizedBox(height: 16),
          const Text(
            'Agent 2 Querying Neon PGVector & Groq LLM...',
            style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
          ),
          const SizedBox(height: 6),
          const Text(
            'Retrieving statutory rules from official gazettes and evaluating proof compliance...',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 12, color: Colors.grey),
          ),
        ],
      ),
    );
  }

  Widget _buildErrorCard(String error) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.red.shade50,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.red.shade200),
      ),
      child: Row(
        children: [
          const Icon(Icons.error_outline, color: Colors.red),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              'Audit error: $error',
              style: const TextStyle(fontSize: 12, color: Colors.red),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildDeterminationResultCard(EligibilityAgentResponse result) {
    final isFullyEligible = result.isEligible && result.missingDocuments.isEmpty;
    final hasCriteriaErrors = result.missingCriteria.isNotEmpty;

    final Color statusColor = isFullyEligible
        ? const Color(0xFF2E7D5B)
        : (hasCriteriaErrors ? const Color(0xFFB83A3A) : const Color(0xFFB7791F));

    final String statusTitle = isFullyEligible
        ? 'Statutory Criteria Verified'
        : (hasCriteriaErrors ? 'Statutory Criteria Unmet' : 'Action Required: Incomplete Proofs');

    final IconData statusIcon = isFullyEligible
        ? Icons.verified_rounded
        : (hasCriteriaErrors ? Icons.cancel_rounded : Icons.warning_amber_rounded);

    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: statusColor.withValues(alpha: 0.4), width: 1.5),
        boxShadow: [
          BoxShadow(
            color: statusColor.withValues(alpha: 0.08),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header Verdict Row
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  Icon(statusIcon, color: statusColor, size: 28),
                  const SizedBox(width: 10),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        statusTitle,
                        style: TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.bold,
                          color: statusColor,
                        ),
                      ),
                      Text(
                        'Agent 2 Audit for $_selectedService',
                        style: const TextStyle(fontSize: 11, color: Colors.grey),
                      ),
                    ],
                  ),
                ],
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(
                  color: statusColor,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  '${result.matchPercentage}%',
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.bold,
                    fontSize: 13,
                  ),
                ),
              ),
            ],
          ),
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 12.0),
            child: Divider(height: 1),
          ),

          // Groq LLM Legal Determination
          if (result.reasoning.isNotEmpty) ...[
            const Row(
              children: [
                Icon(Icons.psychology_outlined, size: 16, color: Color(0xFF1E3A6E)),
                SizedBox(width: 6),
                Text(
                  'AI Statutory Reasoning (Groq LLM):',
                  style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFFF8FAFC),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: const Color(0xFFE2E8F0)),
              ),
              child: Text(
                result.reasoning,
                style: const TextStyle(fontSize: 12, height: 1.45, color: Color(0xFF2D3748)),
              ),
            ),
            const SizedBox(height: 14),
          ],

          // Missing Legal Criteria
          if (hasCriteriaErrors) ...[
            const Text(
              'Statutory Criteria Not Met:',
              style: TextStyle(fontWeight: FontWeight.bold, color: Color(0xFFB83A3A), fontSize: 12),
            ),
            const SizedBox(height: 6),
            ...result.missingCriteria.map((c) => Padding(
                  padding: const EdgeInsets.only(bottom: 4.0),
                  child: Row(
                    children: [
                      const Icon(Icons.close, size: 14, color: Color(0xFFB83A3A)),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(c, style: const TextStyle(color: Color(0xFFB83A3A), fontSize: 12)),
                      ),
                    ],
                  ),
                )),
            const SizedBox(height: 10),
          ],

          // Missing Documents
          if (result.missingDocuments.isNotEmpty) ...[
            const Text(
              'Missing Required Proofs for Application:',
              style: TextStyle(fontWeight: FontWeight.bold, color: Color(0xFFB7791F), fontSize: 12),
            ),
            const SizedBox(height: 6),
            ...result.missingDocuments.map((doc) => Padding(
                  padding: const EdgeInsets.only(bottom: 4.0),
                  child: Row(
                    children: [
                      const Icon(Icons.pending_actions, size: 14, color: Color(0xFFB7791F)),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(
                          doc,
                          style: const TextStyle(
                            color: Color(0xFFB7791F),
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ],
                  ),
                )),
            const SizedBox(height: 10),
          ] else ...[
            const Row(
              children: [
                Icon(Icons.verified, color: Color(0xFF2E7D5B), size: 16),
                SizedBox(width: 6),
                Text(
                  'All required statutory documents verified!',
                  style: TextStyle(color: Color(0xFF2E7D5B), fontWeight: FontWeight.bold, fontSize: 12),
                ),
              ],
            ),
            const SizedBox(height: 10),
          ],

          // PGVector Gazette Snippets
          if (result.retrievedContextSnippets.isNotEmpty) ...[
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 8.0),
              child: Divider(height: 1),
            ),
            const Row(
              children: [
                Icon(Icons.gavel_rounded, size: 16, color: Color(0xFF1E3A6E)),
                SizedBox(width: 6),
                Text(
                  'Sri Lanka Gazette & Circular Provisions (PGVector):',
                  style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12),
                ),
              ],
            ),
            const SizedBox(height: 8),
            ...result.retrievedContextSnippets.take(2).map((snippet) => Container(
                  margin: const EdgeInsets.only(bottom: 6),
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: const Color(0xFF1E3A6E).withValues(alpha: 0.05),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: const Color(0xFF1E3A6E).withValues(alpha: 0.15)),
                  ),
                  child: Text(
                    snippet,
                    style: const TextStyle(fontSize: 11, fontStyle: FontStyle.italic, color: Color(0xFF1A202C)),
                  ),
                )),
          ],
        ],
      ),
    );
  }
}
