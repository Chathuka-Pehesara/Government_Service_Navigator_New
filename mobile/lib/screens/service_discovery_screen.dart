import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../providers/catalog_providers.dart';
import 'procedure_detail_screen.dart';

class ServiceDiscoveryScreen extends ConsumerStatefulWidget {
  final String initialCategory;
  const ServiceDiscoveryScreen({super.key, this.initialCategory = 'All'});

  @override
  ConsumerState<ServiceDiscoveryScreen> createState() => _ServiceDiscoveryScreenState();
}

class _ServiceDiscoveryScreenState extends ConsumerState<ServiceDiscoveryScreen> {
  String searchQuery = '';
  late String selectedCategory;

  final List<String> categories = ['All', 'Commerce', 'Transport', 'Identity', 'Housing', 'Taxes'];

  @override
  void initState() {
    super.initState();
    selectedCategory = widget.initialCategory;
  }

  void filterSearch(String query) => setState(() => searchQuery = query);

  void filterCategory(String category) => setState(() => selectedCategory = category);

  List<Map<String, dynamic>> applyFilters(List<Map<String, dynamic>> services) {
    return services.where((service) {
      final serviceName = service['name']?.toLowerCase() ?? '';
      final serviceId = service['serviceId']?.toLowerCase() ?? '';
      final serviceCategory = service['category'] ?? '';

      final matchesSearch = serviceName.contains(searchQuery.toLowerCase()) ||
                            serviceId.contains(searchQuery.toLowerCase());
      
      final matchesCategory = selectedCategory == 'All' || 
                            serviceCategory.toLowerCase() == selectedCategory.toLowerCase();
      
      return matchesSearch && matchesCategory;
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    final services = ref.watch(servicesProvider);
    final filteredServices = applyFilters(services.value ?? const []);

    return Scaffold(
      appBar: AppBar(title: Text(selectedCategory == 'All' ? 'Government Services' : '$selectedCategory Services')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(12.0),
            child: TextField(
              onChanged: filterSearch,
              decoration: const InputDecoration(
                labelText: 'Search procedures...',
                prefixIcon: Icon(Icons.search),
                border: OutlineInputBorder(),
              ),
            ),
          ),
          SizedBox(
            height: 50,
            child: ListView.builder(
              scrollDirection: Axis.horizontal,
              itemCount: categories.length,
              itemBuilder: (context, index) {
                final cat = categories[index];
                return Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 4.0),
                  child: ChoiceChip(
                    label: Text(cat),
                    selected: selectedCategory == cat,
                    onSelected: (selected) => filterCategory(cat),
                  ),
                );
              },
            ),
          ),
          Expanded(
            child: services.isLoading
                ? const Center(child: CircularProgressIndicator())
                : filteredServices.isEmpty
                    ? const Center(child: Text('No services found in this category.'))
                    : ListView.separated(
                        itemCount: filteredServices.length,
                        separatorBuilder: (context, index) => const Divider(height: 1, thickness: 0.8),
                        itemBuilder: (context, index) {
                          final service = filteredServices[index];
                          final fees = service['feeSchedules'] as List? ?? [];
                          final feeString = fees.isNotEmpty ? 'LKR ${fees[0]['amount']}' : 'Free';

                          return ListTile(
                            contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                            title: Text(
                              service['name'] ?? '', 
                              style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14.5),
                            ),
                            subtitle: Padding(
                              padding: const EdgeInsets.only(top: 4.0),
                              child: Text(
                                'Category: ${service['category']}  •  Fee: $feeString',
                                style: const TextStyle(fontSize: 12.5),
                              ),
                            ),
                            trailing: const Icon(Icons.arrow_forward_ios, size: 14),
                            onTap: () {
                              Navigator.push(
                                context,
                                MaterialPageRoute(
                                  builder: (context) => ProcedureDetailScreen(serviceId: service['id']),
                                ),
                              );
                            },
                          );
                        },
                      ),
          ),
        ],
      ),
    );
  }
}
