using System.ComponentModel.DataAnnotations;

namespace Government_Service_Navigator.Backend.DTOs.Requests
{
    public class SubmitApplicationRequest
    {
        [Required]
        public int ServiceProcedureId { get; set; }

        public int? ApplicationId { get; set; }
        public Guid? TemplateId { get; set; }

        // Answers keyed by FormField label.
        public Dictionary<string, string> Answers { get; set; } = new();

        // "file" field label -> id returned by POST api/Applications/documents.
        public Dictionary<string, Guid> Documents { get; set; } = new();
    }
}
