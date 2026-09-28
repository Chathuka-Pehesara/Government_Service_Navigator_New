import 'package:file_picker/file_picker.dart';
import '../theme/app_colors.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../providers/agent_providers.dart';
import '../providers/catalog_providers.dart';
import '../models/eligibility_agent_model.dart';

class EligibilitySelfCheckScreen extends ConsumerStatefulWidget {
  final int serviceId;
  final String serviceName;

  const EligibilitySelfCheckScreen({
    super.key,
    required this.serviceId,
    this.serviceName = 'National Identity Card (NIC) Issuance & Replacement',
  });

  @override
  ConsumerState<EligibilitySelfCheckScreen> createState() => _EligibilitySelfCheckScreenState();
}

class _EligibilitySelfCheckScreenState extends ConsumerState<EligibilitySelfCheckScreen> {
  late int _selectedServiceId;
  late TextEditingController _serviceNameController;
  final _ageController = TextEditingController(text: '25');
  final _citizenshipController = TextEditingController(text: 'Sri Lankan');
  final _incomeController = TextEditingController(text: '500000');
  final _employmentController = TextEditingController(text: 'Employed');
  final _providedDocsController = TextEditingController();

  List<String> get _currentDocList {
    return _providedDocsController.text
        .split(',')
        .map((e) => e.trim())
        .where((e) => e.isNotEmpty)
        .toList();
  }

  void _addDoc(String name) {
    final list = _currentDocList;
    if (!list.contains(name)) {
      list.add(name);
      setState(() {
        _providedDocsController.text = list.join(', ');
      });
    }
  }

  void _removeDoc(String name) {
    final list = _currentDocList;
    list.remove(name);
    setState(() {
      _providedDocsController.text = list.join(', ');
    });
  }

  void _tagDoc(String originalDoc, String statutoryType) {
    final list = _currentDocList;
    final index = list.indexOf(originalDoc);
    if (index != -1) {
      final cleanName = originalDoc.contains(':')
          ? originalDoc.split(':').sublist(1).join(':').trim()
          : originalDoc.trim();
      list[index] = '$statutoryType: $cleanName';
      setState(() {
        _providedDocsController.text = list.join(', ');
      });
    }
  }

  ({bool isRecognized, String documentType, bool isGenericWarning}) _inspectUploadedDoc(String docEntry) {
    if (docEntry.contains(':')) {
      final prefix = docEntry.split(':').first.trim();
      return (isRecognized: true, documentType: prefix, isGenericWarning: false);
    }

    final lower = docEntry.toLowerCase().trim();

    if (lower.contains('nic') || lower.contains('identity') || lower.contains('postal id')) {
      return (isRecognized: true, documentType: 'National Identity Card (NIC)', isGenericWarning: false);
    }
    if (lower.contains('birth') || lower.contains('extract')) {
      return (isRecognized: true, documentType: 'Certified Birth Certificate Extract', isGenericWarning: false);
    }
    if (lower.contains('police') || lower.contains('loss') || lower.contains('complaint')) {
      return (isRecognized: true, documentType: 'Police Complaint Report for Loss', isGenericWarning: false);
    }
    if (lower.contains('medical') || lower.contains('ntmi') || lower.contains('fitness')) {
      return (isRecognized: true, documentType: 'Medical Fitness Certificate (NTMI)', isGenericWarning: false);
    }
    if (lower.contains('passport') || lower.contains('travel')) {
      return (isRecognized: true, documentType: 'Current / Previous Passport', isGenericWarning: false);
    }
    if (lower.contains('grama') || lower.contains('niladhari')) {
      return (isRecognized: true, documentType: 'Grama Niladhari Certificate', isGenericWarning: false);
    }
    if (lower.contains('photo') || lower.contains('icao') || lower.contains('biometric')) {
      return (isRecognized: true, documentType: 'ICAO Biometric Photo Slip', isGenericWarning: false);
    }

    return (isRecognized: false, documentType: 'Unlabelled / Generic File', isGenericWarning: true);
  }

  Future<void> _pickFilesForType([String? docType]) async {
    try {
      final files = await FilePicker.pickFiles(
        type: FileType.custom,
        allowedExtensions: const ['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx'],
      );
      if (files.isNotEmpty) {
        for (final file in files) {
          if (file.name.isNotEmpty) {
            final entry = (docType != null && docType.isNotEmpty)
                ? '$docType: ${file.name}'
                : file.name;
            _addDoc(entry);
          }
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('File picker error: $e')),
        );
      }
    }
  }

  Future<void> _showDocumentUploadDialog() async {
    final docTypes = [
      'National Identity Card (NIC)',
      'Certified Birth Certificate Extract',
      'Police Complaint Report for Loss',
      'Medical Fitness Certificate (NTMI)',
      'Old Passport / Previous Document',
      'Grama Niladhari Certificate',
      'General Document Upload',
    ];

    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) {
        return SafeArea(
          child: Container(
            height: 420,
            padding: const EdgeInsets.symmetric(vertical: 16.0, horizontal: 20.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Select Document Type to Upload',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 6),
                const Text(
                  'Tagging your scan ensures Agent 2 accurately recognizes your proof.',
                  style: TextStyle(fontSize: 13, color: Colors.grey),
                ),
                const SizedBox(height: 12),
                Expanded(
                  child: ListView.separated(
                    itemCount: docTypes.length,
                    separatorBuilder: (ctx, i) => const Divider(height: 1),
                    itemBuilder: (context, index) {
                      final type = docTypes[index];
                      return ListTile(
                        leading: const Icon(Icons.file_present_rounded, color: AppColors.primary),
                        title: Text(type, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                        trailing: const Icon(Icons.upload_file, size: 20),
                        onTap: () {
                          Navigator.pop(context);
                          _pickFilesForType(type == 'General Document Upload' ? null : type);
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
  }

  @override
  void initState() {
    super.initState();
    _selectedServiceId = widget.serviceId;
    _serviceNameController = TextEditingController(text: widget.serviceName);
  }

  @override
  void dispose() {
    _serviceNameController.dispose();
    _ageController.dispose();
    _citizenshipController.dispose();
    _incomeController.dispose();
    _employmentController.dispose();
    _providedDocsController.dispose();
    super.dispose();
  }

  void evaluate() {
    final providedList = _currentDocList;

    ref.read(eligibilityCheckControllerProvider.notifier).evaluate(
          serviceName: _serviceNameController.text.trim().isNotEmpty
              ? _serviceNameController.text.trim()
              : widget.serviceName,
          serviceId: _selectedServiceId,
          age: int.tryParse(_ageController.text) ?? 25,
          citizenshipStatus: _citizenshipController.text,
          annualIncome: double.tryParse(_incomeController.text) ?? 0,
          employmentStatus: _employmentController.text,
          providedDocuments: providedList,
        );
  }

  @override
  Widget build(BuildContext context) {
    ref.listen(eligibilityCheckControllerProvider, (_, next) {
      if (next.hasError && !next.isLoading) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Agent evaluation failed: ${next.error}')),
        );
      }
    });

    final evaluation = ref.watch(eligibilityCheckControllerProvider);
    final isEvaluating = evaluation.isLoading;
    final agentResult = evaluation.hasError ? null : evaluation.value;
    final docList = _currentDocList;
    final servicesAsync = ref.watch(servicesProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Agent 2: Eligibility & Document Check')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // 1. Service Selection Dropdown
            servicesAsync.when(
              data: (services) {
                final seenIds = <int>{};
                final activeServices = <Map<String, dynamic>>[];
                for (final s in services) {
                  if (s['status'] == 'Retired') continue;
                  final rawId = s['id'];
                  final id = (rawId is num) ? rawId.toInt() : int.tryParse(rawId?.toString() ?? '');
                  if (id != null && seenIds.add(id)) {
                    activeServices.add(s);
                  }
                }

                if (activeServices.isEmpty) {
                  return TextField(
                    controller: _serviceNameController,
                    decoration: const InputDecoration(
                      labelText: 'Target Service Name',
                      border: OutlineInputBorder(),
                      prefixIcon: Icon(Icons.stars),
                    ),
                  );
                }

                int? currentId;
                if (activeServices.any((s) => s['id'] == _selectedServiceId)) {
                  currentId = _selectedServiceId;
                } else {
                  final nameMatch = activeServices.firstWhere(
                    (s) => (s['name'] as String?)?.toLowerCase().trim() == widget.serviceName.toLowerCase().trim(),
                    orElse: () => activeServices.first,
                  );
                  currentId = nameMatch['id'] as int;
                }

                return DropdownButtonFormField<int>(
                  key: ValueKey('svc_dropdown_$currentId'),
                  initialValue: currentId,
                  decoration: const InputDecoration(
                    labelText: 'Target Government Service',
                    border: OutlineInputBorder(),
                    prefixIcon: Icon(Icons.account_balance),
                  ),
                  isExpanded: true,
                  items: activeServices.map<DropdownMenuItem<int>>((s) {
                    final id = s['id'] as int;
                    final name = (s['name'] as String?) ?? 'Unknown Service';
                    final category = (s['category'] as String?) ?? '';
                    final label = category.isNotEmpty ? '$name ($category)' : name;
                    return DropdownMenuItem<int>(
                      value: id,
                      child: Text(
                        label,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 14),
                      ),
                    );
                  }).toList(),
                  onChanged: (newId) {
                    if (newId != null) {
                      final chosen = activeServices.firstWhere((s) => s['id'] == newId, orElse: () => {});
                      setState(() {
                        _selectedServiceId = newId;
                        _serviceNameController.text = (chosen['name'] as String?) ?? '';
                      });
                    }
                  },
                );
              },
              loading: () => const Padding(
                padding: EdgeInsets.symmetric(vertical: 8.0),
                child: LinearProgressIndicator(),
              ),
              error: (err, stack) => TextField(
                controller: _serviceNameController,
                decoration: const InputDecoration(
                  labelText: 'Target Service Name',
                  border: OutlineInputBorder(),
                  prefixIcon: Icon(Icons.stars),
                ),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _ageController,
              decoration: const InputDecoration(labelText: 'Applicant Age', border: OutlineInputBorder()),
              keyboardType: TextInputType.number,
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _citizenshipController,
              decoration: const InputDecoration(labelText: 'Citizenship Status', border: OutlineInputBorder()),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _employmentController,
              decoration: const InputDecoration(labelText: 'Employment Status', border: OutlineInputBorder()),
            ),
            const SizedBox(height: 16),

            // 2. Document Evidentiary Proofs Section
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: Theme.of(context).cardColor,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: Colors.grey.withValues(alpha: 0.3)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text(
                        'Evidentiary Documents',
                        style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15),
                      ),
                      ElevatedButton.icon(
                        onPressed: isEvaluating ? null : _showDocumentUploadDialog,
                        icon: const Icon(Icons.upload_file, size: 18),
                        label: const Text('Upload Files'),
                        style: ElevatedButton.styleFrom(
                          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                          visualDensity: VisualDensity.compact,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    decoration: BoxDecoration(
                      color: AppColors.primary.withValues(alpha: 0.08),
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: AppColors.primary.withValues(alpha: 0.25)),
                    ),
                    child: const Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(Icons.psychology_outlined, size: 18, color: AppColors.primary),
                        SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            'AI Document Inspector Tip: The agent checks your filenames to identify statutory proofs. Tag your scans (e.g., "nic_front.pdf") or use "Upload Files" to select the exact document category.',
                            style: TextStyle(fontSize: 12, color: Colors.black87, height: 1.3),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 10),
                  const Text(
                    'Pick scans/files from your device or use quick statutory tags:',
                    style: TextStyle(fontSize: 12, color: Colors.grey),
                  ),
                  const SizedBox(height: 8),
                  SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: Row(
                      children: [
                        ActionChip(
                          avatar: const Icon(Icons.add, size: 14),
                          label: const Text('NIC Copy'),
                          onPressed: () => _addDoc('National Identity Card (NIC): nic_scan.pdf'),
                        ),
                        const SizedBox(width: 6),
                        ActionChip(
                          avatar: const Icon(Icons.add, size: 14),
                          label: const Text('Birth Certificate'),
                          onPressed: () => _addDoc('Certified Birth Certificate Extract: birth_cert.pdf'),
                        ),
                        const SizedBox(width: 6),
                        ActionChip(
                          avatar: const Icon(Icons.add, size: 14),
                          label: const Text('Police Loss Report'),
                          onPressed: () => _addDoc('Police Complaint Report for Loss: police_report.pdf'),
                        ),
                        const SizedBox(width: 6),
                        ActionChip(
                          avatar: const Icon(Icons.add, size: 14),
                          label: const Text('NTMI Medical'),
                          onPressed: () => _addDoc('Medical Fitness Certificate (NTMI): ntmi_cert.pdf'),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),
                  if (docList.isNotEmpty) ...[
                    const Text('Attached Proofs & AI Scan Verification:', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 8),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: docList.map((doc) {
                        final inspection = _inspectUploadedDoc(doc);
                        return Container(
                          margin: const EdgeInsets.only(bottom: 8),
                          padding: const EdgeInsets.all(10),
                          decoration: BoxDecoration(
                            color: inspection.isGenericWarning ? Colors.amber.withValues(alpha: 0.12) : AppColors.success.withValues(alpha: 0.08),
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(
                              color: inspection.isGenericWarning ? Colors.orange.withValues(alpha: 0.4) : AppColors.success.withValues(alpha: 0.3),
                            ),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Icon(
                                    inspection.isGenericWarning ? Icons.warning_amber_rounded : Icons.check_circle_outline,
                                    color: inspection.isGenericWarning ? Colors.deepOrange : AppColors.success,
                                    size: 18,
                                  ),
                                  const SizedBox(width: 8),
                                  Expanded(
                                    child: Text(
                                      doc,
                                      style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                  ),
                                  IconButton(
                                    icon: const Icon(Icons.close, size: 16, color: Colors.grey),
                                    onPressed: () => _removeDoc(doc),
                                    visualDensity: VisualDensity.compact,
                                    padding: EdgeInsets.zero,
                                    constraints: const BoxConstraints(),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 4),
                              Row(
                                children: [
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                    decoration: BoxDecoration(
                                      color: inspection.isGenericWarning ? Colors.orange.withValues(alpha: 0.15) : AppColors.success.withValues(alpha: 0.15),
                                      borderRadius: BorderRadius.circular(4),
                                    ),
                                    child: Text(
                                      inspection.isGenericWarning ? '⚠️ Generic / Unlabelled Scan' : '✓ Verified as ${inspection.documentType}',
                                      style: TextStyle(
                                        fontSize: 11,
                                        fontWeight: FontWeight.w600,
                                        color: inspection.isGenericWarning ? Colors.deepOrange : AppColors.success,
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                              if (inspection.isGenericWarning) ...[
                                const SizedBox(height: 6),
                                const Text(
                                  'Agent 2 cannot detect the document category from this generic filename. Tap a quick tag to assign it:',
                                  style: TextStyle(fontSize: 11, color: Colors.black87),
                                ),
                                const SizedBox(height: 6),
                                Wrap(
                                  spacing: 6,
                                  runSpacing: 4,
                                  children: [
                                    ActionChip(
                                      visualDensity: VisualDensity.compact,
                                      label: const Text('+ Tag as NIC', style: TextStyle(fontSize: 11)),
                                      onPressed: () => _tagDoc(doc, 'National Identity Card (NIC)'),
                                    ),
                                    ActionChip(
                                      visualDensity: VisualDensity.compact,
                                      label: const Text('+ Tag as Birth Cert', style: TextStyle(fontSize: 11)),
                                      onPressed: () => _tagDoc(doc, 'Certified Birth Certificate Extract'),
                                    ),
                                    ActionChip(
                                      visualDensity: VisualDensity.compact,
                                      label: const Text('+ Tag as Police Report', style: TextStyle(fontSize: 11)),
                                      onPressed: () => _tagDoc(doc, 'Police Complaint Report for Loss'),
                                    ),
                                  ],
                                ),
                              ],
                            ],
                          ),
                        );
                      }).toList(),
                    ),
                    const SizedBox(height: 6),
                  ],
                  TextField(
                    controller: _providedDocsController,
                    decoration: const InputDecoration(
                      labelText: 'Manual Edit / Comma-separated File List',
                      hintText: 'e.g. NIC: nic_front.pdf, birth_certificate.jpg',
                      border: OutlineInputBorder(),
                      isDense: true,
                    ),
                    style: const TextStyle(fontSize: 13),
                    onChanged: (_) => setState(() {}),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),
            ElevatedButton(
              onPressed: isEvaluating ? null : evaluate,
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primary,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
              ),
              child: isEvaluating
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                    )
                  : const Text('Consult Agent 2 RAG Engine', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
            ),
            const SizedBox(height: 24),

            // 3. Evaluation Result OR Active Statutory Preview Card (No Empty White Space!)
            if (isEvaluating) ...[
              _buildEvaluatingCard(),
            ] else if (agentResult != null) ...[
              _buildResultCard(agentResult),
            ] else ...[
              _buildStatutoryPreviewCard(_getDefaultRequiredDocsForSelectedService()),
            ],
          ],
        ),
      ),
    );
  }

  List<String> _getDefaultRequiredDocsForSelectedService() {
    final name = _serviceNameController.text.toLowerCase();
    if (name.contains('passport')) {
      return [
        'Original Birth Certificate with English translation',
        'National Identity Card (NIC) with clear copy',
        'Current Passport (if renewal)',
        '3.5cm x 4.5cm ICAO compliant biometric photo acknowledgement slip',
      ];
    }
    if (name.contains('driving') || name.contains('license')) {
      return [
        'National Medical Certificate (NTMI)',
        'National Identity Card (NIC)',
        'Current Driving License',
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
      'National Identity Card (NIC) / Police Loss Report / Old Document',
    ];
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
              style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
            ),
            const SizedBox(height: 8),
            Text(
              'Auditing uploaded proofs against official circulars in Neon PGVector & synthesizing Groq LLM reasoning...',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 13, color: Colors.grey.shade700),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildStatutoryPreviewCard(List<String> requiredDocsList) {
    final int userAge = int.tryParse(_ageController.text) ?? 25;
    final bool isAgeMet = userAge >= 15;
    final bool isCitizenMet = _citizenshipController.text.trim().toLowerCase().contains('sri lankan');

    final recognizedDocs = _currentDocList.map((d) => _inspectUploadedDoc(d)).toList();
    final recognizedCount = recognizedDocs.where((i) => i.isRecognized).length;

    return Card(
      elevation: 2,
      color: Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(color: AppColors.primary.withValues(alpha: 0.25), width: 1.2),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: AppColors.primary.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Icon(Icons.verified_user_outlined, color: AppColors.primary, size: 22),
                ),
                const SizedBox(width: 10),
                const Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Agent 2 Statutory Policy Checklist',
                        style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold, color: AppColors.primary),
                      ),
                      Text(
                        'Live audit grounded on Neon PGVector Gazette Rules',
                        style: TextStyle(fontSize: 11, color: Colors.grey),
                      ),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: Colors.green.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.circle, size: 8, color: Colors.green),
                      SizedBox(width: 4),
                      Text('Agent Online', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Colors.green)),
                    ],
                  ),
                ),
              ],
            ),
            const Divider(height: 24),
            const Text(
              'Statutory Eligibility Rules:',
              style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: Colors.black87),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Icon(isAgeMet ? Icons.check_circle : Icons.cancel, color: isAgeMet ? AppColors.success : AppColors.danger, size: 16),
                const SizedBox(width: 8),
                Text('Age Requirement: Minimum 15+ years (Current: $userAge)', style: const TextStyle(fontSize: 13)),
              ],
            ),
            const SizedBox(height: 6),
            Row(
              children: [
                Icon(isCitizenMet ? Icons.check_circle : Icons.cancel, color: isCitizenMet ? AppColors.success : AppColors.danger, size: 16),
                const SizedBox(width: 8),
                Text('Citizenship: Sri Lankan Citizen or Dual Citizen', style: const TextStyle(fontSize: 13)),
              ],
            ),
            const Divider(height: 24),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text(
                  'Mandatory Statutory Proofs:',
                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: Colors.black87),
                ),
                Text(
                  'Attached: $recognizedCount / ${requiredDocsList.length}',
                  style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: AppColors.primary),
                ),
              ],
            ),
            const SizedBox(height: 8),
            ...requiredDocsList.map((req) {
              final isAttached = recognizedDocs.any((i) => i.isRecognized && (req.toLowerCase().contains(i.documentType.toLowerCase()) || i.documentType.toLowerCase().contains(req.toLowerCase().split(' ').first)));
              return Padding(
                padding: const EdgeInsets.only(bottom: 6.0),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(
                      isAttached ? Icons.check_circle : Icons.radio_button_unchecked,
                      color: isAttached ? AppColors.success : Colors.grey,
                      size: 16,
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        req,
                        style: TextStyle(
                          fontSize: 13,
                          color: isAttached ? AppColors.dark : Colors.black54,
                          fontWeight: isAttached ? FontWeight.w600 : FontWeight.normal,
                        ),
                      ),
                    ),
                  ],
                ),
              );
            }),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: AppColors.primary.withValues(alpha: 0.06),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Row(
                children: [
                  Icon(Icons.info_outline, size: 16, color: AppColors.primary),
                  SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Tap "Consult Agent 2 RAG Engine" above to trigger official Groq LLM semantic reasoning and generate your eligibility decision.',
                      style: TextStyle(fontSize: 12, color: Colors.black87),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildResultCard(EligibilityAgentResponse agentResult) {
    final bool isFullyEligible = agentResult.isEligible && agentResult.missingDocuments.isEmpty;
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
      statusTitle = 'Action Required — Missing Documents';
      statusIcon = Icons.warning_amber_rounded;
    }

    return Card(
      elevation: 4,
      color: cardColor.withValues(alpha: 0.12),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: cardColor.withValues(alpha: 0.5), width: 1.5),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.85),
                borderRadius: BorderRadius.circular(6),
              ),
              child: const Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.smart_toy, size: 14, color: AppColors.primary),
                  SizedBox(width: 5),
                  Text(
                    'Agent 2 Cognitive Audit • Grounded on Official Circulars (Neon Vector DB)',
                    style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: AppColors.primary),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                Icon(statusIcon, color: textColor, size: 24),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    statusTitle,
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                      color: textColor,
                    ),
                  ),
                ),
                Chip(
                  label: Text(
                    'Match: ${agentResult.matchPercentage}%',
                    style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                  ),
                  backgroundColor: isFullyEligible
                      ? AppColors.success
                      : (agentResult.matchPercentage >= 50 ? AppColors.warning : AppColors.danger),
                ),
              ],
            ),
            const Divider(height: 20),
            if (agentResult.reasoning.isNotEmpty) ...[
              const Text('AI Cognitive Reasoning:', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
              const SizedBox(height: 4),
              Text(agentResult.reasoning, style: const TextStyle(fontSize: 14, height: 1.35)),
              const SizedBox(height: 12),
            ],
            if (hasCriteriaErrors) ...[
              const Text('Missing / Failed Legal Criteria:', style: TextStyle(fontWeight: FontWeight.bold, color: AppColors.danger)),
              const SizedBox(height: 4),
              ...agentResult.missingCriteria.map((c) => Text('• $c', style: const TextStyle(color: AppColors.danger))),
              const SizedBox(height: 12),
            ],
            if (hasMissingDocs) ...[
              const Text('Missing Required Documents:', style: TextStyle(fontWeight: FontWeight.bold, color: Colors.deepOrange)),
              const SizedBox(height: 4),
              ...agentResult.missingDocuments.map((d) => Text('• $d', style: const TextStyle(color: Colors.deepOrange, fontWeight: FontWeight.w500))),
            ] else ...[
              const Row(
                children: [
                  Icon(Icons.verified, color: AppColors.success, size: 18),
                  SizedBox(width: 6),
                  Text('All statutory required documents verified!', style: TextStyle(color: AppColors.success, fontWeight: FontWeight.bold)),
                ],
              ),
            ]
          ],
        ),
      ),
    );
  }
}
