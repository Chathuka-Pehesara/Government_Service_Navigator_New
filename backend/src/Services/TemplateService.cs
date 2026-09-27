using Government_Service_Navigator.Backend.Data.Context;
using Government_Service_Navigator.Backend.DTOs.Requests;
using Government_Service_Navigator.Backend.Models.Entities;
using Government_Service_Navigator.Backend.Services.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace Government_Service_Navigator.Backend.Services
{
    public class TemplateService: ITemplateService
    {
        private readonly AppDbContext _context;
        public TemplateService(AppDbContext context) 
        {
            _context = context;
        }
        public async Task<Template>CreateTemplateAsync(CreateTemplateRequest request)
        {
            var template = new Template
            {
                FormName = request.FormName,
                SubTitle = request.SubTitle,
                LawText = request.LawText,
                ServiceProcedureId = request.ServiceProcedureId,
                Department = request.Department,
                StageOrder = request.StageOrder,
                StageDescription = request.StageDescription,
                Status = !string.IsNullOrWhiteSpace(request.Status) ? request.Status : "Active",
                Fields = request.Fields.Select((f, index) => new FormField
                {
                    Label = f.Label,
                    Type = f.Type,
                    Options = f.Options,
                    IsRequired = f.Required ?? false,
                    OrderIndex = index 
                }).ToList()
            };
            _context.Templates.Add(template);
            await _context.SaveChangesAsync();
            return template;
        }
        public async Task<IEnumerable<Template>> GetAllTemplatesAsync()
        {
            return await _context.Templates
                .Include(t => t.Fields.OrderBy(f=> f.OrderIndex))
                .Include(t => t.ServiceProcedure)
                .OrderBy(t => t.StageOrder)
                .ToListAsync();
        }
        public async Task<Template?> GetTemplateByIdAsync(Guid id)
        {
            return await _context.Templates
                .Include(t => t.Fields.OrderBy(f => f.OrderIndex))
                .Include(t => t.ServiceProcedure)
                .FirstOrDefaultAsync(t => t.Id == id);
        }
        public async Task<IEnumerable<Template>> GetTemplatesByServiceAsync(int serviceProcedureId)
        {
            return await _context.Templates
                .Include(t => t.Fields.OrderBy(f => f.OrderIndex))
                .Include(t => t.ServiceProcedure)
                .Where(t => t.ServiceProcedureId == serviceProcedureId)
                .OrderBy(t => t.StageOrder)
                .ToListAsync();
        }
        public async Task<Template> UpdateTemplateAsync(Guid id, CreateTemplateRequest request)
        {
            var template = await _context.Templates.Include(t => t.Fields).FirstOrDefaultAsync(t => t.Id == id);
            if (template == null) throw new Exception("Template not found");

            template.FormName = request.FormName;
            template.SubTitle = request.SubTitle;
            template.LawText = request.LawText;
            template.ServiceProcedureId = request.ServiceProcedureId;
            template.Department = request.Department;
            template.StageOrder = request.StageOrder;
            template.StageDescription = request.StageDescription;
            if (!string.IsNullOrWhiteSpace(request.Status))
            {
                template.Status = request.Status;
            }

            _context.FormFields.RemoveRange(template.Fields);
            
            var newFields = request.Fields.Select((f, index) => new FormField
            {
                TemplateId = template.Id,
                Label = f.Label,
                Type = f.Type,
                Options = f.Options,
                IsRequired = f.Required ?? false,
                OrderIndex = index
            }).ToList();
            
            _context.FormFields.AddRange(newFields);

            await _context.SaveChangesAsync();

            return await GetTemplateByIdAsync(id) ?? template;
        }

        public async Task<Template> UpdateTemplateStatusAsync(Guid id, string status)
        {
            var allowedStatuses = new[] { "Active", "Inactive", "Draft" };
            if (!allowedStatuses.Contains(status))
                throw new ArgumentException($"Invalid status '{status}'. Allowed values: {string.Join(", ", allowedStatuses)}");

            var template = await _context.Templates.FirstOrDefaultAsync(t => t.Id == id);
            if (template == null) throw new Exception("Template not found");

            template.Status = status;
            await _context.SaveChangesAsync();

            return template;
        }

        public async Task<bool> DeleteTemplateAsync(Guid id)
        {
            var template = await _context.Templates.FirstOrDefaultAsync(t => t.Id == id);
            if (template == null) return false;

            _context.Templates.Remove(template);
            await _context.SaveChangesAsync();
            return true;
        }
    }
}