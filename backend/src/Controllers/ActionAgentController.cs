using Government_Service_Navigator.AgenticAi.Agents.ActionToolAgent;
using Government_Service_Navigator.AgenticAi.Agents.ActionToolAgent.DTOs;
using Government_Service_Navigator.AgenticAi.Agents.EligibilityDocumentAgent;
using Government_Service_Navigator.AgenticAi.Agents.EligibilityDocumentAgent.DTOs;
using Government_Service_Navigator.AgenticAi.Orchestration;
using Government_Service_Navigator.AgenticAi.State;
using Government_Service_Navigator.AgenticAi.Tools.PrefillApplication;
using Government_Service_Navigator.Backend.Data.Context;
using Government_Service_Navigator.Backend.Models.Entities;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Data;
using System.Text.Json;

namespace Government_Service_Navigator.Backend.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ActionAgentController : ControllerBase
{
    private readonly IActionToolAgent _actionAgent;
    private readonly IAgent3WorkflowOrchestrator _orchestrator;
    private readonly IEligibilityDocumentAgent _eligibilityAgent;
    private readonly AppDbContext _context;

    public ActionAgentController(
        IActionToolAgent actionAgent,
        IAgent3WorkflowOrchestrator orchestrator,
        IEligibilityDocumentAgent eligibilityAgent,
        AppDbContext context)
    {
        _actionAgent = actionAgent;
        _orchestrator = orchestrator;
        _eligibilityAgent = eligibilityAgent;
        _context = context;
    }

    /// <summary>
    /// Prepares a draft application (pre-filled form, fee, proposed appointment) using the
    /// Action/Tool Agent. If no eligibility result is supplied, Agent 2 is run first.
    /// </summary>
    [HttpPost("draft")]
    public async Task<IActionResult> PrepareDraft([FromBody] ActionAgentQueryDto query)
    {
        if (query.ServiceProcedureId <= 0 || string.IsNullOrWhiteSpace(query.ServiceName))
            return BadRequest("ServiceProcedureId and ServiceName are required.");

        try
        {
            var request = await BuildRequestAsync(query);
            var response = await _actionAgent.PrepareDraftAsync(request);
            return Ok(response);
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { message = "Draft preparation failed", details = ex.Message });
        }
    }

    /// <summary>
    /// Executes the Agent 3 stage in the Workflow Orchestrator pipeline and returns state
    /// </summary>
    [HttpPost("orchestrate")]
    public async Task<IActionResult> OrchestrateDraft([FromBody] ActionAgentQueryDto query)
    {
        if (query.ServiceProcedureId <= 0 || string.IsNullOrWhiteSpace(query.ServiceName))
            return BadRequest("ServiceProcedureId and ServiceName are required.");

        var request = await BuildRequestAsync(query);

        var state = WorkflowExecutionState.Create(
            applicationId: request.ApplicationId,
            citizenNic: request.Applicant.CitizenNic,
            serviceName: request.ServiceName);
        state.EligibilityResult = request.Eligibility;

        var updatedState = await _orchestrator.ExecuteDraftingStageAsync(state, request);
        return Ok(updatedState);
    }

    private async Task<ActionDraftRequest> BuildRequestAsync(ActionAgentQueryDto query)
    {
        var providedDocuments = query.ProvidedDocuments ?? new List<string>();

        var eligibility = query.Eligibility;
        if (eligibility == null)
        {
            var profile = new CitizenProfile
            {
                Age = query.Age,
                CitizenshipStatus = query.CitizenshipStatus,
                AnnualIncome = query.AnnualIncome,
                EmploymentStatus = query.EmploymentStatus,
                ProvidedDocuments = providedDocuments,
                AdditionalAttributes = query.AdditionalAttributes ?? new Dictionary<string, string>()
            };

            eligibility = await _eligibilityAgent.EvaluateEligibilityAsync(
                new EligibilityPlanRequest(query.ServiceName, query.ServiceProcedureId, profile, query.PlanSummary, query.Stage));
        }

        return new ActionDraftRequest(
            ApplicationId: query.ApplicationId,
            ServiceProcedureId: query.ServiceProcedureId,
            ServiceName: query.ServiceName,
            Applicant: new ApplicantDetails
            {
                CitizenNic = query.CitizenNic,
                FullName = query.FullName,
                Email = query.Email,
                Age = query.Age,
                CitizenshipStatus = query.CitizenshipStatus,
                AnnualIncome = query.AnnualIncome,
                EmploymentStatus = query.EmploymentStatus,
                AdditionalAttributes = query.AdditionalAttributes ?? new Dictionary<string, string>()
            },
            Eligibility: eligibility,
            ProvidedDocuments: providedDocuments,
            PreferredAppointmentDateUtc: query.PreferredAppointmentDateUtc,
            ExpressProcessing: query.ExpressProcessing,
            Stage: query.Stage);
    }

    /// <summary>
    /// Agent 3: Books an appointment slot based on citizen's free-form natural language time input.
    /// Resolves the department of the last completed stage.
    /// If slot is available, reserves the booking, notifies the department desk, and sends confirmation.
    /// If unavailable, returns Agent 3 reasoning and available alternative slots for that day.
    /// </summary>
    [HttpPost("book-appointment")]
    public async Task<IActionResult> BookAppointment([FromBody] AppointmentBookingRequestDto request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.PreferredTimeInput))
        {
            return BadRequest(new { message = "PreferredTimeInput cannot be empty." });
        }

        // The department admin identifies bookings by NIC, so never store the placeholder when it can be found
        request.CitizenNic = await ResolveCitizenNicAsync(request.CitizenNic, request.ApplicationId);

        // 1. Resolve department of the last completed stage
        string resolvedDept = request.DepartmentName ?? string.Empty;
        if (string.IsNullOrWhiteSpace(resolvedDept))
        {
            resolvedDept = await ResolveDepartmentForApplicationAsync(request.ApplicationId, request.ServiceName);
        }

        // 2. One booking per application: a new request moves the existing booking instead of adding another
        var existing = await FindActiveBookingAsync(request.ApplicationId);

        // 3. Load department-specific collection slots and how full each one is on each upcoming date
        var configuredSlots = await LoadConfiguredSlotsForDepartmentAsync(resolvedDept);
        var dateUsage = await LoadSlotDateUsageAsync(resolvedDept, configuredSlots, existing?.Id);

        // 3. Call Agent 3 logic with department's unique slots and real capacity
        var agentRequest = new AppointmentBookingRequest(
            ApplicationId: request.ApplicationId,
            ServiceName: request.ServiceName,
            CitizenNic: request.CitizenNic ?? "CITIZEN",
            PreferredTimeInput: request.PreferredTimeInput,
            DepartmentName: resolvedDept,
            ServiceProcedureId: request.ServiceProcedureId,
            Stage: request.Stage,
            ConfiguredSlots: configuredSlots,
            DateUsage: dateUsage
        );

        var response = await _actionAgent.BookAppointmentAsync(agentRequest, cancellationToken);

        // 4. If booked, persist to database so department admin sees the booking & citizen gets in-app notification
        if (response.IsBooked)
        {
            if (existing != null)
            {
                // Rescheduled: the citizen keeps their original reference
                response = response with
                {
                    ConfirmationCode = existing.ConfirmationCode ?? response.ConfirmationCode,
                    Message = $"Your appointment at {resolvedDept} has been moved to {response.BookedDate} ({response.BookedTime}). Your reference is unchanged."
                };
            }
            await PersistBookingAsync(request, response, resolvedDept, existing?.Id);
        }

        return Ok(response);
    }

    private async Task<List<DepartmentSlotInfo>> LoadConfiguredSlotsForDepartmentAsync(string departmentName)
    {
        var slots = new List<DepartmentSlotInfo>();
        try
        {
            var conn = _context.Database.GetDbConnection();
            bool wasClosed = conn.State == ConnectionState.Closed;
            if (wasClosed) await conn.OpenAsync();

            try
            {
                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
                    SELECT s.""Id"", s.""DayOfWeek"", CAST(s.""StartTime"" AS varchar), CAST(s.""EndTime"" AS varchar), 
                           s.""MaxCapacity"", s.""IsActive"",
                           COALESCE((
                               SELECT COUNT(*)::int FROM ""CollectionBookings"" b
                               WHERE LOWER(b.""DepartmentName"") LIKE LOWER('%' || s.""DepartmentName"" || '%')
                                 AND b.""Status"" = 'Confirmed'
                                 AND b.""BookedDate"" = " + CollectionSlotSql.NextDateOfSlotDay + @"
                                 AND " + CollectionSlotSql.BookingStartTime + @" = SUBSTRING(CAST(s.""StartTime"" AS varchar) FROM 1 FOR 5)
                           ), 0) AS ""BookedCount"",
                           COALESCE(s.""DepartmentName"", @deptVal)
                    FROM ""CollectionTimeSlots"" s
                    WHERE LOWER(s.""DepartmentName"") LIKE LOWER(@dept) AND s.""IsActive"" = TRUE
                    ORDER BY s.""DayOfWeek"", s.""StartTime"";
                ";
                var p = cmd.CreateParameter();
                p.ParameterName = "@dept";
                p.Value = $"%{departmentName.Trim()}%";
                cmd.Parameters.Add(p);

                var p2 = cmd.CreateParameter();
                p2.ParameterName = "@deptVal";
                p2.Value = departmentName.Trim();
                cmd.Parameters.Add(p2);

                using var reader = await cmd.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                {
                    slots.Add(new DepartmentSlotInfo(
                        Id: reader.GetInt32(0),
                        DayOfWeek: reader.GetInt32(1),
                        StartTime: reader.GetString(2),
                        EndTime: reader.GetString(3),
                        MaxCapacity: reader.GetInt32(4),
                        BookedCount: reader.GetInt32(6),
                        IsActive: reader.GetBoolean(5),
                        DepartmentName: reader.GetString(7)
                    ));
                }
            }
            finally
            {
                if (wasClosed) await conn.CloseAsync();
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[LoadConfiguredSlotsForDepartment] {ex.Message}");
        }

        return slots;
    }

    private sealed record ActiveBooking(int Id, string? ConfirmationCode);

    private async Task<ActiveBooking?> FindActiveBookingAsync(string? applicationCode)
    {
        if (string.IsNullOrWhiteSpace(applicationCode)) return null;
        try
        {
            var conn = _context.Database.GetDbConnection();
            bool wasClosed = conn.State == ConnectionState.Closed;
            if (wasClosed) await conn.OpenAsync();
            try
            {
                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
                    SELECT ""Id"", ""ConfirmationCode"" FROM ""CollectionBookings""
                    WHERE ""Status"" = 'Confirmed' AND UPPER(""ApplicationCode"") = UPPER(@code)
                    ORDER BY ""CreatedAt"" DESC
                    LIMIT 1;";
                var p = cmd.CreateParameter(); p.ParameterName = "@code"; p.Value = applicationCode.Trim(); cmd.Parameters.Add(p);
                using var reader = await cmd.ExecuteReaderAsync();
                if (await reader.ReadAsync())
                {
                    return new ActiveBooking(reader.GetInt32(0), reader.IsDBNull(1) ? null : reader.GetString(1));
                }
            }
            finally
            {
                if (wasClosed) await conn.CloseAsync();
            }
        }
        catch (Exception ex)
        {
            // Table may not exist yet on a fresh database
            Console.WriteLine($"[FindActiveBooking] {ex.Message}");
        }
        return null;
    }

    /// <summary>
    /// Confirmed bookings per slot per upcoming date. The citizen's own booking is left out when
    /// rescheduling so it doesn't block moving within the same slot.
    /// </summary>
    private async Task<List<SlotDateUsage>> LoadSlotDateUsageAsync(string departmentName, List<DepartmentSlotInfo> slots, int? excludeBookingId)
    {
        var usage = new List<SlotDateUsage>();
        if (slots.Count == 0) return usage;
        try
        {
            var conn = _context.Database.GetDbConnection();
            bool wasClosed = conn.State == ConnectionState.Closed;
            if (wasClosed) await conn.OpenAsync();
            try
            {
                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
                    SELECT b.""BookedDate"", " + CollectionSlotSql.BookingStartTime + @" AS ""StartHm"", COUNT(*)::int
                    FROM ""CollectionBookings"" b
                    WHERE LOWER(b.""DepartmentName"") LIKE LOWER(@dept)
                      AND b.""Status"" = 'Confirmed'
                      AND b.""BookedDate"" >= " + CollectionSlotSql.Today + @"
                      AND b.""Id"" <> @exclude
                    GROUP BY b.""BookedDate"", ""StartHm"";";
                var p = cmd.CreateParameter(); p.ParameterName = "@dept"; p.Value = $"%{departmentName.Trim()}%"; cmd.Parameters.Add(p);
                var pEx = cmd.CreateParameter(); pEx.ParameterName = "@exclude"; pEx.Value = excludeBookingId ?? 0; cmd.Parameters.Add(pEx);

                using var reader = await cmd.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                {
                    if (reader.IsDBNull(0) || reader.IsDBNull(1)) continue;
                    var date = reader.GetDateTime(0).Date;
                    var startHm = reader.GetString(1);
                    var count = reader.GetInt32(2);

                    var slot = slots.FirstOrDefault(s =>
                        s.DayOfWeek == (int)date.DayOfWeek && s.StartTime.StartsWith(startHm, StringComparison.Ordinal));
                    if (slot != null) usage.Add(new SlotDateUsage(slot.Id, date, count));
                }
            }
            finally
            {
                if (wasClosed) await conn.CloseAsync();
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[LoadSlotDateUsage] {ex.Message}");
        }
        return usage;
    }

    // "12" or "APP-12" -> 12; 0 when it isn't a submission id
    private static int ParseApplicationId(string? applicationId)
    {
        if (string.IsNullOrWhiteSpace(applicationId)) return 0;
        var raw = applicationId.Trim();
        if (raw.StartsWith("APP-", StringComparison.OrdinalIgnoreCase)) raw = raw.Substring(4);
        return int.TryParse(raw, out var id) ? id : 0;
    }

    private static bool IsMissingNic(string? nic) =>
        string.IsNullOrWhiteSpace(nic) || nic.Equals("CITIZEN", StringComparison.OrdinalIgnoreCase);

    /// <summary>
    /// The NIC the booking belongs to: what the app sent, else the caller's token (the endpoint
    /// doesn't require one, so it may be absent), else the application's owner. The owner comes
    /// last because the app also lists demo application ids that belong to nobody in particular.
    /// </summary>
    private async Task<string> ResolveCitizenNicAsync(string? sentNic, string? applicationId)
    {
        if (!IsMissingNic(sentNic)) return sentNic!.Trim();

        var tokenNic = User.FindFirst("nicNumber")?.Value;
        if (!IsMissingNic(tokenNic)) return tokenNic!;

        var appId = ParseApplicationId(applicationId);
        if (appId > 0)
        {
            var ownerNic = await _context.ApplicationSubmissions
                .Where(s => s.Id == appId)
                .Select(s => s.CitizenNic)
                .FirstOrDefaultAsync();
            if (!IsMissingNic(ownerNic)) return ownerNic!;
        }

        return "CITIZEN";
    }

    private async Task<string> ResolveDepartmentForApplicationAsync(string? applicationId, string? serviceName)
    {
        try
        {
            int numericAppId = ParseApplicationId(applicationId);

            if (numericAppId > 0)
            {
                var submission = await _context.ApplicationSubmissions
                    .Include(s => s.ServiceProcedure)
                    .FirstOrDefaultAsync(s => s.Id == numericAppId);

                if (submission != null)
                {
                    if (!string.IsNullOrWhiteSpace(submission.CurrentDepartment))
                    {
                        return submission.CurrentDepartment;
                    }

                    if (submission.ServiceProcedure != null && !string.IsNullOrWhiteSpace(submission.ServiceProcedure.WorkflowDepartments))
                    {
                        try
                        {
                            var depts = JsonSerializer.Deserialize<List<string>>(submission.ServiceProcedure.WorkflowDepartments);
                            if (depts != null && depts.Count > 0)
                            {
                                int stageIndex = Math.Clamp(submission.CurrentStage - 1, 0, depts.Count - 1);
                                return depts[stageIndex];
                            }
                        }
                        catch { }
                    }
                }
            }
        }
        catch { }

        // Fallback mapping from service name
        var lower = (serviceName ?? string.Empty).ToLowerInvariant();
        if (lower.Contains("passport") || lower.Contains("immigration"))
            return "Department of Immigration & Emigration";
        if (lower.Contains("nic") || lower.Contains("identity") || lower.Contains("registration of persons"))
            return "Department of Registration of Persons";
        if (lower.Contains("driving") || lower.Contains("license") || lower.Contains("motor"))
            return "Department of Motor Traffic";
        if (lower.Contains("police") || lower.Contains("clearance"))
            return "Sri Lanka Police Headquarters";
        if (lower.Contains("birth") || lower.Contains("marriage") || lower.Contains("death") || lower.Contains("registrar"))
            return "Registrar General's Department";

        return "Department of Public Administration";
    }

    private async Task PersistBookingAsync(AppointmentBookingRequestDto req, AppointmentBookingResponse res, string deptName, int? existingBookingId)
    {
        try
        {
            var conn = _context.Database.GetDbConnection();
            bool wasClosed = conn.State == ConnectionState.Closed;
            if (wasClosed) await conn.OpenAsync();

            try
            {
                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
                    CREATE TABLE IF NOT EXISTS ""CollectionBookings"" (
                        ""Id"" integer GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
                        ""ApplicationId"" integer NOT NULL DEFAULT 0,
                        ""CitizenNic"" text NOT NULL,
                        ""CollectionMethod"" text NOT NULL,
                        ""PreferredTimes"" text NULL,
                        ""CreatedAt"" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        ""ApplicationCode"" text NULL,
                        ""DepartmentName"" text NULL,
                        ""ServiceName"" text NULL,
                        ""BookedDate"" date NULL,
                        ""BookedSlotTime"" text NULL,
                        ""Status"" text NOT NULL DEFAULT 'Confirmed',
                        ""ConfirmationCode"" text NULL,
                        ""AgentNotes"" text NULL
                    );
                    ALTER TABLE ""CollectionBookings"" ADD COLUMN IF NOT EXISTS ""ApplicationCode"" text NULL;
                    ALTER TABLE ""CollectionBookings"" ADD COLUMN IF NOT EXISTS ""DepartmentName"" text NULL;
                    ALTER TABLE ""CollectionBookings"" ADD COLUMN IF NOT EXISTS ""ServiceName"" text NULL;
                    ALTER TABLE ""CollectionBookings"" ADD COLUMN IF NOT EXISTS ""BookedDate"" date NULL;
                    ALTER TABLE ""CollectionBookings"" ADD COLUMN IF NOT EXISTS ""BookedSlotTime"" text NULL;
                    ALTER TABLE ""CollectionBookings"" ADD COLUMN IF NOT EXISTS ""Status"" text NOT NULL DEFAULT 'Confirmed';
                    ALTER TABLE ""CollectionBookings"" ADD COLUMN IF NOT EXISTS ""ConfirmationCode"" text NULL;
                    ALTER TABLE ""CollectionBookings"" ADD COLUMN IF NOT EXISTS ""AgentNotes"" text NULL;
                ";
                await cmd.ExecuteNonQueryAsync();

                int appId = 0;
                if (!string.IsNullOrWhiteSpace(req.ApplicationId))
                {
                    int.TryParse(req.ApplicationId.Replace("APP-", ""), out appId);
                }

                DateTime? parsedDateVal = null;
                if (!string.IsNullOrWhiteSpace(res.BookedDate))
                {
                    if (DateTime.TryParse(res.BookedDate, out var dt))
                    {
                        parsedDateVal = dt.Date;
                    }
                    else
                    {
                        var parts = res.BookedDate.Split(',');
                        if (parts.Length > 1 && DateTime.TryParse(parts[1].Trim(), out var dt2))
                        {
                            parsedDateVal = dt2.Date;
                        }
                    }
                }

                using var insertCmd = conn.CreateCommand();
                insertCmd.CommandText = existingBookingId != null
                    ? @"
                    UPDATE ""CollectionBookings""
                    SET ""CitizenNic"" = @nic, ""PreferredTimes"" = @prefTimes, ""DepartmentName"" = @dept, ""BookedDate"" = @bookedDate,
                        ""BookedSlotTime"" = @slot, ""ConfirmationCode"" = @code, ""AgentNotes"" = @notes
                    WHERE ""Id"" = @existingId;
                    UPDATE ""CollectionBookings"" SET ""Status"" = 'Cancelled'
                    WHERE ""Status"" = 'Confirmed' AND UPPER(""ApplicationCode"") = UPPER(@appCode) AND ""Id"" <> @existingId;"
                    : @"
                    INSERT INTO ""CollectionBookings""
                    (""ApplicationId"", ""ApplicationCode"", ""CitizenNic"", ""CollectionMethod"", ""PreferredTimes"", ""DepartmentName"", ""ServiceName"", ""BookedDate"", ""BookedSlotTime"", ""Status"", ""ConfirmationCode"", ""AgentNotes"", ""CreatedAt"")
                    VALUES
                    (@appId, @appCode, @nic, 'Appointment', @prefTimes, @dept, @srv, @bookedDate, @slot, 'Confirmed', @code, @notes, CURRENT_TIMESTAMP);
                ";
                var p1 = insertCmd.CreateParameter(); p1.ParameterName = "@appId"; p1.Value = appId; insertCmd.Parameters.Add(p1);
                var p2 = insertCmd.CreateParameter(); p2.ParameterName = "@appCode"; p2.Value = req.ApplicationId ?? "APP-0000"; insertCmd.Parameters.Add(p2);
                var p3 = insertCmd.CreateParameter(); p3.ParameterName = "@nic"; p3.Value = req.CitizenNic ?? "CITIZEN"; insertCmd.Parameters.Add(p3);
                var p4 = insertCmd.CreateParameter(); p4.ParameterName = "@prefTimes"; p4.Value = req.PreferredTimeInput; insertCmd.Parameters.Add(p4);
                var p5 = insertCmd.CreateParameter(); p5.ParameterName = "@dept"; p5.Value = deptName; insertCmd.Parameters.Add(p5);
                var p6 = insertCmd.CreateParameter(); p6.ParameterName = "@srv"; p6.Value = req.ServiceName ?? "Government Service"; insertCmd.Parameters.Add(p6);
                var pDate = insertCmd.CreateParameter(); pDate.ParameterName = "@bookedDate"; pDate.Value = (object?)parsedDateVal ?? DBNull.Value; insertCmd.Parameters.Add(pDate);
                var p7 = insertCmd.CreateParameter(); p7.ParameterName = "@slot"; p7.Value = $"{res.BookedDate} {res.BookedTime}"; insertCmd.Parameters.Add(p7);
                var p8 = insertCmd.CreateParameter(); p8.ParameterName = "@code"; p8.Value = res.ConfirmationCode ?? "SL-APT-0000"; insertCmd.Parameters.Add(p8);
                var p9 = insertCmd.CreateParameter(); p9.ParameterName = "@notes"; p9.Value = res.AgentReasoning; insertCmd.Parameters.Add(p9);
                if (existingBookingId != null)
                {
                    // The second statement also cancels older duplicates for the same application
                    var p10 = insertCmd.CreateParameter(); p10.ParameterName = "@existingId"; p10.Value = existingBookingId.Value; insertCmd.Parameters.Add(p10);
                }

                await insertCmd.ExecuteNonQueryAsync();

                // Create citizen in-app notification
                _context.CitizenNotifications.Add(new CitizenNotification
                {
                    CitizenNic = req.CitizenNic ?? "CITIZEN",
                    Type = "AppointmentConfirmed",
                    Title = existingBookingId != null ? "Collection Appointment Rescheduled" : "Collection Appointment Confirmed",
                    Message = existingBookingId != null
                        ? $"Your collection appointment for {req.ServiceName} at {deptName} has been moved to {res.BookedDate} ({res.BookedTime}). Reference: {res.ConfirmationCode}."
                        : $"Your collection appointment for {req.ServiceName} at {deptName} has been booked for {res.BookedDate} ({res.BookedTime}). Reference: {res.ConfirmationCode}.",
                    CreatedAt = DateTime.UtcNow
                });
                await _context.SaveChangesAsync();
            }
            finally
            {
                if (wasClosed) await conn.CloseAsync();
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[Agent3 PersistBooking] {ex.Message}");
        }
    }
}

public class AppointmentBookingRequestDto
{
    public string ApplicationId { get; set; } = string.Empty;
    public string ServiceName { get; set; } = string.Empty;
    public string? CitizenNic { get; set; } = "CITIZEN";
    public string PreferredTimeInput { get; set; } = string.Empty;
    public string? DepartmentName { get; set; }
    public int? ServiceProcedureId { get; set; }
    public int? Stage { get; set; }
}

public class ActionAgentQueryDto
{
    public int ApplicationId { get; set; }
    public int ServiceProcedureId { get; set; }
    public string ServiceName { get; set; } = string.Empty;
    public string CitizenNic { get; set; } = string.Empty;
    public string FullName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public int Age { get; set; }
    public string CitizenshipStatus { get; set; } = "Sri Lankan";
    public decimal AnnualIncome { get; set; }
    public string EmploymentStatus { get; set; } = string.Empty;
    public List<string>? ProvidedDocuments { get; set; } = new();
    public Dictionary<string, string>? AdditionalAttributes { get; set; } = new();
    public DateTime? PreferredAppointmentDateUtc { get; set; }
    public bool ExpressProcessing { get; set; }
    public string? PlanSummary { get; set; }
    public int? Stage { get; set; }

    /// <summary>Optional Agent 2 output; when omitted, Agent 2 is invoked first.</summary>
    public EligibilityPlanResponse? Eligibility { get; set; }
}
