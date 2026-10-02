using System;
using System.Collections.Concurrent;
using System.Linq;
using System.Threading.Tasks;
using Government_Service_Navigator.AgenticAi.Schemas;

namespace Government_Service_Navigator.AgenticAi.Tools.CheckDuplicateApplication
{
    public class DuplicateCheckTool : IDuplicateCheckTool
    {
        private readonly IDuplicateApplicationRepository? _repository;
        private static readonly ConcurrentDictionary<string, string> ActiveApplicationRegistry = new();

        // Inject the interface instead of AppDbContext
        public DuplicateCheckTool(IDuplicateApplicationRepository? repository = null)
        {
            _repository = repository;
        }

        public async Task<DuplicateCheckOutcome> CheckAsync(string citizenNic, int serviceProcedureId, int currentApplicationId = 0)
        {
            string key = $"{citizenNic.Trim().ToUpperInvariant()}_{serviceProcedureId}";

            // 1. Check in-memory fast registry
            if (ActiveApplicationRegistry.TryGetValue(key, out var existingRef))
            {
                bool isSameApp = currentApplicationId > 0 && (
                    existingRef.EndsWith($"-{currentApplicationId}") ||
                    existingRef == $"APP-{currentApplicationId}" ||
                    existingRef == $"APP-2026-{currentApplicationId}");

                // When repository is available, verify with database ground truth to prevent stale memory registry blocking
                if (!isSameApp && _repository != null)
                {
                    bool isDuplicateInDb = await _repository.HasDuplicateAsync(citizenNic, serviceProcedureId, currentApplicationId);
                    if (!isDuplicateInDb)
                    {
                        // In DB, no conflicting application exists for this citizen/procedure; this is safe!
                        isSameApp = true;
                        if (currentApplicationId > 0)
                        {
                            ActiveApplicationRegistry[key] = $"APP-2026-{currentApplicationId}";
                        }
                        else
                        {
                            ActiveApplicationRegistry.TryRemove(key, out _);
                        }
                    }
                }

                if (!isSameApp)
                {
                    return new DuplicateCheckOutcome
                    {
                        IsDuplicate = true,
                        ExistingReference = existingRef,
                        Message = $"DUP-001: Active application '{existingRef}' already exists for citizen '{citizenNic}' on service procedure #{serviceProcedureId}.",
                        ComplianceCheck = new ComplianceCheckItem(
                            "Anti-Fraud Duplicate Application Check", 
                            false, 
                            $"Duplicate active case found: {existingRef}."
                        )
                    };
                }
            }

            // 2. Check Database via decoupled repository
            if (_repository != null)
            {
                bool isDuplicate = await _repository.HasDuplicateAsync(citizenNic, serviceProcedureId, currentApplicationId);
                
                if (isDuplicate)
                {
                    return new DuplicateCheckOutcome
                    {
                        IsDuplicate = true,
                        ExistingReference = "DB-MATCH",
                        Message = "DUP-002: Active application already exists in the system.",
                        ComplianceCheck = new ComplianceCheckItem(
                            "Anti-Fraud Duplicate Application Check", 
                            false, 
                            "Found active application in database."
                        )
                    };
                }
            }

            // Not a duplicate
            return new DuplicateCheckOutcome
            {
                IsDuplicate = false,
                ExistingReference = null,
                Message = "No conflicting duplicate submissions found.",
                ComplianceCheck = new ComplianceCheckItem(
                    "Anti-Fraud Duplicate Application Check", 
                    true, 
                    "Zero existing pending submissions for this citizen."
                )
            };
        }

        public void RegisterApplication(string citizenNic, int serviceProcedureId, string reference)
        {
            string key = $"{citizenNic.Trim().ToUpperInvariant()}_{serviceProcedureId}";
            ActiveApplicationRegistry[key] = reference;
        }

        public static void ClearRegistry()
        {
            ActiveApplicationRegistry.Clear();
        }
    }
}
