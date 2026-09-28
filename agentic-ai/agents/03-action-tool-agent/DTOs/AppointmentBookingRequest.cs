namespace Government_Service_Navigator.AgenticAi.Agents.ActionToolAgent.DTOs;

public record DepartmentSlotInfo(
    int Id,
    int DayOfWeek,
    string StartTime,
    string EndTime,
    int MaxCapacity,
    int BookedCount,
    bool IsActive,
    string? DepartmentName = null
);

public record AppointmentBookingRequest(
    string ApplicationId,
    string ServiceName,
    string CitizenNic,
    string PreferredTimeInput,
    string? DepartmentName = null,
    int? ServiceProcedureId = null,
    int? Stage = null,
    IReadOnlyList<DepartmentSlotInfo>? ConfiguredSlots = null
);
