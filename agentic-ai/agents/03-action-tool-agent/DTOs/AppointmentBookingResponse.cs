using System.Collections.Generic;

namespace Government_Service_Navigator.AgenticAi.Agents.ActionToolAgent.DTOs;

public record SuggestedTimeSlot(
    string TimeSlot,
    string DisplayText,
    string DateString
);

public record AppointmentBookingResponse(
    bool Success,
    bool IsBooked,
    string? ConfirmationCode,
    string? BookedDate,
    string? BookedTime,
    string DepartmentName,
    string? DepartmentContact,
    string? DepartmentAddress,
    List<SuggestedTimeSlot> SuggestedSlots,
    string Message,
    string AgentReasoning,
    int? BookingId = null
);
