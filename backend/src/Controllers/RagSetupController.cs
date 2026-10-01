using AgenticAi.Agents.IntakePlanningAgent;
using Backend.Data;
using Government_Service_Navigator.Backend.Data;
using Government_Service_Navigator.AgenticAi.Agents.ActionToolAgent.Retrieval;
using Government_Service_Navigator.Backend.Data.Context;
using Government_Service_Navigator.Backend.Services.Interfaces;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Government_Service_Navigator.Backend.Controllers;

[ApiController]
[Route("api/[controller]")]
public class RagSetupController : ControllerBase
{
    private readonly VectorDbContext _vectorDb;
    private readonly IEmbeddingService _embeddingService;
    private readonly IServiceCatalogService _catalogService;
    private readonly AppDbContext _appDb;

    public RagSetupController(
        VectorDbContext vectorDb, 
        IEmbeddingService embeddingService, 
        IServiceCatalogService catalogService,
        AppDbContext appDb)
    {
        _vectorDb = vectorDb;
        _embeddingService = embeddingService;
        _catalogService = catalogService;
        _appDb = appDb;
    }

    [HttpPost("seed")]
    public async Task<IActionResult> SeedDatabase()
    {
        // 1. Wipe out the old catalog chunks (Agent 3's ActionTool:* chunks are re-seeded separately)
        _vectorDb.KnowledgeChunks.RemoveRange(
            _vectorDb.KnowledgeChunks.Where(c => !c.SourceCategory.StartsWith(ActionKnowledgeCategories.Prefix)));
        await _vectorDb.SaveChangesAsync();

        // 2. Fetch live data from your actual relational database
        var activeServices = await _catalogService.GetAllServicesAsync();
        int seededCount = 0;

        foreach (var service in activeServices)
        {
            // Fetch the full details to ensure we get the nested Documents and Fees
            var fullService = await _catalogService.GetServiceByIdAsync(service.Id);
            if (fullService == null) continue;

            // 3. Extract exact properties: DocumentName and Name
            var docText = fullService.DocumentRequirements != null && fullService.DocumentRequirements.Any()
                ? string.Join(", ", fullService.DocumentRequirements.Select(d => d.DocumentName))
                : "No specific documents required";

            var feeText = fullService.FeeSchedules != null && fullService.FeeSchedules.Any()
                ? string.Join(", ", fullService.FeeSchedules.Select(f => $"LKR {f.Amount} for {f.FeeType}"))
                : "Free of charge";

            var docChunk = $"{fullService.Name} ({fullService.Category}): To apply for this service, citizens must provide the following documents: {docText}. The applicable fees are: {feeText}.";

            // 4. Create the vector embedding and save to Neon
            var vector = await _embeddingService.GetEmbeddingAsync(docChunk);
            
            _vectorDb.KnowledgeChunks.Add(new KnowledgeChunk
            {
                Content = docChunk,
                SourceCategory = fullService.Category ?? "General Procedure",
                Embedding = vector
            });
            
            seededCount++;
        }

        await _vectorDb.SaveChangesAsync();
        return Ok($"Successfully synchronized {seededCount} live catalog services into the VectorDb.");
    }

    /// <summary>
    /// Vectorizes the knowledge the Action/Tool Agent (Agent 3) retrieves: per-service fee schedules,
    /// application form templates and the appointment policy. Re-running replaces only ActionTool:* chunks.
    /// </summary>
    [HttpPost("seed-action-agent")]
    public async Task<IActionResult> SeedActionAgentKnowledge()
    {
        // 1. Remove previous Agent 3 chunks only
        _vectorDb.KnowledgeChunks.RemoveRange(
            _vectorDb.KnowledgeChunks.Where(c => c.SourceCategory.StartsWith(ActionKnowledgeCategories.Prefix)));
        await _vectorDb.SaveChangesAsync();

        var chunks = new List<(string Category, string Content)>();

        // 2. Fee schedule chunks (one per service)
        var services = await _catalogService.GetAllServicesAsync();
        foreach (var service in services)
        {
            var fees = service.FeeSchedules.Any()
                ? string.Join("; ", service.FeeSchedules.Select(f =>
                    $"{f.FeeType}: LKR {f.Amount:N2}" + (f.EffectiveDate != default ? $" effective from {f.EffectiveDate:yyyy-MM-dd}" : "")))
                : "no fee is charged (free of charge)";

            chunks.Add((ActionKnowledgeCategories.Fees,
                $"Fee schedule for {service.Name} ({service.ServiceId}, {service.Category}, service procedure ID {service.Id}): {fees}. " +
                "Express, urgent or one-day fees apply only when the citizen requests faster processing."));
        }

        // 3. Application form template chunks (one per active template linked to a service)
        var templates = await _appDb.Templates
            .Include(t => t.Fields)
            .Include(t => t.ServiceProcedure)
            .Where(t => t.Status == "Active" && t.ServiceProcedureId != null)
            .ToListAsync();

        foreach (var template in templates)
        {
            var fieldText = template.Fields.Any()
                ? string.Join("; ", template.Fields.OrderBy(f => f.OrderIndex).Select(f =>
                    $"{f.Label} ({f.Type}{(f.IsRequired ? ", required" : ", optional")}{(string.IsNullOrWhiteSpace(f.Options) ? "" : $", options: {f.Options}")})"))
                : "no fields defined";

            chunks.Add((ActionKnowledgeCategories.FormTemplate,
                $"Application form '{template.FormName}' for {template.ServiceProcedure?.Name ?? "service"} (service procedure ID {template.ServiceProcedureId}). " +
                $"Fields: {fieldText}." + (string.IsNullOrWhiteSpace(template.LawText) ? "" : $" Legal basis: {template.LawText}")));
        }

        // 4. Appointment policy chunk (mirrors FindAppointmentSlotTool)
        chunks.Add((ActionKnowledgeCategories.AppointmentPolicy,
            "Appointment policy: counter appointments are offered Monday to Friday between 09:00 and 15:00 Sri Lanka Time in 30-minute slots, " +
            "at least 2 working days after the draft is prepared. A proposed slot is only reserved after a Verifying Officer approves the application."));

        // 5. Embed and store in the vector DB
        foreach (var (category, content) in chunks)
        {
            var vector = await _embeddingService.GetEmbeddingAsync(content);
            _vectorDb.KnowledgeChunks.Add(new KnowledgeChunk
            {
                Content = content,
                SourceCategory = category,
                Embedding = vector
            });
        }

        await _vectorDb.SaveChangesAsync();
        return Ok($"Vectorized {chunks.Count} Action/Tool Agent knowledge chunks into the VectorDb.");
    }

    [HttpPost("upload-policy")]
    public async Task<IActionResult> UploadPolicy(
        [FromForm] int serviceProcedureId,
        [FromForm] string documentTitle,
        [FromForm] string? policyText,
        [FromForm] IFormFile? file)
    {
        var service = await _appDb.ServiceProcedures.FindAsync(serviceProcedureId);
        if (service == null) return NotFound("Service procedure not found.");

        string text = policyText ?? string.Empty;
        if (file != null && file.Length > 0)
        {
            using var reader = new StreamReader(file.OpenReadStream());
            text = await reader.ReadToEndAsync();
        }

        if (string.IsNullOrWhiteSpace(text))
            return BadRequest("Document content or policy text must be provided.");

        var rawParagraphs = text.Split(new[] { "\r\n\r\n", "\n\n", "### " }, StringSplitOptions.RemoveEmptyEntries);
        var chunks = new List<string>();

        foreach (var p in rawParagraphs)
        {
            var cleaned = p.Trim();
            if (cleaned.Length < 35) continue;

            if (cleaned.Length > 1200)
            {
                for (int i = 0; i < cleaned.Length; i += 1000)
                {
                    int len = Math.Min(1000, cleaned.Length - i);
                    chunks.Add($"[{service.Name} - {documentTitle}]: " + cleaned.Substring(i, len));
                }
            }
            else
            {
                chunks.Add($"[{service.Name} - {documentTitle}]: " + cleaned);
            }
        }

        if (chunks.Count == 0)
        {
            chunks.Add($"[{service.Name} - {documentTitle}]: " + text.Trim());
        }

        var categoryTag = $"Service:{service.Id}:{service.ServiceId}";

        int added = 0;
        foreach (var chunk in chunks)
        {
            var embedding = await _embeddingService.GetEmbeddingAsync(chunk);
            _vectorDb.KnowledgeChunks.Add(new KnowledgeChunk
            {
                Content = chunk,
                SourceCategory = categoryTag,
                Embedding = embedding
            });
            added++;
        }

        await _vectorDb.SaveChangesAsync();
        return Ok(new
        {
            message = $"Successfully vectorized {added} knowledge chunks for {service.Name} into Neon Vector DB.",
            serviceId = service.ServiceId,
            serviceName = service.Name,
            chunksCount = added,
            sampleChunk = chunks.FirstOrDefault()
        });
    }

    [HttpGet("service-knowledge/{serviceProcedureId}")]
    public async Task<IActionResult> GetServiceKnowledge(int serviceProcedureId)
    {
        var service = await _appDb.ServiceProcedures.FindAsync(serviceProcedureId);
        if (service == null) return NotFound("Service not found.");

        var categoryTag = $"Service:{service.Id}:{service.ServiceId}";
        var chunks = await _vectorDb.KnowledgeChunks
            .Where(c => c.SourceCategory == categoryTag || c.Content.Contains(service.Name))
            .Select(c => new { c.Id, c.Content, c.SourceCategory })
            .ToListAsync();

        return Ok(chunks);
    }

    [HttpDelete("service-knowledge/{serviceProcedureId}")]
    public async Task<IActionResult> ClearServiceKnowledge(int serviceProcedureId)
    {
        var service = await _appDb.ServiceProcedures.FindAsync(serviceProcedureId);
        if (service == null) return NotFound("Service not found.");

        var categoryTag = $"Service:{service.Id}:{service.ServiceId}";
        var chunks = await _vectorDb.KnowledgeChunks
            .Where(c => c.SourceCategory == categoryTag)
            .ToListAsync();

        _vectorDb.KnowledgeChunks.RemoveRange(chunks);
        await _vectorDb.SaveChangesAsync();

        return Ok(new { message = $"Cleared {chunks.Count} knowledge chunks for {service.Name}." });
    }

    [HttpPost("ingest-local-documents")]
    public async Task<IActionResult> IngestLocalDocuments()
    {
        var docDir = Path.Combine(AppContext.BaseDirectory, "Data", "KnowledgeDocuments");
        if (!Directory.Exists(docDir))
        {
            docDir = Path.Combine(Directory.GetCurrentDirectory(), "src", "Data", "KnowledgeDocuments");
            if (!Directory.Exists(docDir))
            {
                docDir = Path.Combine(Directory.GetCurrentDirectory(), "Data", "KnowledgeDocuments");
            }
        }

        if (!Directory.Exists(docDir))
            return NotFound($"Knowledge documents directory not found at: {docDir}");

        var files = Directory.GetFiles(docDir, "*.md");
        var results = new List<string>();

        foreach (var file in files)
        {
            var fileName = Path.GetFileName(file);
            var baseName = Path.GetFileNameWithoutExtension(fileName).ToLowerInvariant();

            // Match dynamically against active catalog by ServiceId or procedure Name
            var allProcedures = await _appDb.ServiceProcedures.ToListAsync();
            var service = allProcedures.FirstOrDefault(s =>
                (!string.IsNullOrEmpty(s.ServiceId) && baseName.Contains(s.ServiceId.ToLowerInvariant())) ||
                (!string.IsNullOrEmpty(s.Name) && (baseName.Contains(s.Name.ToLowerInvariant()) || s.Name.ToLowerInvariant().Contains(baseName)))
            );

            // Keyword fallback for legacy document names
            if (service == null)
            {
                service = baseName switch
                {
                    var f when f.Contains("passport") => allProcedures.FirstOrDefault(s => s.ServiceId == "GSN-IMM-001" || s.Name.Contains("Passport")),
                    var f when f.Contains("driving") => allProcedures.FirstOrDefault(s => s.ServiceId == "GSN-DMT-002" || s.Name.Contains("Driving")),
                    var f when f.Contains("police") => allProcedures.FirstOrDefault(s => s.ServiceId == "GSN-POL-003" || s.Name.Contains("Police")),
                    var f when f.Contains("business") => allProcedures.FirstOrDefault(s => s.ServiceId == "GSN-COM-004" || s.Name.Contains("Business")),
                    var f when f.Contains("death") => allProcedures.FirstOrDefault(s => s.ServiceId == "GSN-CIV-005" || s.Name.Contains("Death")),
                    _ => null
                };
            }

            if (service == null) continue;

            var content = await System.IO.File.ReadAllTextAsync(file);
            var title = Path.GetFileNameWithoutExtension(fileName).Replace('_', ' ');

            var paragraphs = content.Split(new[] { "\r\n\r\n", "\n\n", "### " }, StringSplitOptions.RemoveEmptyEntries);
            int count = 0;
            var categoryTag = $"Service:{service.Id}:{service.ServiceId}";

            var existing = await _vectorDb.KnowledgeChunks.Where(c => c.SourceCategory == categoryTag).ToListAsync();
            _vectorDb.KnowledgeChunks.RemoveRange(existing);

            foreach (var p in paragraphs)
            {
                var cleaned = p.Trim();
                if (cleaned.Length < 35) continue;

                var chunkText = $"[{service.Name} - {title}]: " + cleaned;
                var emb = await _embeddingService.GetEmbeddingAsync(chunkText);
                _vectorDb.KnowledgeChunks.Add(new KnowledgeChunk
                {
                    Content = chunkText,
                    SourceCategory = categoryTag,
                    Embedding = emb
                });
                count++;
            }
            await _vectorDb.SaveChangesAsync();
            results.Add($"Ingested {count} chunks for {service.Name} from {fileName}");
        }

        return Ok(new { message = "Local government knowledge documents ingested successfully into Neon Vector.", details = results });
    }
}
