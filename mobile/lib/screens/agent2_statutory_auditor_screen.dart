import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:file_picker/file_picker.dart';
import '../models/eligibility_agent_model.dart';
import '../services/eligibility_agent_service.dart';
import '../theme/app_colors.dart';
import '../utils/validators.dart';
import '../providers/catalog_providers.dart';

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

  // Uploaded evidentiary documents for statutory audit
  final Set<String> _selectedDocs = {};
  bool _isPickingFiles = false;

  Future<void> _pickFiles() async {
    setState(() => _isPickingFiles = true);
    try {
      final files = await FilePicker.pickFiles(
        type: FileType.custom,
        allowedExtensions: const ['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx'],
      );

      if (files.isNotEmpty) {
        setState(() {
          for (final file in files) {
            final name = file.name.trim();
            if (name.isNotEmpty) {
              _selectedDocs.add(name);
            }
          }
          _auditResult = null;
          _auditError = null;
        });
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to select file: $e')),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isPickingFiles = false);
      }
    }
  }

  // Pagination for service selector (show 4 at a time)
  int _servicePageIndex = 0;
  static const int _servicesPerPage = 4;

  List<({int id, String name})> _getAvailableServices(List<Map<String, dynamic>>? liveServices) {
    if (liveServices == null || liveServices.isEmpty) {
      return const [];
    }
    return liveServices
        .where((s) => s['status'] != 'Retired')
        .map((s) {
          final id = (s['id'] as num?)?.toInt() ?? 0;
          final name = (s['name'] as String?)?.trim() ?? '';
          return (id: id, name: name);
        })
        .where((s) => s.id > 0 && s.name.isNotEmpty)
        .toList();
  }

  int _pageForService(List<({int id, String name})> services, int id) {
    final idx = services.indexWhere((s) => s.id == id);
    if (idx >= 0) {
      return (idx / _servicesPerPage).floor();
    }
    return 0;
  }

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
    final servicesAsync = ref.watch(servicesProvider);
    final allServices = _getAvailableServices(servicesAsync.asData?.value);

    return Scaffold(
      backgroundColor: const Color(0xFFF6F8FB),
      appBar: AppBar(
        title: const Text(
          'Statutory Eligibility & Compliance Auditor',
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

                  // 2. Target Government Service Selector (4 at a time + Next Services button)
                  _buildServiceSelectorSection(allServices),
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
                      'Statutory Compliance Auditor',
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

  Widget _buildServiceSelectorSection(List<({int id, String name})> allServices) {
    if (allServices.isEmpty) {
      return Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: const Color(0xFFE2E8F0)),
        ),
        child: const Center(
          child: Padding(
            padding: EdgeInsets.symmetric(vertical: 8),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                SizedBox(
                  width: 14,
                  height: 14,
                  child: CircularProgressIndicator(strokeWidth: 2, color: Color(0xFF1E3A6E)),
                ),
                SizedBox(width: 10),
                Text(
                  'Loading system services...',
                  style: TextStyle(fontSize: 12, color: Color(0xFF64748B)),
                ),
              ],
            ),
          ),
        ),
      );
    }

    final totalPages = (allServices.length / _servicesPerPage).ceil().clamp(1, 999);
    final safePage = _servicePageIndex.clamp(0, totalPages - 1);
    final startIndex = safePage * _servicesPerPage;
    final endIndex = (startIndex + _servicesPerPage).clamp(0, allServices.length);
    final currentFourServices = allServices.sublist(startIndex, endIndex);
    final isCurrentSelectionVisible = currentFourServices.any((s) => s.id == _serviceId);

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
            children: [
              const Expanded(
                child: Row(
                  children: [
                    Icon(Icons.account_balance, size: 16, color: Color(0xFF1E3A6E)),
                    SizedBox(width: 8),
                    Flexible(
                      child: Text(
                        'Select Service to Audit',
                        style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: Color(0xFF1A202C)),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 6),
              InkWell(
                onTap: () => _showAllServicesBottomSheet(allServices),
                borderRadius: BorderRadius.circular(8),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: const Color(0xFFEFF6FF),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: const Color(0xFFBFDBFE)),
                  ),
                  child: const Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.format_list_bulleted_rounded, size: 13, color: Color(0xFF1E3A6E)),
                      SizedBox(width: 4),
                      Text(
                        'All Services',
                        style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Color(0xFF1E3A6E)),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),

          // If current selection is on a different page, show an active selection indicator with quick jump
          if (!isCurrentSelectionVisible) ...[
            InkWell(
              onTap: () {
                final targetPage = _pageForService(allServices, _serviceId);
                setState(() => _servicePageIndex = targetPage);
              },
              borderRadius: BorderRadius.circular(8),
              child: Container(
                margin: const EdgeInsets.only(bottom: 10),
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: const Color(0xFFF1F5F9),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: const Color(0xFFCBD5E1)),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.check_circle_rounded, size: 14, color: Color(0xFF1E3A6E)),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        'Active Selection: ${_selectedService.split('(').first.trim()}',
                        style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: Color(0xFF1E3A6E)),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    const Text(
                      'View page →',
                      style: TextStyle(fontSize: 10, color: Color(0xFF2563EB), fontWeight: FontWeight.bold),
                    ),
                  ],
                ),
              ),
            ),
          ],

          // Display only 4 services at a time
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: currentFourServices.map((service) {
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
                      _auditResult = null;
                      _auditError = null;
                    });
                  }
                },
              );
            }).toList(),
          ),

          const SizedBox(height: 14),

          // Navigation controls: Indicator and Button to move to next available services
          Container(
            padding: const EdgeInsets.only(top: 10),
            decoration: const BoxDecoration(
              border: Border(top: BorderSide(color: Color(0xFFF1F5F9))),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  '${startIndex + 1}–$endIndex of ${allServices.length} services (Page ${safePage + 1}/$totalPages)',
                  style: const TextStyle(
                    fontSize: 11,
                    color: Color(0xFF64748B),
                    fontWeight: FontWeight.w600,
                  ),
                ),

                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (totalPages > 1) ...[
                      // Previous services button
                      IconButton(
                        onPressed: safePage > 0
                            ? () => setState(() => _servicePageIndex = safePage - 1)
                            : null,
                        icon: const Icon(Icons.chevron_left_rounded, size: 20),
                        tooltip: 'Previous Services',
                        style: IconButton.styleFrom(
                          padding: const EdgeInsets.all(4),
                          minimumSize: const Size(32, 32),
                          backgroundColor: safePage > 0 ? const Color(0xFFF1F5F9) : const Color(0xFFF8FAFC),
                          foregroundColor: safePage > 0 ? const Color(0xFF1E3A6E) : const Color(0xFFCBD5E1),
                        ),
                      ),
                      const SizedBox(width: 8),

                      // Next services button
                      ElevatedButton.icon(
                        onPressed: () {
                          setState(() {
                            _servicePageIndex = (safePage + 1) % totalPages;
                          });
                        },
                        icon: const Icon(Icons.arrow_forward_rounded, size: 14),
                        label: Text(
                          safePage < totalPages - 1 ? 'Next Services' : 'First Services',
                          style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold),
                        ),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF1E3A6E),
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                          elevation: 0,
                          minimumSize: const Size(0, 32),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                        ),
                      ),
                    ],
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  void _showAllServicesBottomSheet(List<({int id, String name})> allServices) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) {
        String filterQuery = '';
        return StatefulBuilder(
          builder: (context, setModalState) {
            final filtered = filterQuery.trim().isEmpty
                ? allServices
                : allServices
                    .where((s) => s.name.toLowerCase().contains(filterQuery.toLowerCase()))
                    .toList();

            return DraggableScrollableSheet(
              initialChildSize: 0.7,
              minChildSize: 0.4,
              maxChildSize: 0.9,
              expand: false,
              builder: (context, scrollController) {
                return Padding(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
                  child: Column(
                    children: [
                      Center(
                        child: Container(
                          width: 40,
                          height: 4,
                          decoration: BoxDecoration(
                            color: const Color(0xFFCBD5E1),
                            borderRadius: BorderRadius.circular(2),
                          ),
                        ),
                      ),
                      const SizedBox(height: 12),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          const Text(
                            'Select Government Service',
                            style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold, color: Color(0xFF0F172A)),
                          ),
                          IconButton(
                            icon: const Icon(Icons.close, size: 20),
                            onPressed: () => Navigator.pop(ctx),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      TextField(
                        decoration: InputDecoration(
                          hintText: 'Search government services...',
                          hintStyle: const TextStyle(fontSize: 13, color: Color(0xFF94A3B8)),
                          prefixIcon: const Icon(Icons.search, size: 18, color: Color(0xFF64748B)),
                          filled: true,
                          fillColor: const Color(0xFFF8FAFC),
                          contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(10),
                            borderSide: const BorderSide(color: Color(0xFFE2E8F0)),
                          ),
                          enabledBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(10),
                            borderSide: const BorderSide(color: Color(0xFFE2E8F0)),
                          ),
                        ),
                        onChanged: (val) => setModalState(() => filterQuery = val),
                      ),
                      const SizedBox(height: 12),
                      Expanded(
                        child: filtered.isEmpty
                            ? const Center(
                                child: Text('No matching services found.', style: TextStyle(color: Color(0xFF64748B))),
                              )
                            : ListView.separated(
                                controller: scrollController,
                                itemCount: filtered.length,
                                separatorBuilder: (context, index) => const Divider(height: 1, color: Color(0xFFF1F5F9)),
                                itemBuilder: (context, idx) {
                                  final s = filtered[idx];
                                  final isSelected = s.id == _serviceId;
                                  return ListTile(
                                    contentPadding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                                    leading: CircleAvatar(
                                      radius: 16,
                                      backgroundColor: isSelected ? const Color(0xFF1E3A6E) : const Color(0xFFF1F5F9),
                                      child: Icon(
                                        Icons.account_balance_outlined,
                                        size: 16,
                                        color: isSelected ? Colors.white : const Color(0xFF64748B),
                                      ),
                                    ),
                                    title: Text(
                                      s.name,
                                      style: TextStyle(
                                        fontSize: 13,
                                        fontWeight: isSelected ? FontWeight.bold : FontWeight.w500,
                                        color: isSelected ? const Color(0xFF1E3A6E) : const Color(0xFF1E293B),
                                      ),
                                    ),
                                    trailing: isSelected
                                        ? const Icon(Icons.check_circle_rounded, color: Color(0xFF1E3A6E), size: 20)
                                        : null,
                                    onTap: () {
                                      final targetPage = _pageForService(allServices, s.id);
                                      setState(() {
                                        _serviceId = s.id;
                                        _selectedService = s.name;
                                        _servicePageIndex = targetPage;
                                        _auditResult = null;
                                        _auditError = null;
                                      });
                                      Navigator.pop(ctx);
                                    },
                                  );
                                },
                              ),
                      ),
                    ],
                  ),
                );
              },
            );
          },
        );
      },
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
            children: [
              const Expanded(
                child: Row(
                  children: [
                    Icon(Icons.upload_file_rounded, size: 16, color: Color(0xFF1E3A6E)),
                    SizedBox(width: 8),
                    Flexible(
                      child: Text(
                        'Upload Evidentiary Documents',
                        style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: Color(0xFF1A202C)),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
              ),
              TextButton.icon(
                onPressed: _showAddCustomDocDialog,
                icon: const Icon(Icons.edit_note_rounded, size: 16),
                label: const Text('Add Name', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold)),
                style: TextButton.styleFrom(
                  visualDensity: VisualDensity.compact,
                  foregroundColor: const Color(0xFF1E3A6E),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          const Text(
            'Directly attach citizen proof files (PDF, JPG, PNG) to verify statutory compliance:',
            style: TextStyle(fontSize: 11, color: Color(0xFF64748B)),
          ),
          const SizedBox(height: 12),

          // Upload action banner
          InkWell(
            onTap: _isPickingFiles ? null : _pickFiles,
            borderRadius: BorderRadius.circular(10),
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 16),
              decoration: BoxDecoration(
                color: const Color(0xFFF8FAFC),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: const Color(0xFFCBD5E1)),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  if (_isPickingFiles) ...[
                    const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Color(0xFF1E3A6E)),
                    ),
                    const SizedBox(width: 10),
                    const Text(
                      'Opening device files...',
                      style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Color(0xFF1E3A6E)),
                    ),
                  ] else ...[
                    const Icon(Icons.cloud_upload_outlined, size: 20, color: Color(0xFF1E3A6E)),
                    const SizedBox(width: 8),
                    const Text(
                      'Browse & Upload Documents (PDF, Images)',
                      style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Color(0xFF1E3A6E)),
                    ),
                  ],
                ],
              ),
            ),
          ),

          // Attached documents list
          if (_selectedDocs.isEmpty) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFFFFFBEB),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: const Color(0xFFFDE68A)),
              ),
              child: const Row(
                children: [
                  Icon(Icons.info_outline_rounded, size: 16, color: Color(0xFFB45309)),
                  SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'No documents attached yet. The statutory auditor will verify eligibility once files are attached.',
                      style: TextStyle(fontSize: 11, color: Color(0xFF92400E)),
                    ),
                  ),
                ],
              ),
            ),
          ] else ...[
            const SizedBox(height: 14),
            Text(
              'Attached Documents (${_selectedDocs.length}):',
              style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Color(0xFF334155)),
            ),
            const SizedBox(height: 8),
            ListView.separated(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: _selectedDocs.length,
              separatorBuilder: (context, index) => const SizedBox(height: 6),
              itemBuilder: (context, idx) {
                final docName = _selectedDocs.elementAt(idx);
                final isPdf = docName.toLowerCase().endsWith('.pdf');
                final isImage = docName.toLowerCase().endsWith('.jpg') ||
                    docName.toLowerCase().endsWith('.jpeg') ||
                    docName.toLowerCase().endsWith('.png');

                return Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF8FAFC),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: const Color(0xFFE2E8F0)),
                  ),
                  child: Row(
                    children: [
                      CircleAvatar(
                        radius: 14,
                        backgroundColor: isPdf ? const Color(0xFFFEE2E2) : (isImage ? const Color(0xFFE0E7FF) : const Color(0xFFDCFCE7)),
                        child: Icon(
                          isPdf ? Icons.picture_as_pdf_outlined : (isImage ? Icons.image_outlined : Icons.description_outlined),
                          size: 15,
                          color: isPdf ? const Color(0xFFDC2626) : (isImage ? const Color(0xFF4338CA) : const Color(0xFF15803D)),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              docName,
                              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Color(0xFF1E293B)),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                            const Text(
                              'Attached document ready for statutory audit',
                              style: TextStyle(fontSize: 10, color: Color(0xFF64748B)),
                            ),
                          ],
                        ),
                      ),
                      IconButton(
                        icon: const Icon(Icons.delete_outline_rounded, size: 18, color: Color(0xFFEF4444)),
                        tooltip: 'Remove document',
                        visualDensity: VisualDensity.compact,
                        padding: EdgeInsets.zero,
                        constraints: const BoxConstraints(),
                        onPressed: () {
                          setState(() {
                            _selectedDocs.remove(docName);
                            _auditResult = null;
                            _auditError = null;
                          });
                        },
                      ),
                    ],
                  ),
                );
              },
            ),
            const SizedBox(height: 10),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  '${_selectedDocs.length} files attached',
                  style: const TextStyle(fontSize: 11, color: Color(0xFF15803D), fontWeight: FontWeight.bold),
                ),
                TextButton(
                  onPressed: () {
                    setState(() {
                      _selectedDocs.clear();
                      _auditResult = null;
                      _auditError = null;
                    });
                  },
                  style: TextButton.styleFrom(
                    visualDensity: VisualDensity.compact,
                    foregroundColor: const Color(0xFFEF4444),
                  ),
                  child: const Text('Clear All', style: TextStyle(fontSize: 11)),
                ),
              ],
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
                  'Run Statutory Eligibility Audit',
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
      child: const Column(
        children: [
          CircularProgressIndicator(color: Color(0xFF1E3A6E)),
          SizedBox(height: 16),
          Text(
            'Querying Official Gazettes & Legal Engine...',
            style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
          ),
          SizedBox(height: 6),
          Text(
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
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Icon(statusIcon, color: statusColor, size: 28),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      statusTitle,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                        color: statusColor,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'Statutory Procedure: $_selectedService',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 11.5, color: Color(0xFF64748B)),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                decoration: BoxDecoration(
                  color: statusColor.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: statusColor.withValues(alpha: 0.3)),
                ),
                child: Text(
                  '${result.matchPercentage}%',
                  style: TextStyle(
                    color: statusColor,
                    fontWeight: FontWeight.w700,
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
            _buildStyledReasoning(result.reasoning),
            const SizedBox(height: 14),
          ],

          // Missing Legal Criteria
          if (hasCriteriaErrors) ...[
            _buildStyledCriteriaList(result.missingCriteria),
            const SizedBox(height: 12),
          ],

          // Missing Documents
          if (result.missingDocuments.isNotEmpty) ...[
            _buildStyledMissingDocsList(result.missingDocuments),
            const SizedBox(height: 12),
          ] else ...[
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              decoration: BoxDecoration(
                color: const Color(0xFFF0FDF4),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: const Color(0xFFBBF7D0)),
              ),
              child: const Row(
                children: [
                  Icon(Icons.verified_rounded, color: Color(0xFF16A34A), size: 20),
                  SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Statutory Compliance Satisfied',
                          style: TextStyle(
                            color: Color(0xFF166534),
                            fontWeight: FontWeight.bold,
                            fontSize: 13,
                          ),
                        ),
                        SizedBox(height: 2),
                        Text(
                          'All mandatory evidentiary attachments and eligibility criteria verified.',
                          style: TextStyle(
                            color: Color(0xFF15803D),
                            fontSize: 11,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
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

  Widget _buildStyledReasoning(String reasoning) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: const Color(0xFFE2E8F0)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Institutional Header
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: const BoxDecoration(
              color: Color(0xFFF8FAFC),
              borderRadius: BorderRadius.only(
                topLeft: Radius.circular(9),
                topRight: Radius.circular(9),
              ),
              border: Border(
                bottom: BorderSide(color: Color(0xFFE2E8F0)),
              ),
            ),
            child: const Row(
              children: [
                Icon(
                  CupertinoIcons.checkmark_shield,
                  size: 16,
                  color: Color(0xFF1E3A6E),
                ),
                SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'Statutory Assessment Findings',
                    style: TextStyle(
                      color: Color(0xFF0F172A),
                      fontWeight: FontWeight.w600,
                      fontSize: 13,
                      letterSpacing: -0.1,
                    ),
                  ),
                ),
                Text(
                  'Official Procedure Audit',
                  style: TextStyle(
                    color: Color(0xFF64748B),
                    fontSize: 11,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ],
            ),
          ),

          // Editorial Body
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            child: _buildRichReasoningText(reasoning),
          ),
        ],
      ),
    );
  }

  Widget _buildRichReasoningText(String text) {
    final paragraphs = text.split(RegExp(r'\n+'));
    final widgets = <Widget>[];

    for (int p = 0; p < paragraphs.length; p++) {
      final paragraph = paragraphs[p].trim();
      if (paragraph.isEmpty) continue;

      // Parse inline elements: quotes (e.g. "NIC_of user 7.jpg") and bold (**text**)
      final spans = <InlineSpan>[];
      final regex = RegExp(r'("([^"]+)"|\*\*([^*]+)\*\*)');
      int lastIndex = 0;

      for (final match in regex.allMatches(paragraph)) {
        if (match.start > lastIndex) {
          spans.add(TextSpan(
            text: paragraph.substring(lastIndex, match.start),
            style: const TextStyle(
              fontSize: 13,
              height: 1.55,
              color: Color(0xFF334155),
            ),
          ));
        }

        if (match.group(2) != null) {
          // Quoted document name or filename
          final quoted = match.group(2)!;
          spans.add(WidgetSpan(
            alignment: PlaceholderAlignment.middle,
            child: Container(
              margin: const EdgeInsets.symmetric(horizontal: 2),
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1.5),
              decoration: BoxDecoration(
                color: const Color(0xFFF1F5F9),
                borderRadius: BorderRadius.circular(4),
                border: Border.all(color: const Color(0xFFCBD5E1), width: 0.8),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(CupertinoIcons.doc, size: 11, color: Color(0xFF475569)),
                  const SizedBox(width: 4),
                  Text(
                    quoted,
                    style: const TextStyle(
                      fontSize: 11.5,
                      fontWeight: FontWeight.w600,
                      color: Color(0xFF1E293B),
                    ),
                  ),
                ],
              ),
            ),
          ));
        } else if (match.group(3) != null) {
          // Bold
          spans.add(TextSpan(
            text: match.group(3)!,
            style: const TextStyle(
              fontSize: 13,
              height: 1.55,
              fontWeight: FontWeight.w600,
              color: Color(0xFF0F172A),
            ),
          ));
        }

        lastIndex = match.end;
      }

      if (lastIndex < paragraph.length) {
        spans.add(TextSpan(
          text: paragraph.substring(lastIndex),
          style: const TextStyle(
            fontSize: 13,
            height: 1.55,
            color: Color(0xFF334155),
          ),
        ));
      }

      widgets.add(
        Padding(
          padding: EdgeInsets.only(bottom: p < paragraphs.length - 1 ? 8 : 0),
          child: Text.rich(
            TextSpan(children: spans),
          ),
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: widgets,
    );
  }

  Widget _buildStyledMissingDocsList(List<String> missingDocs) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Icon(CupertinoIcons.exclamationmark_triangle_fill, size: 15, color: Color(0xFFD97706)),
            const SizedBox(width: 6),
            const Text(
              'Required Documents to Complete Application',
              style: TextStyle(
                fontWeight: FontWeight.w700,
                color: Color(0xFF0F172A),
                fontSize: 13,
                letterSpacing: -0.2,
              ),
            ),
            const Spacer(),
            Text(
              '${missingDocs.length} pending',
              style: const TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: Color(0xFFD97706),
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        ...missingDocs.map((doc) => Container(
              margin: const EdgeInsets.only(bottom: 6),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: const Color(0xFFE2E8F0)),
              ),
              child: Row(
                children: [
                  const Icon(CupertinoIcons.doc_text, size: 16, color: Color(0xFF64748B)),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          doc,
                          style: const TextStyle(
                            fontWeight: FontWeight.w600,
                            fontSize: 12.5,
                            color: Color(0xFF1E293B),
                          ),
                        ),
                        const SizedBox(height: 1),
                        const Text(
                          'Mandatory statutory proof required for application',
                          style: TextStyle(
                            fontSize: 10.5,
                            color: Color(0xFF64748B),
                          ),
                        ),
                      ],
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2.5),
                    decoration: BoxDecoration(
                      color: const Color(0xFFFFFBEB),
                      borderRadius: BorderRadius.circular(6),
                      border: Border.all(color: const Color(0xFFFDE68A)),
                    ),
                    child: const Text(
                      'Missing',
                      style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w600,
                        color: Color(0xFFB45309),
                      ),
                    ),
                  ),
                ],
              ),
            )),
      ],
    );
  }

  Widget _buildStyledCriteriaList(List<String> missingCriteria) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Row(
          children: [
            Icon(CupertinoIcons.xmark_circle_fill, size: 15, color: Color(0xFFDC2626)),
            SizedBox(width: 6),
            Text(
              'Statutory Ineligibility Factors',
              style: TextStyle(
                fontWeight: FontWeight.w700,
                color: Color(0xFF0F172A),
                fontSize: 13,
                letterSpacing: -0.2,
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        ...missingCriteria.map((c) => Container(
              margin: const EdgeInsets.only(bottom: 6),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: const Color(0xFFFECACA)),
              ),
              child: Row(
                children: [
                  const Icon(CupertinoIcons.clear, size: 13, color: Color(0xFFDC2626)),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      c,
                      style: const TextStyle(
                        color: Color(0xFF991B1B),
                        fontWeight: FontWeight.w500,
                        fontSize: 12,
                      ),
                    ),
                  ),
                ],
              ),
            )),
      ],
    );
  }
}
