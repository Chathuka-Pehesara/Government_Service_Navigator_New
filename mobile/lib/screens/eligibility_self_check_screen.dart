import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:file_picker/file_picker.dart';
import '../models/eligibility_agent_model.dart';
import '../providers/agent_providers.dart';
import '../providers/catalog_providers.dart';
import '../theme/app_colors.dart';

class EligibilitySelfCheckScreen extends ConsumerStatefulWidget {
  final int serviceId;
  final String serviceName;

  const EligibilitySelfCheckScreen({
    super.key,
    required this.serviceId,
    this.serviceName = 'National Identity Card (NIC) Issuance & Replacement',
  });

  @override
  ConsumerState<EligibilitySelfCheckScreen> createState() =>
      _EligibilitySelfCheckScreenState();
}

class _EligibilitySelfCheckScreenState
    extends ConsumerState<EligibilitySelfCheckScreen> {
  late int _selectedServiceId;
  late String _selectedServiceName;

  final TextEditingController _ageController = TextEditingController(text: '25');
  final TextEditingController _incomeController = TextEditingController(text: '500000');

  String _selectedCitizenship = 'Sri Lankan';
  String _selectedEmployment = 'Employed';

  final List<String> _uploadedDocuments = [
    'National Identity Card (NIC): nic_copy.pdf',
    'Certified Birth Certificate Extract: birth_certificate.pdf',
  ];

  @override
  void initState() {
    super.initState();
    _selectedServiceId = widget.serviceId;
    _selectedServiceName = widget.serviceName;
  }

  @override
  void dispose() {
    _ageController.dispose();
    _incomeController.dispose();
    super.dispose();
  }

  // --- Document Helpers ---

  ({bool isRecognized, String documentType, String extension}) _inspectDoc(String docEntry) {
    String ext = 'PDF';
    final dotIndex = docEntry.lastIndexOf('.');
    if (dotIndex != -1 && dotIndex < docEntry.length - 1) {
      ext = docEntry.substring(dotIndex + 1).toUpperCase();
      if (ext.length > 4) ext = 'DOC';
    }

    if (docEntry.contains(':')) {
      final prefix = docEntry.split(':').first.trim();
      return (
        isRecognized: true,
        documentType: prefix,
        extension: ext,
      );
    }

    final lower = docEntry.toLowerCase().trim();
    if (lower.contains('nic') || lower.contains('identity') || lower.contains('postal id')) {
      return (
        isRecognized: true,
        documentType: 'National Identity Card (NIC)',
        extension: ext,
      );
    }
    if (lower.contains('birth') || lower.contains('extract')) {
      return (
        isRecognized: true,
        documentType: 'Certified Birth Certificate Extract',
        extension: ext,
      );
    }
    if (lower.contains('police') || lower.contains('loss') || lower.contains('complaint')) {
      return (
        isRecognized: true,
        documentType: 'Police Complaint Report for Loss',
        extension: ext,
      );
    }
    if (lower.contains('medical') || lower.contains('ntmi') || lower.contains('fitness')) {
      return (
        isRecognized: true,
        documentType: 'Medical Fitness Certificate (NTMI)',
        extension: ext,
      );
    }
    if (lower.contains('passport') || lower.contains('travel')) {
      return (
        isRecognized: true,
        documentType: 'Current / Previous Passport',
        extension: ext,
      );
    }
    if (lower.contains('grama') || lower.contains('niladhari')) {
      return (
        isRecognized: true,
        documentType: 'Grama Niladhari Certificate',
        extension: ext,
      );
    }
    if (lower.contains('photo') || lower.contains('icao') || lower.contains('biometric')) {
      return (
        isRecognized: true,
        documentType: 'ICAO Biometric Photo Slip',
        extension: ext,
      );
    }

    return (
      isRecognized: false,
      documentType: 'General Proof Scan',
      extension: ext,
    );
  }

  void _addDoc(String name) {
    if (!_uploadedDocuments.contains(name)) {
      setState(() {
        _uploadedDocuments.add(name);
      });
    }
  }

  void _removeDoc(int index) {
    if (index >= 0 && index < _uploadedDocuments.length) {
      setState(() {
        _uploadedDocuments.removeAt(index);
      });
    }
  }

  Future<void> _pickFiles() async {
    try {
      final files = await FilePicker.pickFiles(
        type: FileType.custom,
        allowedExtensions: const ['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx'],
      );

      if (files.isNotEmpty) {
        for (final f in files) {
          final fileName = f.name.trim();
          if (fileName.isNotEmpty) {
            _addDoc(fileName);
          }
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('File selection note: $e'),
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    }
  }

  void _showAddCustomDocDialog() {
    final controller = TextEditingController();
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: const Text('Add Document Reference', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
        content: TextField(
          controller: controller,
          decoration: InputDecoration(
            hintText: 'e.g. nic_front_copy.pdf, birth_cert.jpg',
            labelText: 'File or Document Title',
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
          ),
          autofocus: true,
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.primary,
              foregroundColor: Colors.white,
            ),
            onPressed: () {
              final text = controller.text.trim();
              if (text.isNotEmpty) {
                _addDoc(text);
              }
              Navigator.pop(ctx);
            },
            child: const Text('Add Document'),
          ),
        ],
      ),
    );
  }

  // --- Evaluation Logic ---

  void _runEvaluation() {
    final age = int.tryParse(_ageController.text) ?? 25;
    final income = double.tryParse(_incomeController.text) ?? 0.0;

    ref.read(eligibilityCheckControllerProvider.notifier).evaluate(
          serviceName: _selectedServiceName,
          serviceId: _selectedServiceId,
          age: age,
          citizenshipStatus: _selectedCitizenship,
          annualIncome: income,
          employmentStatus: _selectedEmployment,
          providedDocuments: _uploadedDocuments,
        );
  }

  List<String> _getStatutoryRequiredDocs(String serviceName) {
    final name = serviceName.toLowerCase();
    if (name.contains('passport')) {
      return [
        'Certified Birth Certificate Extract',
        'National Identity Card (NIC) with clear copy',
        'Current Passport (if renewal)',
        '3.5cm x 4.5cm ICAO compliant biometric photo acknowledgement slip',
      ];
    }
    if (name.contains('driving') || name.contains('license')) {
      return [
        'National Medical Certificate (NTMI)',
        'National Identity Card (NIC)',
        'Current Driving License / Learner Permit',
      ];
    }
    if (name.contains('police') || name.contains('clearance')) {
      return [
        'Clear copy of National Identity Card (NIC)',
        'Valid Passport copy',
        'Grama Niladhari Residence Certificate',
      ];
    }
    return [
      'Certified Birth Certificate Extract',
      'National Identity Card (NIC) / Police Loss Report',
    ];
  }

  // --- Service Selection Modal ---

  void _showServiceSelectionModal(List<Map<String, dynamic>> services) {
    final searchController = TextEditingController();
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (modalCtx) {
        return StatefulBuilder(
          builder: (context, setModalState) {
            final filter = searchController.text.toLowerCase().trim();
            final filtered = services.where((s) {
              if (s['status'] == 'Retired') return false;
              final name = (s['name'] as String? ?? '').toLowerCase();
              final cat = (s['category'] as String? ?? '').toLowerCase();
              return name.contains(filter) || cat.contains(filter);
            }).toList();

            return SafeArea(
              child: Container(
                height: MediaQuery.of(context).size.height * 0.65,
                padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 12.0),
                child: Column(
                  children: [
                    Container(
                      width: 36,
                      height: 4,
                      margin: const EdgeInsets.only(bottom: 12),
                      decoration: BoxDecoration(
                        color: Colors.grey.shade300,
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                    const Text(
                      'Select Target Government Service',
                      style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: AppColors.dark),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: searchController,
                      decoration: InputDecoration(
                        hintText: 'Search service (NIC, Passport, Driving License)...',
                        prefixIcon: const Icon(Icons.search, size: 20),
                        isDense: true,
                        filled: true,
                        fillColor: AppColors.background,
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide: BorderSide.none,
                        ),
                      ),
                      onChanged: (_) => setModalState(() {}),
                    ),
                    const SizedBox(height: 12),
                    Expanded(
                      child: filtered.isEmpty
                          ? const Center(child: Text('No matching services found.'))
                          : ListView.builder(
                              physics: const BouncingScrollPhysics(),
                              itemCount: filtered.length,
                              itemBuilder: (context, idx) {
                                final s = filtered[idx];
                                final rawId = s['id'];
                                final sId = (rawId is num)
                                    ? rawId.toInt()
                                    : int.tryParse(rawId?.toString() ?? '') ?? 0;
                                final sName = (s['name'] as String?) ?? 'Government Service';
                                final sCat = (s['category'] as String?) ?? '';
                                final isSelected = sId == _selectedServiceId;

                                return ListTile(
                                  contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 2),
                                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                                  leading: CircleAvatar(
                                    backgroundColor: isSelected
                                        ? AppColors.primary
                                        : AppColors.primary.withValues(alpha: 0.08),
                                    child: Icon(
                                      Icons.account_balance_outlined,
                                      size: 18,
                                      color: isSelected ? Colors.white : AppColors.primary,
                                    ),
                                  ),
                                  title: Text(
                                    sName,
                                    style: TextStyle(
                                      fontWeight: isSelected ? FontWeight.bold : FontWeight.w500,
                                      fontSize: 13,
                                      color: AppColors.dark,
                                    ),
                                  ),
                                  subtitle: sCat.isNotEmpty
                                      ? Text(sCat, style: const TextStyle(fontSize: 11, color: AppColors.secondaryLabel))
                                      : null,
                                  trailing: isSelected
                                      ? const Icon(Icons.check_circle, color: AppColors.primary, size: 20)
                                      : null,
                                  onTap: () {
                                    setState(() {
                                      _selectedServiceId = sId;
                                      _selectedServiceName = sName;
                                    });
                                    Navigator.pop(modalCtx);
                                  },
                                );
                              },
                            ),
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }

  // --- Main Build ---

  @override
  Widget build(BuildContext context) {
    final evaluation = ref.watch(eligibilityCheckControllerProvider);
    final isEvaluating = evaluation.isLoading;
    final agentResult = evaluation.hasError ? null : evaluation.value;
    final servicesAsync = ref.watch(servicesProvider);
    final statutoryDocs = _getStatutoryRequiredDocs(_selectedServiceName);

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text(
          'Agent 2: Eligibility & Document Check',
          style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
        ),
        backgroundColor: Colors.white,
        foregroundColor: AppColors.dark,
        elevation: 0.5,
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh_rounded),
            tooltip: 'Reset Evaluation',
            onPressed: () {
              ref.invalidate(eligibilityCheckControllerProvider);
            },
          ),
        ],
      ),
      body: Align(
        alignment: Alignment.topCenter,
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 760),
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 16.0),
            physics: const BouncingScrollPhysics(),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // 1. Agent 2 Hero Cockpit Banner
                _buildHeroBanner(),
                const SizedBox(height: 16),

                // 2. Target Government Service Card
                _buildServiceSelectorCard(servicesAsync),
                const SizedBox(height: 16),

                // 3. Demographics Form Card
                _buildDemographicsCard(),
                const SizedBox(height: 16),

                // 4. Evidentiary Documents Card
                _buildDocumentProofsCard(isEvaluating),
                const SizedBox(height: 16),

                // 5. Live Statutory Readiness Preview Checklist
                _buildStatutoryReadinessCard(statutoryDocs),
                const SizedBox(height: 20),

                // 6. Primary Action Button
                _buildConsultActionButton(isEvaluating),
                const SizedBox(height: 20),

                // 7. Results or Evaluation State
                if (isEvaluating)
                  _buildEvaluatingCard()
                else if (agentResult != null)
                  _buildResultCard(agentResult),

                const SizedBox(height: 32),
              ],
            ),
          ),
        ),
      ),
    );
  }

  // --- Sub-Widgets ---

  Widget _buildHeroBanner() {
    return Container(
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFF162A4D), Color(0xFF1F3A68), Color(0xFF2A4D80)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF1F3A68).withValues(alpha: 0.25),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      padding: const EdgeInsets.all(18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Icon(
                  Icons.policy_rounded,
                  size: 24,
                  color: Colors.white,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        const Flexible(
                          child: Text(
                            'Agent 2 • Statutory Eligibility Audit',
                            style: TextStyle(
                              fontSize: 14,
                              fontWeight: FontWeight.bold,
                              color: Colors.white,
                            ),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        const SizedBox(width: 6),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(
                            color: const Color(0xFF2E7D5B),
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: const Text(
                            'ONLINE',
                            style: TextStyle(
                              color: Colors.white,
                              fontSize: 9,
                              fontWeight: FontWeight.bold,
                              letterSpacing: 0.5,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 2),
                    const Text(
                      'Sri Lanka Gazettes • Neon PGVector • Groq LLM',
                      style: TextStyle(
                        fontSize: 11,
                        color: Colors.white70,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: Colors.black.withValues(alpha: 0.18),
              borderRadius: BorderRadius.circular(8),
            ),
            child: const Text(
              'Pre-screen statutory eligibility against Sri Lanka Official Gazettes & Circulars using Neon PGVector embeddings and Groq LLM reasoning.',
              style: TextStyle(
                fontSize: 12,
                color: Colors.white,
                height: 1.35,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildServiceSelectorCard(AsyncValue<List<Map<String, dynamic>>> servicesAsync) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.cardBg,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.divider),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.03),
            blurRadius: 6,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              Icon(Icons.account_balance, size: 16, color: AppColors.primary),
              SizedBox(width: 8),
              Text(
                'Target Government Service',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.bold,
                  color: AppColors.secondaryLabel,
                  letterSpacing: 0.3,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: Text(
                  _selectedServiceName,
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: AppColors.dark,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              servicesAsync.maybeWhen(
                data: (services) => TextButton.icon(
                  onPressed: () => _showServiceSelectionModal(services),
                  icon: const Icon(Icons.swap_horiz, size: 16),
                  label: const Text('Change', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
                  style: TextButton.styleFrom(
                    backgroundColor: AppColors.primary.withValues(alpha: 0.08),
                    foregroundColor: AppColors.primary,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    visualDensity: VisualDensity.compact,
                  ),
                ),
                orElse: () => const SizedBox.shrink(),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildDemographicsCard() {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.cardBg,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.divider),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.03),
            blurRadius: 6,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              Icon(Icons.person_outline_rounded, size: 18, color: AppColors.primary),
              SizedBox(width: 8),
              Text(
                'Applicant Statutory Demographics',
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.bold,
                  color: AppColors.dark,
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _ageController,
                  keyboardType: TextInputType.number,
                  decoration: InputDecoration(
                    labelText: 'Applicant Age',
                    hintText: 'e.g. 25',
                    isDense: true,
                    prefixIcon: const Icon(Icons.cake_outlined, size: 18, color: AppColors.secondaryLabel),
                    filled: true,
                    fillColor: AppColors.background,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(10),
                      borderSide: const BorderSide(color: AppColors.divider),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(10),
                      borderSide: const BorderSide(color: AppColors.divider),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: TextField(
                  controller: _incomeController,
                  keyboardType: TextInputType.number,
                  decoration: InputDecoration(
                    labelText: 'Annual Income (LKR)',
                    hintText: '500,000',
                    isDense: true,
                    prefixIcon: const Icon(Icons.payments_outlined, size: 18, color: AppColors.secondaryLabel),
                    filled: true,
                    fillColor: AppColors.background,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(10),
                      borderSide: const BorderSide(color: AppColors.divider),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(10),
                      borderSide: const BorderSide(color: AppColors.divider),
                    ),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          const Text(
            'Citizenship Status:',
            style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.secondaryLabel),
          ),
          const SizedBox(height: 6),
          Wrap(
            spacing: 8,
            children: ['Sri Lankan', 'Dual Citizen', 'Foreign National'].map((status) {
              final isSelected = _selectedCitizenship == status;
              return ChoiceChip(
                label: Text(
                  status,
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                    color: isSelected ? Colors.white : AppColors.dark,
                  ),
                ),
                selected: isSelected,
                selectedColor: AppColors.primary,
                backgroundColor: AppColors.background,
                showCheckmark: false,
                side: BorderSide(
                  color: isSelected ? AppColors.primary : AppColors.divider,
                ),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                onSelected: (val) {
                  if (val) setState(() => _selectedCitizenship = status);
                },
              );
            }).toList(),
          ),
          const SizedBox(height: 12),
          const Text(
            'Employment Status:',
            style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.secondaryLabel),
          ),
          const SizedBox(height: 6),
          Wrap(
            spacing: 8,
            children: ['Employed', 'Self-Employed', 'Student', 'Unemployed'].map((status) {
              final isSelected = _selectedEmployment == status;
              return ChoiceChip(
                label: Text(
                  status,
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                    color: isSelected ? Colors.white : AppColors.dark,
                  ),
                ),
                selected: isSelected,
                selectedColor: AppColors.primary,
                backgroundColor: AppColors.background,
                showCheckmark: false,
                side: BorderSide(
                  color: isSelected ? AppColors.primary : AppColors.divider,
                ),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                onSelected: (val) {
                  if (val) setState(() => _selectedEmployment = status);
                },
              );
            }).toList(),
          ),
        ],
      ),
    );
  }

  Widget _buildDocumentProofsCard(bool isEvaluating) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.cardBg,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.divider),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.03),
            blurRadius: 6,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Row(
                children: [
                  Icon(Icons.folder_open_rounded, size: 18, color: AppColors.primary),
                  SizedBox(width: 8),
                  Text(
                    'Evidentiary Documents',
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.bold,
                      color: AppColors.dark,
                    ),
                  ),
                ],
              ),
              Row(
                children: [
                  OutlinedButton.icon(
                    onPressed: isEvaluating ? null : _showAddCustomDocDialog,
                    icon: const Icon(Icons.add, size: 14),
                    label: const Text('Add Ref', style: TextStyle(fontSize: 11)),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: AppColors.primary,
                      side: const BorderSide(color: AppColors.divider),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                      visualDensity: VisualDensity.compact,
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    ),
                  ),
                  const SizedBox(width: 8),
                  ElevatedButton.icon(
                    onPressed: isEvaluating ? null : _pickFiles,
                    icon: const Icon(Icons.upload_file_rounded, size: 14),
                    label: const Text('Upload File', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold)),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.primary,
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                      visualDensity: VisualDensity.compact,
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                    ),
                  ),
                ],
              ),
            ],
          ),
          const SizedBox(height: 10),
          const Text(
            'Quick Statutory Presets (Tap to attach):',
            style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: AppColors.secondaryLabel),
          ),
          const SizedBox(height: 6),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              _buildPresetChip('NIC Copy', 'National Identity Card (NIC): nic_front.pdf'),
              _buildPresetChip('Birth Extract', 'Certified Birth Certificate Extract: birth_cert.pdf'),
              _buildPresetChip('Police Report', 'Police Complaint Report for Loss: police_loss_report.pdf'),
              _buildPresetChip('NTMI Medical', 'Medical Fitness Certificate (NTMI): ntmi_fitness.pdf'),
              _buildPresetChip('Biometric Photo', 'ICAO Biometric Photo Slip: photo_slip.jpg'),
              _buildPresetChip('Grama Niladhari', 'Grama Niladhari Certificate: residence_gn.pdf'),
            ],
          ),
          const SizedBox(height: 14),
          if (_uploadedDocuments.isEmpty)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(vertical: 20),
              decoration: BoxDecoration(
                color: AppColors.background,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: AppColors.divider, style: BorderStyle.solid),
              ),
              alignment: Alignment.center,
              child: const Text(
                'No documents attached yet. Tap presets or upload files.',
                style: TextStyle(fontSize: 12, color: AppColors.secondaryLabel),
              ),
            )
          else
            ListView.separated(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: _uploadedDocuments.length,
              separatorBuilder: (context, index) => const SizedBox(height: 6),
              itemBuilder: (context, idx) {
                final doc = _uploadedDocuments[idx];
                final inspection = _inspectDoc(doc);

                return Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  decoration: BoxDecoration(
                    color: AppColors.background,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: AppColors.divider),
                  ),
                  child: Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(
                          color: AppColors.primary.withValues(alpha: 0.12),
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: Text(
                          inspection.extension,
                          style: const TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.bold,
                            color: AppColors.primary,
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              doc,
                              style: const TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w600,
                                color: AppColors.dark,
                              ),
                              overflow: TextOverflow.ellipsis,
                            ),
                            Text(
                              inspection.documentType,
                              style: TextStyle(
                                fontSize: 10,
                                color: inspection.isRecognized
                                    ? AppColors.success
                                    : AppColors.secondaryLabel,
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                          ],
                        ),
                      ),
                      IconButton(
                        icon: const Icon(Icons.close, size: 16, color: Colors.grey),
                        onPressed: () => _removeDoc(idx),
                        visualDensity: VisualDensity.compact,
                        padding: EdgeInsets.zero,
                        constraints: const BoxConstraints(),
                      ),
                    ],
                  ),
                );
              },
            ),
        ],
      ),
    );
  }

  Widget _buildPresetChip(String label, String fullPayload) {
    final alreadyAdded = _uploadedDocuments.contains(fullPayload);
    return ActionChip(
      avatar: Icon(
        alreadyAdded ? Icons.check : Icons.add,
        size: 13,
        color: alreadyAdded ? AppColors.success : AppColors.primary,
      ),
      label: Text(label, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600)),
      backgroundColor: alreadyAdded ? AppColors.success.withValues(alpha: 0.1) : AppColors.background,
      side: BorderSide(
        color: alreadyAdded ? AppColors.success.withValues(alpha: 0.3) : AppColors.divider,
      ),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      visualDensity: VisualDensity.compact,
      onPressed: () => _addDoc(fullPayload),
    );
  }

  Widget _buildStatutoryReadinessCard(List<String> requiredDocsList) {
    final int userAge = int.tryParse(_ageController.text) ?? 25;
    final bool isAgeMet = userAge >= 15;
    final bool isCitizenMet =
        _selectedCitizenship.toLowerCase().contains('sri lankan') ||
        _selectedCitizenship.toLowerCase().contains('dual');

    final recognizedDocs = _uploadedDocuments.map((d) => _inspectDoc(d)).toList();
    final recognizedCount = recognizedDocs.where((i) => i.isRecognized).length;

    return Container(
      decoration: BoxDecoration(
        color: AppColors.cardBg,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.divider),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.03),
            blurRadius: 6,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              Icon(Icons.fact_check_outlined, size: 18, color: AppColors.primary),
              SizedBox(width: 8),
              Text(
                'Live Statutory Criteria Checklist',
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.bold,
                  color: AppColors.dark,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Icon(
                isAgeMet ? Icons.check_circle_rounded : Icons.cancel_rounded,
                color: isAgeMet ? AppColors.success : AppColors.danger,
                size: 16,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  'Age Threshold: Minimum statutory age met (Applicant: $userAge)',
                  style: const TextStyle(fontSize: 12, color: AppColors.dark),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Row(
            children: [
              Icon(
                isCitizenMet ? Icons.check_circle_rounded : Icons.cancel_rounded,
                color: isCitizenMet ? AppColors.success : AppColors.danger,
                size: 16,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  'Citizenship Status: Sri Lankan or Dual Citizen Status',
                  style: const TextStyle(fontSize: 12, color: AppColors.dark),
                ),
              ),
            ],
          ),
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 8.0),
            child: Divider(height: 1, color: AppColors.divider),
          ),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'Mandatory Statutory Proofs:',
                style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: AppColors.dark),
              ),
              Text(
                'Attached: $recognizedCount / ${requiredDocsList.length}',
                style: const TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.bold,
                  color: AppColors.primary,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          ...requiredDocsList.map((req) {
            final isAttached = recognizedDocs.any((i) =>
                i.isRecognized &&
                (req.toLowerCase().contains(i.documentType.toLowerCase()) ||
                 i.documentType.toLowerCase().contains(req.toLowerCase().split(' ').first)));

            return Padding(
              padding: const EdgeInsets.only(bottom: 5.0),
              child: Row(
                children: [
                  Icon(
                    isAttached ? Icons.check_circle_rounded : Icons.radio_button_unchecked,
                    color: isAttached ? AppColors.success : Colors.grey,
                    size: 15,
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      req,
                      style: TextStyle(
                        fontSize: 12,
                        color: isAttached ? AppColors.dark : AppColors.secondaryLabel,
                        fontWeight: isAttached ? FontWeight.w600 : FontWeight.normal,
                      ),
                    ),
                  ),
                ],
              ),
            );
          }),
        ],
      ),
    );
  }

  Widget _buildConsultActionButton(bool isEvaluating) {
    return ElevatedButton(
      onPressed: isEvaluating ? null : _runEvaluation,
      style: ElevatedButton.styleFrom(
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
        padding: const EdgeInsets.symmetric(vertical: 16),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        elevation: 2,
      ),
      child: isEvaluating
          ? const Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                SizedBox(
                  height: 18,
                  width: 18,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: Colors.white,
                  ),
                ),
                SizedBox(width: 12),
                Text(
                  'Agent 2 Auditing Statutory Rules...',
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
                  'Consult Agent 2 RAG Engine',
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold),
                ),
              ],
            ),
    );
  }

  Widget _buildEvaluatingCard() {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.cardBg,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.divider),
      ),
      padding: const EdgeInsets.all(24),
      alignment: Alignment.center,
      child: Column(
        children: [
          const CircularProgressIndicator(color: AppColors.primary),
          const SizedBox(height: 16),
          const Text(
            'Agent 2 RAG Engine Auditing...',
            style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14, color: AppColors.dark),
          ),
          const SizedBox(height: 6),
          Text(
            'Auditing proofs against official circulars in Neon PGVector & synthesizing Groq LLM reasoning...',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
          ),
        ],
      ),
    );
  }

  Widget _buildResultCard(EligibilityAgentResponse agentResult) {
    final bool isFullyEligible =
        agentResult.isEligible && agentResult.missingDocuments.isEmpty;
    final bool hasMissingDocs = agentResult.missingDocuments.isNotEmpty;
    final bool hasCriteriaErrors = agentResult.missingCriteria.isNotEmpty;

    Color badgeColor;
    String statusTitle;
    IconData statusIcon;

    if (isFullyEligible) {
      badgeColor = AppColors.success;
      statusTitle = 'Fully Eligible — Ready to Apply';
      statusIcon = Icons.check_circle_rounded;
    } else if (hasCriteriaErrors) {
      badgeColor = AppColors.danger;
      statusTitle = 'Ineligible — Statutory Criteria Not Met';
      statusIcon = Icons.cancel_rounded;
    } else {
      badgeColor = AppColors.warning;
      statusTitle = 'Action Required — Incomplete Proofs';
      statusIcon = Icons.warning_amber_rounded;
    }

    return Container(
      decoration: BoxDecoration(
        color: AppColors.cardBg,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: badgeColor.withValues(alpha: 0.4), width: 1.5),
        boxShadow: [
          BoxShadow(
            color: badgeColor.withValues(alpha: 0.08),
            blurRadius: 10,
            offset: const Offset(0, 3),
          ),
        ],
      ),
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header Verdict Row
          Row(
            children: [
              Icon(statusIcon, color: badgeColor, size: 24),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  statusTitle,
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.bold,
                    color: badgeColor,
                  ),
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: badgeColor,
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Text(
                  '${agentResult.matchPercentage}%',
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.bold,
                    fontSize: 12,
                  ),
                ),
              ),
            ],
          ),
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 12.0),
            child: Divider(height: 1, color: AppColors.divider),
          ),

          // AI Cognitive Reasoning Card
          if (agentResult.reasoning.isNotEmpty) ...[
            const Row(
              children: [
                Icon(Icons.psychology_outlined, size: 16, color: AppColors.primary),
                SizedBox(width: 6),
                Text(
                  'AI Cognitive Reasoning:',
                  style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: AppColors.dark),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppColors.background,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: AppColors.divider),
              ),
              child: Text(
                agentResult.reasoning,
                style: const TextStyle(fontSize: 12, height: 1.4, color: AppColors.dark),
              ),
            ),
            const SizedBox(height: 14),
          ],

          // Missing / Failed Legal Criteria
          if (hasCriteriaErrors) ...[
            const Text(
              'Missing / Failed Legal Criteria:',
              style: TextStyle(fontWeight: FontWeight.bold, color: AppColors.danger, fontSize: 12),
            ),
            const SizedBox(height: 6),
            ...agentResult.missingCriteria.map((c) => Padding(
                  padding: const EdgeInsets.only(bottom: 4.0),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Icon(Icons.error_outline, size: 14, color: AppColors.danger),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(c, style: const TextStyle(color: AppColors.danger, fontSize: 12)),
                      ),
                    ],
                  ),
                )),
            const SizedBox(height: 10),
          ],

          // Missing Required Documents
          if (hasMissingDocs) ...[
            const Text(
              'Missing Required Documents:',
              style: TextStyle(fontWeight: FontWeight.bold, color: AppColors.warning, fontSize: 12),
            ),
            const SizedBox(height: 6),
            ...agentResult.missingDocuments.map((d) => Padding(
                  padding: const EdgeInsets.only(bottom: 4.0),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Icon(Icons.pending_actions_rounded, size: 14, color: AppColors.warning),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(
                          d,
                          style: const TextStyle(color: AppColors.warning, fontWeight: FontWeight.w600, fontSize: 12),
                        ),
                      ),
                    ],
                  ),
                )),
            const SizedBox(height: 10),
          ] else ...[
            const Row(
              children: [
                Icon(Icons.verified, color: AppColors.success, size: 16),
                SizedBox(width: 6),
                Text(
                  'All statutory required documents verified!',
                  style: TextStyle(color: AppColors.success, fontWeight: FontWeight.bold, fontSize: 12),
                ),
              ],
            ),
            const SizedBox(height: 10),
          ],

          // Statutory PGVector Context Snippets
          if (agentResult.retrievedContextSnippets.isNotEmpty) ...[
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 8.0),
              child: Divider(height: 1, color: AppColors.divider),
            ),
            const Row(
              children: [
                Icon(Icons.gavel_rounded, size: 16, color: AppColors.primary),
                SizedBox(width: 6),
                Text(
                  'Statutory Gazettes & Circular Citations (PGVector):',
                  style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12, color: AppColors.dark),
                ),
              ],
            ),
            const SizedBox(height: 6),
            ...agentResult.retrievedContextSnippets.take(3).map((snippet) => Container(
                  margin: const EdgeInsets.only(bottom: 6),
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: AppColors.primary.withValues(alpha: 0.05),
                    borderRadius: BorderRadius.circular(6),
                    border: Border.all(color: AppColors.primary.withValues(alpha: 0.15)),
                  ),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Icon(Icons.format_quote_rounded, size: 14, color: AppColors.primary),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(
                          snippet,
                          style: const TextStyle(fontSize: 11, fontStyle: FontStyle.italic, color: AppColors.dark),
                        ),
                      ),
                    ],
                  ),
                )),
          ],
        ],
      ),
    );
  }
}
