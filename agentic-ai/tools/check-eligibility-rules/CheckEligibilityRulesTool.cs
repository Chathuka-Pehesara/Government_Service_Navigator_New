using System.Collections.Generic;

namespace Government_Service_Navigator.AgenticAi.Tools.CheckEligibilityRules;

public class EligibilityRuleResult
{
    public bool IsEligible { get; set; } = true;
    public int ScorePercentage { get; set; } = 100;
    public List<string> MissingCriteria { get; set; } = new();
}

public interface ICheckEligibilityRulesTool
{
    EligibilityRuleResult EvaluateRules(int serviceId, int age, string citizenship);
}

public class CheckEligibilityRulesTool : ICheckEligibilityRulesTool
{
    public EligibilityRuleResult EvaluateRules(int serviceId, int age, string citizenship)
    {
        var result = new EligibilityRuleResult();
        
        if (age < 18)
        {
            result.IsEligible = false;
            result.ScorePercentage -= 50;
            result.MissingCriteria.Add("Applicant must be at least 18 years old.");
        }

        var c = citizenship?.Trim().ToLowerInvariant() ?? "";
        if (string.IsNullOrWhiteSpace(c) || (!c.Contains("sri lankan") && !c.Contains("sri lanka") && !c.Contains("descent") && !c.Contains("registration") && !c.Contains("citizen")))
        {
            result.ScorePercentage -= 30;
            result.MissingCriteria.Add("Non-resident/foreign citizenship requires additional clearance.");
        }

        return result;
    }
}
