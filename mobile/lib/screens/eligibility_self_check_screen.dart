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

  // --- Document Inspection & Tagging Helpers ---

  ({bool isRecognized, String documentType, bool isGenericWarning, String extension})
      _inspectDoc(String docEntry) {
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
        isGenericWarning: false,
        extension: ext,
      );
    }

    final lower = docEntry.toLowerCase().trim();

    if (lower.contains('nic') || lower.contains('identity') || lower.contains('postal id')) {
      return (
        isRecognized: true,
        documentType: 'National Identity Card (NIC)',
        isGenericWarning: false,
        extension: ext,
      );
    }
    if (lower.contains('birth') || lower.contains('extract')) {
      return (
        isRecognized: true,
        documentType: 'Certified Birth Certificate Extract',
        isGenericWarning: false,
        extension: ext,
      );
    }
    if (lower.contains('police') || lower.contains('loss') || lower.contains('complaint')) {
      return (
        isRecognized: true,
        documentType: 'Police Complaint Report for Loss',
        isGenericWarning: false,
        extension: ext,
      );
    }
    if (lower.contains('medical') || lower.contains('ntmi') || lower.contains('fitness')) {
      return (
        isRecognized: true,
        documentType: 'Medical Fitness Certificate (NTMI)',
        isGenericWarning: false,
        extension: ext,
      );
    }
    if (lower.contains('passport') || lower.contains('travel')) {
      return (
        isRecognized: true,
        documentType: 'Current / Previous Passport',
        isGenericWarning: false,
        extension: ext,
      );
    }
    if (lower.contains('grama') || lower.contains('niladhari')) {
      return (
        isRecognized: true,
        documentType: 'Grama Niladhari Certificate',
        isGenericWarning: false,
        extension: ext,
      );
    }
    if (lower.contains('photo') || lower.contains('icao') || lower.contains('biometric')) {
      return (
        isRecognized: true,
        documentType: 'ICAO Biometric Photo Slip',
        isGenericWarning: false,
        extension: ext,
      );
    }

    return (
      isRecognized: false,
      documentType: 'Unlabelled / Generic Scan',
      isGenericWarning: true,
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
    setState(() {
      _uploadedDocuments.removeAt(index);
    });
  }

  void _tagDoc(int index, String statutoryType) {
    if (index >= 0 && index < _uploadedDocuments.length) {
      final doc = _uploadedDocuments[index];
      final cleanName = doc.contains(':')
          ? doc.split(':').sublist(1).join(':').trim()
          : doc.trim();
      setState(() {
        _uploadedDocuments[index] = '$statutoryType: $cleanName';
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
            content: Text('File selection error: $e'),
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
        title: const Text('Add Document Reference'),
        content: TextField(
          controller: controller,
          decoration: const InputDecoration(
            hintText: 'e.g., nic_copy.pdf, birth_cert.jpg',
            labelText: 'File Name or Statutory Name',
            border: OutlineInputBorder(),
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
              if (text.isNotEmpty) {
                _addDoc(text);
              }
              Navigator.pop(ctx);
            },
            child: const Text('Add'),
          ),
        ],
      ),
    );
  }

  // --- Service Selection Modal ---

  void _showServiceSelectionModal(List<Map<String, dynamic>> services) {
    final searchController = TextEditingController();
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
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
              child: SizedBox(
                height: 480,
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 12.0),
                  child: Column(
                    children: [
                      Container(
                        width: 40,
                        height: 4,
                        margin: const EdgeInsets.only(bottom: 12),
                        decoration: BoxDecoration(
                          color: Colors.grey.shade300,
                          borderRadius: BorderRadius.circular(2),
                        ),
                      ),
                      const Text(
                        'Select Target Government Service',
                        style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                      ),
                      const SizedBox(height: 12),
                      TextField(
                        controller: searchController,
                        decoration: InputDecoration(
                          hintText: 'Search service (e.g. NIC, Passport, License)...',
                          prefixIcon: const Icon(Icons.search),
                          isDense: true,
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(10),
                          ),
                        ),
                        onChanged: (_) => setModalState(() {}),
                      ),
                      const SizedBox(height: 12),
                      Expanded(
                        child: filtered.isEmpty
                            ? const Center(child: Text('No matching services found.'))
                            : ListView.separated(
                                itemCount: filtered.length,
                                separatorBuilder: (_, _) => const Divider(height: 1),
                                itemBuilder: (context, idx) {
                                  final s = filtered[idx];
                                  final rawId = s['id'];
                                  final sId = (rawId is num)
                                      ? rawId.toInt()
                                      : int.tryParse(rawId?.toString() ?? '') ?? 0;
                                  final sName = (s['name'] as String?) ?? 'Unknown Service';
                                  final sCat = (s['category'] as String?) ?? '';
                                  final isSelected = sId == _selectedServiceId;

                                  return ListTile(
                                    contentPadding: const EdgeInsets.symmetric(
                                        horizontal: 8, vertical: 2),
                                    leading: CircleAvatar(
                                      backgroundColor: isSelected
                                          ? AppColors.primary
                                          : AppColors.primary.withValues(alpha: 0.1),
                                      child: Icon(
                                        Icons.account_balance,
                                        size: 18,
                                        color: isSelected ? Colors.white : AppColors.primary,
                                      ),
                                    ),
                                    title: Text(
                                      sName,
                                      style: TextStyle(
                                        fontWeight: isSelected ? FontWeight.bold : FontWeight.w500,
                                        fontSize: 13,
                                      ),
                                    ),
                                    subtitle: sCat.isNotEmpty
                                        ? Text(sCat, style: const TextStyle(fontSize: 11))
                                        : null,
                                    trailing: isSelected
                                        ? const Icon(Icons.check, color: AppColors.primary, size: 20)
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
              ),
            );
          },
        );
      },
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

  // --- Statutory Requirements Knowledge Base ---

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
        title: const Text('Agent 2: Eligibility & Document Check'),
        elevation: 0,
      ),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 720),
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 18.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // 1. AI Hero Header Banner
                _buildHeroBanner(),
                const SizedBox(height: 16),

                // 2. Service Selection Card
                _buildServiceSelectorCard(servicesAsync),
                const SizedBox(height: 16),

                // 3. Applicant Demographics Form Card
                _buildDemographicsCard(),
                const SizedBox(height: 16),

                // 4. Evidentiary Document Proofs Section
                _buildDocumentProofsCard(isEvaluating),
                const SizedBox(height: 16),

                // 5. Pre-Screening Statutory Readiness Preview
                _buildStatutoryReadinessCard(statutoryDocs),
                const SizedBox(height: 20),

                // 6. Action Button: Consult Agent 2
                ElevatedButton(
                  onPressed: isEvaluating ? null : _runEvaluation,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
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
                            SizedBox(width: 10),
                            Text(
                              'Agent 2 Auditing Statutory Rules...',
                              style: TextStyle(
                                  fontSize: 15, fontWeight: FontWeight.bold),
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
                              style: TextStyle(
                                  fontSize: 15, fontWeight: FontWeight.bold),
                            ),
                          ],
                        ),
                ),
                const SizedBox(height: 24),

                // 7. Results Section
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
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.primary,
        borderRadius: BorderRadius.circular(14),
        boxShadow: [
          BoxShadow(
            color: AppColors.primary.withValues(alpha: 0.2),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.15),
              borderRadius: BorderRadius.circular(10),
            ),
            child: const Icon(
              Icons.smart_toy_rounded,
              size: 28,
              color: Colors.white,
            ),
          ),
          const SizedBox(width: 14),
          const Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Agent 2 • Statutory Eligibility Audit',
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                  ),
                ),
                SizedBox(height: 4),
                Text(
                  'Pre-screen statutory eligibility against Sri Lanka Official Gazettes & Circulars using Neon PGVector embeddings and Groq LLM reasoning.',
                  style: TextStyle(
                    fontSize: 12,
                    color: Colors.white70,
                    height: 1.3,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildServiceSelectorCard(AsyncValue<List<Map<String, dynamic>>> servicesAsync) {
    return Card(
      elevation: 1,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Row(
              children: [
                Icon(Icons.account_balance, size: 16, color: AppColors.primary),
                SizedBox(width: 6),
                Text(
                  'Target Government Service',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.bold,
                    color: AppColors.secondaryLabel,
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
                      fontWeight: FontWeight.bold,
                      color: AppColors.dark,
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                servicesAsync.maybeWhen(
                  data: (services) => OutlinedButton.icon(
                    onPressed: () => _showServiceSelectionModal(services),
                    icon: const Icon(Icons.swap_horiz, size: 16),
                    label: const Text('Change', style: TextStyle(fontSize: 12)),
                    style: OutlinedButton.styleFrom(
                      visualDensity: VisualDensity.compact,
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    ),
                  ),
                  orElse: () => const SizedBox.shrink(),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildDemographicsCard() {
    return Card(
      elevation: 1,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Row(
              children: [
                Icon(Icons.person_pin_rounded, size: 16, color: AppColors.primary),
                SizedBox(width: 6),
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
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _ageController,
                    keyboardType: TextInputType.number,
                    decoration: InputDecoration(
                      labelText: 'Applicant Age',
                      isDense: true,
                      prefixIcon: const Icon(Icons.cake, size: 18),
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                    ),
                    onChanged: (_) => setState(() {}),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: TextField(
                    controller: _incomeController,
                    keyboardType: TextInputType.number,
                    decoration: InputDecoration(
                      labelText: 'Annual Income (LKR)',
                      isDense: true,
                      prefixIcon: const Icon(Icons.payments_outlined, size: 18),
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
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
                  label: Text(status, style: TextStyle(fontSize: 12, color: isSelected ? Colors.white : AppColors.dark)),
                  selected: isSelected,
                  selectedColor: AppColors.primary,
                  onSelected: (val) {
                    if (val) setState(() => _selectedCitizenship = status);
                  },
                );
              }).toList(),
            ),
            const SizedBox(height: 10),
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
                  label: Text(status, style: TextStyle(fontSize: 12, color: isSelected ? Colors.white : AppColors.dark)),
                  selected: isSelected,
                  selectedColor: AppColors.primary,
                  onSelected: (val) {
                    if (val) setState(() => _selectedEmployment = status);
                  },
                );
              }).toList(),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildDocumentProofsCard(bool isEvaluating) {
    return Card(
      elevation: 1,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Row(
                  children: [
                    Icon(Icons.folder_shared_rounded, size: 16, color: AppColors.primary),
                    SizedBox(width: 6),
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
                        visualDensity: VisualDensity.compact,
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      ),
                    ),
                    const SizedBox(width: 6),
                    ElevatedButton.icon(
                      onPressed: isEvaluating ? null : _pickFiles,
                      icon: const Icon(Icons.upload_file, size: 14),
                      label: const Text('Upload File', style: TextStyle(fontSize: 11)),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.primary,
                        foregroundColor: Colors.white,
                        visualDensity: VisualDensity.compact,
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      ),
                    ),
                  ],
                ),
              ],
            ),
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              decoration: BoxDecoration(
                color: AppColors.primary.withValues(alpha: 0.06),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(Icons.info_outline, size: 15, color: AppColors.primary),
                  SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Agent 2 checks file extensions (.pdf, .jpg, .png) and statutory keywords. Generic scans can be tagged with one tap below.',
                      style: TextStyle(fontSize: 11, color: Colors.black87, height: 1.3),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 10),
            // Quick preset tags
            const Text(
              'Quick Statutory Presets:',
              style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: AppColors.secondaryLabel),
            ),
            const SizedBox(height: 6),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                _buildQuickPresetChip('NIC Copy', 'National Identity Card (NIC): nic_front.pdf'),
                _buildQuickPresetChip('Birth Extract', 'Certified Birth Certificate Extract: birth_cert.pdf'),
                _buildQuickPresetChip('Police Report', 'Police Complaint Report for Loss: police_loss_report.pdf'),
                _buildQuickPresetChip('NTMI Medical', 'Medical Fitness Certificate (NTMI): ntmi_fitness.pdf'),
                _buildQuickPresetChip('Biometric Photo', 'ICAO Biometric Photo Slip: photo_slip.jpg'),
              ],
            ),
            const SizedBox(height: 14),
            // Uploaded items list
            if (_uploadedDocuments.isEmpty)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(vertical: 18),
                alignment: Alignment.center,
                child: const Text(
                  'No documents attached yet. Upload files or select presets above.',
                  style: TextStyle(fontSize: 12, color: Colors.grey),
                ),
              )
            else
              Column(
                children: List.generate(_uploadedDocuments.length, (idx) {
                  final doc = _uploadedDocuments[idx];
                  final inspection = _inspectDoc(doc);
                  return _buildDocumentItem(idx, doc, inspection);
                }),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildQuickPresetChip(String label, String fullPayload) {
    return ActionChip(
      avatar: const Icon(Icons.add, size: 12),
      label: Text(label, style: const TextStyle(fontSize: 11)),
      visualDensity: VisualDensity.compact,
      onPressed: () => _addDoc(fullPayload),
    );
  }

  Widget _buildDocumentItem(int index, String doc,
      ({bool isRecognized, String documentType, bool isGenericWarning, String extension}) inspection) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: inspection.isGenericWarning
            ? Colors.orange.withValues(alpha: 0.08)
            : AppColors.success.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          color: inspection.isGenericWarning
              ? Colors.orange.withValues(alpha: 0.4)
              : AppColors.success.withValues(alpha: 0.3),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: AppColors.primary.withValues(alpha: 0.15),
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
                child: Text(
                  doc,
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                  ),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              IconButton(
                icon: const Icon(Icons.close, size: 16, color: Colors.grey),
                onPressed: () => _removeDoc(index),
                visualDensity: VisualDensity.compact,
                padding: EdgeInsets.zero,
                constraints: const BoxConstraints(),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Row(
            children: [
              Icon(
                inspection.isGenericWarning
                    ? Icons.warning_amber_rounded
                    : Icons.check_circle_outline,
                size: 14,
                color: inspection.isGenericWarning ? Colors.orange : AppColors.success,
              ),
              const SizedBox(width: 4),
              Expanded(
                child: Text(
                  inspection.isGenericWarning
                      ? 'Generic Scan — Tap tag below to classify for Agent 2'
                      : 'Verified as ${inspection.documentType}',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: inspection.isGenericWarning ? Colors.orange.shade800 : AppColors.success,
                  ),
                ),
              ),
            ],
          ),
          if (inspection.isGenericWarning) ...[
            const SizedBox(height: 6),
            Wrap(
              spacing: 6,
              runSpacing: 4,
              children: [
                _buildTagButton(index, 'Tag as NIC', 'National Identity Card (NIC)'),
                _buildTagButton(index, 'Tag as Birth Cert', 'Certified Birth Certificate Extract'),
                _buildTagButton(index, 'Tag as Police Report', 'Police Complaint Report for Loss'),
              ],
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildTagButton(int index, String label, String statutoryType) {
    return InkWell(
      onTap: () => _tagDoc(index, statutoryType),
      borderRadius: BorderRadius.circular(4),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
        decoration: BoxDecoration(
          color: Colors.orange.withValues(alpha: 0.15),
          borderRadius: BorderRadius.circular(4),
          border: Border.all(color: Colors.orange.withValues(alpha: 0.5)),
        ),
        child: Text(
          '+ $label',
          style: TextStyle(
            fontSize: 10,
            fontWeight: FontWeight.w600,
            color: Colors.orange.shade900,
          ),
        ),
      ),
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

    return Card(
      elevation: 1,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Row(
              children: [
                Icon(Icons.fact_check_outlined, size: 16, color: AppColors.primary),
                SizedBox(width: 6),
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
            const SizedBox(height: 10),
            Row(
              children: [
                Icon(
                  isAgeMet ? Icons.check_circle : Icons.cancel,
                  color: isAgeMet ? AppColors.success : AppColors.danger,
                  size: 16,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'Age Requirement: Minimum 15+ years (Applicant: $userAge)',
                    style: const TextStyle(fontSize: 12),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 6),
            Row(
              children: [
                Icon(
                  isCitizenMet ? Icons.check_circle : Icons.cancel,
                  color: isCitizenMet ? AppColors.success : AppColors.danger,
                  size: 16,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'Citizenship: Sri Lankan or Dual Citizen Status',
                    style: const TextStyle(fontSize: 12),
                  ),
                ),
              ],
            ),
            const Divider(height: 18),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text(
                  'Mandatory Statutory Proofs:',
                  style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold),
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
                padding: const EdgeInsets.only(bottom: 4.0),
                child: Row(
                  children: [
                    Icon(
                      isAttached ? Icons.check_circle : Icons.radio_button_unchecked,
                      color: isAttached ? AppColors.success : Colors.grey,
                      size: 15,
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        req,
                        style: TextStyle(
                          fontSize: 12,
                          color: isAttached ? AppColors.dark : Colors.black54,
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
      ),
    );
  }

  Widget _buildEvaluatingCard() {
    return Card(
      elevation: 2,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Padding(
        padding: const EdgeInsets.all(20.0),
        child: Column(
          children: [
            const CircularProgressIndicator(),
            const SizedBox(height: 16),
            const Text(
              'Agent 2 AI RAG Engine Auditing...',
              style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15),
            ),
            const SizedBox(height: 8),
            Text(
              'Auditing uploaded proofs against official circulars in Neon PGVector & synthesizing Groq LLM reasoning...',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 12, color: Colors.grey.shade700),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildResultCard(EligibilityAgentResponse agentResult) {
    final bool isFullyEligible =
        agentResult.isEligible && agentResult.missingDocuments.isEmpty;
    final bool hasMissingDocs = agentResult.missingDocuments.isNotEmpty;
    final bool hasCriteriaErrors = agentResult.missingCriteria.isNotEmpty;

    Color cardColor;
    Color textColor;
    String statusTitle;
    IconData statusIcon;

    if (isFullyEligible) {
      cardColor = AppColors.success;
      textColor = AppColors.success;
      statusTitle = 'Fully Eligible — Ready to Apply';
      statusIcon = Icons.check_circle_rounded;
    } else if (hasCriteriaErrors) {
      cardColor = AppColors.danger;
      textColor = AppColors.danger;
      statusTitle = 'Ineligible — Statutory Criteria Not Met';
      statusIcon = Icons.cancel_rounded;
    } else {
      cardColor = AppColors.warning;
      textColor = Colors.deepOrange;
      statusTitle = 'Action Required — Incomplete Proofs';
      statusIcon = Icons.warning_amber_rounded;
    }

    return Card(
      elevation: 3,
      color: cardColor.withValues(alpha: 0.08),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: cardColor.withValues(alpha: 0.4), width: 1.5),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(statusIcon, color: textColor, size: 24),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    statusTitle,
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.bold,
                      color: textColor,
                    ),
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: isFullyEligible
                        ? AppColors.success
                        : (agentResult.matchPercentage >= 50
                            ? AppColors.warning
                            : AppColors.danger),
                    borderRadius: BorderRadius.circular(20),
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
            const Divider(height: 20),
            if (agentResult.reasoning.isNotEmpty) ...[
              const Row(
                children: [
                  Icon(Icons.psychology_outlined, size: 16, color: AppColors.primary),
                  SizedBox(width: 6),
                  Text(
                    'AI Cognitive Reasoning:',
                    style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.8),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  agentResult.reasoning,
                  style: const TextStyle(fontSize: 13, height: 1.35),
                ),
              ),
              const SizedBox(height: 12),
            ],
            if (hasCriteriaErrors) ...[
              const Text(
                'Missing / Failed Legal Criteria:',
                style: TextStyle(fontWeight: FontWeight.bold, color: AppColors.danger, fontSize: 12),
              ),
              const SizedBox(height: 4),
              ...agentResult.missingCriteria.map((c) => Text('• $c', style: const TextStyle(color: AppColors.danger, fontSize: 12))),
              const SizedBox(height: 10),
            ],
            if (hasMissingDocs) ...[
              const Text(
                'Missing Required Documents:',
                style: TextStyle(fontWeight: FontWeight.bold, color: Colors.deepOrange, fontSize: 12),
              ),
              const SizedBox(height: 4),
              ...agentResult.missingDocuments.map((d) => Text('• $d', style: const TextStyle(color: Colors.deepOrange, fontWeight: FontWeight.w600, fontSize: 12))),
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
            ],
          ],
        ),
      ),
    );
  }
}
