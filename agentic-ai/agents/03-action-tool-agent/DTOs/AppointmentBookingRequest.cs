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

/// <summary>Confirmed bookings for one weekly slot on one calendar date.</summary>
public record SlotDateUsage(int SlotId, DateTime Date, int Count);

public record AppointmentBookingRequest(
    string ApplicationId,
    string ServiceName,
    string CitizenNic,
    string PreferredTimeInput,
    string? DepartmentName = null,
    int? ServiceProcedureId = null,
    int? Stage = null,
    IReadOnlyList<DepartmentSlotInfo>? ConfiguredSlots = null,
    // Per-date usage. Slots repeat weekly, so capacity is only meaningful for a specific date;
    // when this is null the slot's own BookedCount is used.
    IReadOnlyList<SlotDateUsage>? DateUsage = null
);
